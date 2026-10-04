/**
 * Next.js instrumentation hook — runs once when a server instance boots.
 *
 * Fails fast in production if the app is misconfigured. The most dangerous
 * misconfiguration used to be an UNSET NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND:
 * every gate read it with its own `?? "demo"` default, so an unset value
 * silently served client-side demo roles (a full auth bypass) with no other
 * signal. src/lib/runtimeMode.ts now resolves unset to "supabase" and throws on
 * any value outside the vocabulary, so the assertion below is the second line
 * of defence rather than the only one.
 *
 * It also asks Auth, once, whether this runtime can reach it at all (WP-2
 * item 3). That probe logs and never throws — see src/lib/auth/startupProbe.ts.
 */
import { describeAuthProbeResult } from '@/lib/auth/startupProbe';

export async function register() {
  // ── Backend mode ─────────────────────────────────────────────────────────
  // This assertion reads `process.env` and nothing else, so it runs safely in
  // the edge runtime too; the `NEXT_RUNTIME !== 'nodejs'` early return that
  // used to sit above it is gone. That return is why a misconfigured edge
  // deploy — the runtime src/proxy.ts actually executes in — booted with no
  // assertion at all (02-auth-session-audit.md §2, last paragraph). src/proxy.ts
  // now carries its own module-level copy of this check as well, so the edge
  // fails loudly whichever way it is entered.
  //
  // NODE_ENV is set to "production" automatically by `next build`/`next start`
  // and cannot be hand-set — unlike the manually configured NEXT_PUBLIC_APP_ENV,
  // which must NOT gate this check.
  //
  // The assertion itself is unchanged, INCLUDING its treatment of an unset
  // value: .env.example marks this variable [REQUIRED — CRITICAL], and a
  // production deploy that never declares it should fail at boot rather than
  // lean on runtimeMode's safe default.
  if (process.env.NODE_ENV === 'production') {
    const backend = process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND;
    if (backend !== 'supabase') {
      throw new Error(
        `[startup] NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND must be "supabase" in production ` +
          `(got "${backend ?? 'unset'}") — otherwise the app silently serves demo/client-side roles.`,
      );
    }
  }

  // ── Everything below needs the Node server runtime ───────────────────────
  // Never during `next build`, never on the edge. NEXT_RUNTIME is set to
  // "nodejs" only at server start.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV !== 'production') return;

  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`[startup] Missing required env vars: ${missing.join(', ')}`);
  }

  // ── Can this runtime actually REACH Auth? (UAT-ENV-001) ──────────────────
  // The env vars being present says nothing about the network between this
  // process and Supabase. An intercepting proxy with an untrusted root CA —
  // the UAT-ENV-001 finding — leaves every variable correct and every
  // `getUser()` a transport failure, which resolveAuthOutcome.ts turns into a
  // 503 for every visitor. Ask once, at boot, and say so in the log.
  //
  // LOGS, NEVER THROWS: a blip on the Auth host must not stop the web server
  // from starting. The verdict itself is a pure function so it is testable
  // without a network (src/lib/auth/startupProbe.test.ts); only the request
  // and the console.error live here.
  //
  // The 5s abort is part of "never blocks the boot": a blackholed connection
  // has no timeout of its own, and a probe that hangs `register()` forever
  // would be a worse outage than the one it is meant to report. An abort
  // throws, so it lands in the catch and reads as UNREACHABLE — which, after
  // five seconds of silence, is the honest description.
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const verdict = describeAuthProbeResult(res.status);
    if (verdict.level === 'error') console.error(verdict.message);
  } catch (err) {
    console.error(describeAuthProbeResult(err).message, err);
  }
}
