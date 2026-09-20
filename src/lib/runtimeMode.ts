/**
 * Single source of truth for the backend mode — and for "are we in demo mode?".
 *
 * WHY THIS FILE IS NOW THE ONLY DERIVATION. Five modules used to read
 * `process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND ?? "demo"` for themselves
 * (src/proxy.ts, src/hooks/useUser.ts, src/lib/services/api.ts,
 * src/app/login/page.tsx, src/app/register/client/page.tsx, plus this file).
 * Every one of those defaulted an UNSET variable to `"demo"`, so a deploy that
 * simply forgot the variable did not fail — it quietly served the legacy
 * cookie-name gate, which redirected every genuinely signed-in user to
 * `/login?from=…` because a real Supabase session sets `sb-<ref>-auth-token*`
 * and never `nzamy_session`. That is hypothesis H2 of
 * docs/audits/2026-09-20-profiles-uat/02-auth-session-audit.md, and the
 * redirect string it produces matches the UAT evidence character for character.
 *
 * Three rules now hold, and `resolveBackendMode` below is where all three live
 * so they can be unit-tested without touching `process.env`:
 *   1. An unset variable means "supabase". Never "demo". Missing configuration
 *      must fail towards the real backend, not towards an auth bypass.
 *   2. Demo is possible ONLY when the value is exactly "demo" AND NODE_ENV is
 *      not "production". A production build cannot be talked into demo mode by
 *      any environment value at all.
 *   3. Any other value throws at module load — a typo ("supbase", "Supabase",
 *      "prod") is a misconfiguration, and silently picking a mode for it is
 *      what this file exists to stop.
 *
 * NEXT_PUBLIC_* is inlined into the client bundle at build time. That is fine
 * and intended: `{isDemoUiEnabled && (...)}` subtrees are then
 * dead-code-eliminated from a supabase build, so demo surfaces (role switchers,
 * /demo-login, test-credential login) are not merely hidden in production —
 * they are absent from the bundle.
 *
 * Kept import-free so anything (edge proxy, server components, client
 * components, node --test) can import it without a cycle.
 */

export type BackendMode = "supabase" | "demo";

export interface RuntimeMode {
  backendMode: BackendMode;
  isSupabaseMode: boolean;
  /** True ONLY for an explicit "demo" outside production. */
  isDemoMode: boolean;
}

/**
 * Pure resolver — the whole policy, testable with plain arguments.
 *
 * @param envValue the raw NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND (may be undefined)
 * @param nodeEnv  the raw NODE_ENV (may be undefined)
 * @throws when `envValue` is neither "supabase" nor "demo" nor unset.
 */
export function resolveBackendMode(
  envValue: string | undefined,
  nodeEnv: string | undefined,
): RuntimeMode {
  // Rule 1: unset ⇒ supabase.
  const raw = envValue ?? "supabase";

  // Rule 3: anything outside the vocabulary is a configuration error.
  if (raw !== "supabase" && raw !== "demo") {
    throw new Error(
      `[runtimeMode] NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND must be "supabase" or "demo" ` +
        `(got "${raw}"). Leave it unset for "supabase"; it is never defaulted to "demo".`,
    );
  }

  // Rule 2: demo cannot survive a production build.
  const isDemoMode = raw === "demo" && nodeEnv !== "production";
  const backendMode: BackendMode = isDemoMode ? "demo" : "supabase";

  return { backendMode, isSupabaseMode: !isDemoMode, isDemoMode };
}

const RUNTIME = resolveBackendMode(
  process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND,
  process.env.NODE_ENV,
);

export const BACKEND_MODE = RUNTIME.backendMode;

export const isSupabaseMode = RUNTIME.isSupabaseMode;

/**
 * True only for an explicit `"demo"` outside production. Everything gated on it
 * — the legacy cookie-name branch in src/proxy.ts, the demo-session block in
 * useUser, /demo-login, test-credential login, the role switchers — is
 * unreachable in a production build by construction, not by a runtime check.
 */
export const isDemoMode = RUNTIME.isDemoMode;

/** Demo UI (role switchers, /demo-login, test-credential login) is allowed ONLY here. */
export const isDemoUiEnabled = isDemoMode;
