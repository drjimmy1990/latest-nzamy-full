/**
 * startupProbe — what a boot-time Supabase Auth health check MEANS.
 *
 * `src/instrumentation.ts` asks `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`
 * one question at server start: can THIS runtime reach Auth at all? That is
 * the one signal that would have caught UAT-ENV-001 — an intercepting proxy
 * whose root CA the Node runtime does not trust — at boot, instead of as a 503
 * on the first user's first request. See
 * docs/audits/2026-09-20-profiles-uat/02-auth-session-audit.md and the plan's
 * WP-2 item 3.
 *
 * The probe LOGS, it never throws: a blip on the Auth host must not stop the
 * web server from starting, and a server that refuses to boot tells nobody
 * anything. Deciding what to say is this module's job; making the request and
 * calling `console.error` is instrumentation's.
 *
 * Pure and dependency-free on purpose — no `fetch`, no `next/*`, no Supabase —
 * so `node --test` can pin every verdict without a network. See
 * startupProbe.test.ts.
 */

/** The banner every probe line carries, so boot logs can be grepped for it. */
export const AUTH_PROBE_PREFIX = "[startup] Supabase auth health probe";

/**
 * Said when the request never completed. Names the consequence (`getUser()`
 * answers 503 for everyone — resolveAuthOutcome.ts's `"unavailable"`) and the
 * ONLY sanctioned fix for the certificate case: plan ground rule 3 forbids
 * `NODE_TLS_REJECT_UNAUTHORIZED=0` outright.
 */
export const AUTH_PROBE_UNREACHABLE_MESSAGE =
  "[startup] Supabase auth is UNREACHABLE from this runtime — every getUser() will answer 503. " +
  "If this is a certificate error, set NODE_EXTRA_CA_CERTS; never NODE_TLS_REJECT_UNAUTHORIZED=0.";

export interface AuthProbeVerdict {
  /** `"ok"` prints nothing; `"error"` is a `console.error` at boot. */
  level: "ok" | "error";
  message: string;
}

/**
 * @param outcome A `number` is the HTTP status the probe got back. ANY other
 *   value is what `fetch` threw — `catch` hands over `unknown`, and a runtime
 *   may throw an `Error`, a string or nothing at all. There is no third case:
 *   the caller either has a response or has a thrown value.
 */
export function describeAuthProbeResult(outcome: unknown): AuthProbeVerdict {
  if (typeof outcome === "number") {
    // Matches `Response.ok` exactly, so the verdict and `res.ok` can never
    // disagree about the same status.
    if (outcome >= 200 && outcome <= 299) {
      return { level: "ok", message: `${AUTH_PROBE_PREFIX} returned ${outcome}` };
    }
    return { level: "error", message: `${AUTH_PROBE_PREFIX} returned ${outcome}` };
  }

  return { level: "error", message: AUTH_PROBE_UNREACHABLE_MESSAGE };
}
