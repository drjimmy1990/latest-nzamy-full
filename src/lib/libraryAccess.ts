/**
 * The library subscription as its own grant (owner answers ١٩٩ / ٢٠١–٢٠٣,
 * decisions of 2026-10-18): public.library_access_grants, created by
 * supabase/migrations/20261019_10_library_access_grants.sql.
 *
 * This file is the pure half: the plan and source names the table's CHECK
 * constraints allow, the fixed length of the three paid plans, the half-open
 * window test, and the date math of a new grant. The IO half (reading and
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
 * PostgREST/Postgres codes meaning "20261019_10 has not run here yet": the
 * relation is missing (42P01) or not in PostgREST's schema cache (PGRST205).
 */
export function isMissingLibraryGrantsTable(code: string | undefined): boolean {
  return code === '42P01' || code === 'PGRST205';
}
