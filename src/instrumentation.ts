/**
 * Next.js instrumentation hook — runs once when a server instance boots.
 *
 * Fails fast in production if the app is misconfigured. The most dangerous
 * misconfiguration is an unset/incorrect NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND:
 * every gate reads it with a `?? "demo"` default, so an unset value silently
 * serves client-side demo roles (a full auth bypass) with no other signal.
 */
export async function register() {
  // Only assert at real Node server runtime — never during `next build` or in
  // the edge runtime. NEXT_RUNTIME is set to "nodejs" only at server start.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Skip in dev/test. NODE_ENV is set to "production" automatically by
  // `next build`/`next start` and cannot be hand-set — unlike the manually
  // configured NEXT_PUBLIC_APP_ENV, which must NOT gate this check.
  if (process.env.NODE_ENV !== 'production') return;

  const backend = process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND;
  if (backend !== 'supabase') {
    throw new Error(
      `[startup] NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND must be "supabase" in production ` +
        `(got "${backend ?? 'unset'}") — otherwise the app silently serves demo/client-side roles.`,
    );
  }

  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`[startup] Missing required env vars: ${missing.join(', ')}`);
  }
}
