/**
 * Single source of truth for "are we in demo/dev mode?".
 *
 * Production (supabase) builds MUST ship NO demo surfaces — no role/account
 * switchers, no /demo-login, no test-credential login. Because these are
 * module-level constants derived from a NEXT_PUBLIC_* env var, Next inlines
 * them at build time, so any `{isDemoUiEnabled && (...)}` subtree is
 * dead-code-eliminated from a supabase build.
 *
 * Kept trivial (no imports) so it can be imported anywhere without cycles —
 * useUser.ts keeps its own local `isSupabaseMode` to avoid an import cycle.
 */
export const BACKEND_MODE =
  process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND ?? "demo";

export const isSupabaseMode = BACKEND_MODE === "supabase";

/** Demo UI (role switchers, /demo-login, test-credential login) is allowed ONLY here. */
export const isDemoUiEnabled = !isSupabaseMode;
