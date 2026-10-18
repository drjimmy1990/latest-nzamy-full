/**
 * The library subscription as its own grant (owner answers ١٩٩ / ٢٠١–٢٠٣,
 * decisions of 2026-10-18): public.library_access_grants, created by
 * supabase/migrations/20261019_10_library_access_grants.sql.
 *
 * This file is the pure half: the plan and source names the table's CHECK
 * constraints allow, the fixed length of the three paid plans, the half-open
 * window test, the date math of a new grant (which extends the current one),
 * the plan and length an approved
 * request or a colleague invitation grants, and the grant's end date in
 * Arabic. The IO half (reading and
 * writing the table with the service client) is ./libraryAccessServer.ts.
 *
 * Relative imports only: `node --test` loads this file (libraryAccess.test.ts).
 */

/** The plan_ref values the table's CHECK constraint allows. */
export type LibraryPlanRef =
  | 'lib-q1'
  | 'lib-q2'
  | 'lib-annual'
  | 'lib-invite'
  | 'lib-trial'
  | 'lib-founder'
  | 'lib-admin';

/** The source values the table's CHECK constraint allows. */
export type LibraryGrantSource = 'request' | 'invite_code' | 'colleague_invite' | 'founder_campaign' | 'admin';

/**
 * The paid library plans with a fixed length, in days. The other plan refs
 * (invite, trial, founder, admin) take their length from the caller.
 */
export const LIBRARY_PLAN_DAYS = { 'lib-q1': 90, 'lib-q2': 180, 'lib-annual': 365 } as const;

/** The length of a paid library plan, or null for anything that is not one. */
export function libraryPlanDays(ref: unknown): number | null {
  if (typeof ref !== 'string') return null;
  if (!Object.prototype.hasOwnProperty.call(LIBRARY_PLAN_DAYS, ref)) return null;
  return LIBRARY_PLAN_DAYS[ref as keyof typeof LIBRARY_PLAN_DAYS];
}

/**
 * True when `now` falls inside the grant's window: starts_at <= now < ends_at
 * (half-open, the same test the server query runs). An unparseable date is
 * not active.
 */
export function isGrantActive(grant: { starts_at: string; ends_at: string }, now: Date): boolean {
  const s = Date.parse(grant.starts_at);
  const e = Date.parse(grant.ends_at);
  const t = now.getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || !Number.isFinite(t)) return false;
  return s <= t && t < e;
}

export const GRANT_MIN_DAYS = 1;
export const GRANT_MAX_DAYS = 3660;
const DAY_MS = 86_400_000;

/**
 * The window of a grant that starts `now` and lasts `days` whole days, as ISO
 * strings. Null when `days` is not an integer from 1 to 3660, or `now` is an
 * invalid date (toISOString would throw).
 */
export function grantWindow(days: number, now: Date): { startsAt: string; endsAt: string } | null {
  if (!Number.isInteger(days) || days < GRANT_MIN_DAYS || days > GRANT_MAX_DAYS) return null;
  const t = now.getTime();
  if (!Number.isFinite(t)) return null;
  return { startsAt: new Date(t).toISOString(), endsAt: new Date(t + days * DAY_MS).toISOString() };
}

/**
 * The window of a new grant that EXTENDS the user's current access instead of
 * overlapping it (controller ruling, 2026-10-18): it starts at the later of
 * `now` and `latestActiveEnd` — the latest ends_at among the user's grants
 * that end after now — and lasts `days` whole days from there. A
 * `latestActiveEnd` that is not a parseable date string, or is not after
 * `now`, is ignored (the grant starts now). Null when `days` is not an
 * integer from 1 to 3660 or `now` is an invalid date, as for grantWindow.
 */
export function stackedGrantWindow(
  days: number,
  now: Date,
  latestActiveEnd: string | null,
): { startsAt: string; endsAt: string } | null {
  const t = now.getTime();
  if (!Number.isFinite(t)) return null;
  let start = t;
  if (typeof latestActiveEnd === 'string') {
    const end = Date.parse(latestActiveEnd);
    if (Number.isFinite(end) && end > t) start = end;
  }
  return grantWindow(days, new Date(start));
}

/**
 * PostgREST/Postgres codes meaning "20261019_10 has not run here yet": the
 * relation is missing (42P01) or not in PostgREST's schema cache (PGRST205).
 */
export function isMissingLibraryGrantsTable(code: string | undefined): boolean {
  return code === '42P01' || code === 'PGRST205';
}

/** The length of a library request whose ref is not one of the paid plans. */
export const LIBRARY_REQUEST_FALLBACK_DAYS = 90;

/**
 * What an approved `library` entitlement request grants (owner ٢٠١–٢٠٣):
 * the requested paid plan under its own name, or 'lib-admin' for any other
 * ref; for the admin's `durationDays` when given, else the plan's real length,
 * else 90 days. `durationDays` undefined or null means "not given"; anything
 * else must be an integer from 1 to 3660, or the answer is `{ ok: false }`.
 */
export function resolveLibraryRequestGrant(
  requestedRef: unknown,
  durationDays: unknown,
): { ok: true; planRef: LibraryPlanRef; days: number } | { ok: false } {
  const planDays = libraryPlanDays(requestedRef);
  const planRef: LibraryPlanRef = planDays === null ? 'lib-admin' : (requestedRef as LibraryPlanRef);
  if (durationDays === undefined || durationDays === null) {
    return { ok: true, planRef, days: planDays ?? LIBRARY_REQUEST_FALLBACK_DAYS };
  }
  if (
    typeof durationDays !== 'number' ||
    !Number.isInteger(durationDays) ||
    durationDays < GRANT_MIN_DAYS ||
    durationDays > GRANT_MAX_DAYS
  ) {
    return { ok: false };
  }
  return { ok: true, planRef, days: durationDays };
}

/** The trial length of a colleague invitation whose trial_days is unusable. */
export const COLLEAGUE_INVITE_FALLBACK_DAYS = 30;

/**
 * The library trial a colleague invitation grants, in days: its own
 * `trial_days` when that is an integer from 1 to 3660, else 30.
 */
export function colleagueInviteTrialDays(trialDays: unknown): number {
  return typeof trialDays === 'number' &&
    Number.isInteger(trialDays) &&
    trialDays >= GRANT_MIN_DAYS &&
    trialDays <= GRANT_MAX_DAYS
    ? trialDays
    : COLLEAGUE_INVITE_FALLBACK_DAYS;
}

/**
 * A grant's end as an Arabic Gregorian date in Riyadh time («١٨ أكتوبر ٢٠٢٧»),
 * whatever timezone the server runs in. Null for a value that is not a
 * parseable date string, never "Invalid Date".
 */
export function libraryEndsAtAr(endsAt: unknown): string | null {
  if (typeof endsAt !== 'string' || endsAt.length === 0) return null;
  const ms = Date.parse(endsAt);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('ar-SA', {
    calendar: 'gregory',
    timeZone: 'Asia/Riyadh',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(ms));
}
