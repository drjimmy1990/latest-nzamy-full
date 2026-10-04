/**
 * resolveAuthOutcome — tell "not signed in" apart from "could not ask".
 *
 * `supabase.auth.getUser()` is a NETWORK round trip to the Auth server. Every
 * gate in this codebase used to write it as `if (authError || !user) → 401`,
 * which reports a TLS failure, a DNS failure or a dropped packet as "this
 * visitor is anonymous". That is the single defect behind UAT-LIVE-SESSION-001
 * (a signed-in lawyer bounced to /login?from=… and `Unauthorized` from
 * POST /api/v1/service-requests) and the reason UAT-ENV-001 — an untrusted
 * intercepting-proxy CA on the server runtime — was first misdiagnosed as a
 * session bug. See docs/audits/2026-09-20-profiles-uat/02-auth-session-audit.md
 * §3 and hypothesis H1.
 *
 * Three outcomes, and the caller owes each a different answer:
 *   • "ok"          → a user object came back. Continue.
 *   • "anonymous"   → no user, and the failure is a definitive statement about
 *                     the session (bad/absent/expired token). 401 / redirect.
 *   • "unavailable" → no user, and we never got an answer at all. 503 with
 *                     AUTH_UNAVAILABLE_AR; NEVER 401, never a login redirect —
 *                     signing the user out over a dropped packet is the bug.
 *
 * Pure and dependency-free on purpose (no `next/server`, no supabase types) so
 * it is importable from the edge proxy, route handlers, server components and
 * `node --test` alike. See resolveAuthOutcome.test.ts.
 */

/** Arabic copy for the 503 every `unavailable` gate returns. */
export const AUTH_UNAVAILABLE_AR = "تعذّر التحقق من الجلسة حالياً، حاول بعد قليل";

export type AuthOutcome = "ok" | "anonymous" | "unavailable";

/**
 * The shape this module needs from a Supabase `AuthError`. Structural, not the
 * imported class: `AuthRetryableFetchError` is identified by `name`, exactly as
 * supabase-js itself serialises it across the network/worker boundary.
 */
export interface AuthErrorLike {
  name?: string;
  status?: number;
  message?: string;
}

/**
 * Message fragments that only ever come from the transport, never from the Auth
 * server rejecting a token. `certificate` / `UNABLE_TO_VERIFY` are the
 * UAT-ENV-001 class (an intercepting proxy whose root CA the Node runtime does
 * not trust — the fix is NODE_EXTRA_CA_CERTS, never disabling verification).
 */
const TRANSPORT_MESSAGE =
  /fetch failed|ECONNREFUSED|ENOTFOUND|certificate|UNABLE_TO_VERIFY|network/i;

/** True when `error` describes a failure to REACH Auth rather than a verdict from it. */
export function isTransportFailure(error: AuthErrorLike | null | undefined): boolean {
  if (!error) return false;

  // supabase-js names every retryable fetch failure this.
  if (error.name === "AuthRetryableFetchError") return true;

  // No HTTP status means no HTTP response: the request never completed.
  // A real auth rejection always carries one (400/401/403/422).
  if (error.status === undefined || error.status === 0) return true;

  return TRANSPORT_MESSAGE.test(error.message ?? "");
}

/**
 * @param user  whatever `data.user` came back as — any truthy object is a user.
 * @param error whatever `error` came back as, or null/undefined.
 */
export function resolveAuthOutcome(
  user: unknown,
  error?: AuthErrorLike | null,
): AuthOutcome {
  // A user object present alongside a stale error is still a signed-in user:
  // the old `authError || !user` spelling threw those sessions away.
  if (user) return "ok";

  return isTransportFailure(error) ? "unavailable" : "anonymous";
}
