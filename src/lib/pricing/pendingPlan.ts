/**
 * pendingPlan.ts — keeps the plan a guest chose on /pricing across a Google
 * sign-up (fix plan 2026-10-16, N5 remainder).
 *
 * The e-mail sign-up on /register/client reads `?plan=` and offers the plan
 * request on its last step. A Google sign-up leaves the page instead:
 * /register/client → GoTrue → Google → /auth/callback → /onboarding, and the
 * query string is gone. Carrying it on the OAuth `redirectTo` was rejected on
 * purpose: the self-hosted GoTrue checks `redirectTo` against its redirect
 * allow-list, and a URL it does not accept breaks Google sign-in silently. So
 * `redirectTo` stays exactly `<origin>/auth/callback`, and the plan id waits in
 * this tab's sessionStorage instead — written just before the OAuth call, read
 * on the onboarding wizard's last step, then cleared.
 *
 * Everything here is best-effort. Storage can be missing or throw (private
 * mode, blocked site data); then nothing is saved, nothing is read, and the
 * sign-in itself is untouched. A stale value expires after
 * PENDING_PLAN_TTL_MS. The value is only an id: what it may become is decided
 * later by resolveRequestedPlan (planRequest.ts) against the plans the new
 * account's type can actually request.
 *
 * No `@/` imports and no runtime imports: `node --test` loads this file
 * directly (pendingPlan.test.ts).
 */

export const PENDING_PLAN_KEY = "nzamy.pendingPlan";

/** Long enough for a Google sign-in plus the onboarding wizard. */
export const PENDING_PLAN_TTL_MS = 30 * 60 * 1000;

/** The shape of a Plan.id (`ind-ai`, `micro-shield`, `lib-q1` …). */
const PLAN_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** The slice of the Web Storage API used here. */
export interface PlanStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** This tab's sessionStorage, or null when there is none or it cannot be reached. */
export function sessionStorageOrNull(): PlanStorage | null {
  try {
    const storage = (globalThis as { sessionStorage?: PlanStorage }).sessionStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

/** Saves `plan` (trimmed) when it looks like a plan id. Returns whether it was saved. */
export function savePendingPlan(
  storage: PlanStorage | null | undefined,
  plan: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const id = plan?.trim();
  if (!storage || !id || !PLAN_ID_RE.test(id)) return false;
  try {
    storage.setItem(PENDING_PLAN_KEY, JSON.stringify({ plan: id, at: now }));
    return true;
  } catch {
    return false;
  }
}

/** The saved plan id, or null when there is none, it is malformed or it has expired. */
export function readPendingPlan(
  storage: PlanStorage | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(PENDING_PLAN_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { plan, at } = parsed as { plan?: unknown; at?: unknown };
  if (typeof plan !== "string" || !PLAN_ID_RE.test(plan)) return null;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  if (now < at || now - at > PENDING_PLAN_TTL_MS) return null;
  return plan;
}

export function clearPendingPlan(storage: PlanStorage | null | undefined): void {
  try {
    storage?.removeItem(PENDING_PLAN_KEY);
  } catch {
    // Nothing to do: a value we cannot remove also cannot be read back.
  }
}

/** The /pricing audiences a client account can sign up from. */
export type ClientPlanAudience = "individuals" | "companies" | "micro" | "government" | "ngo";

/**
 * The /pricing audience whose plans a `profiles.user_type` can request — the
 * database-type twin of /register/client's AUDIENCE_BY_CLIENT_TYPE (which is
 * keyed by its own picker ids: `company`, not `corporate`). Lawyer, firm and
 * provider plans are not sold through /register/client, so they have none.
 */
export function planAudienceForUserType(userType: string | null | undefined): ClientPlanAudience | null {
  switch (userType) {
    case "individual": return "individuals";
    case "corporate": return "companies";
    case "micro": return "micro";
    case "government": return "government";
    case "ngo": return "ngo";
    default: return null;
  }
}
