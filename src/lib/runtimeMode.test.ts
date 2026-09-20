/**
 * runtimeMode.test.ts
 *
 * Pins the three rules that replace the `?? "demo"` default which five modules
 * each derived for themselves. The default is the H2 half of
 * docs/audits/2026-09-20-profiles-uat/02-auth-session-audit.md: an unset
 * variable on the edge runtime sent every signed-in user to /login?from=…,
 * because the legacy branch looks for `nzamy_session` and a real Supabase login
 * sets `sb-<ref>-auth-token*`.
 *
 * `resolveBackendMode` is the pure form of the module-level constants, so these
 * assertions need no env mutation and no module cache busting.
 *
 * Run: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBackendMode } from './runtimeMode.ts';

const ENVS = ['production', 'development', 'test', undefined];

// ── Rule 1: never defaults to demo ─────────────────────────────────────────

test('an unset backend variable resolves to supabase in every NODE_ENV', () => {
  for (const nodeEnv of ENVS) {
    const mode = resolveBackendMode(undefined, nodeEnv);
    assert.equal(mode.backendMode, 'supabase', String(nodeEnv));
    assert.equal(mode.isSupabaseMode, true, String(nodeEnv));
    assert.equal(mode.isDemoMode, false, String(nodeEnv));
  }
});

test('an explicit "supabase" resolves to supabase in every NODE_ENV', () => {
  for (const nodeEnv of ENVS) {
    const mode = resolveBackendMode('supabase', nodeEnv);
    assert.equal(mode.backendMode, 'supabase', String(nodeEnv));
    assert.equal(mode.isDemoMode, false, String(nodeEnv));
  }
});

// ── Rule 2: demo is impossible in production ───────────────────────────────

test('"demo" is refused in a production build and falls back to supabase', () => {
  const mode = resolveBackendMode('demo', 'production');
  assert.equal(mode.isDemoMode, false);
  assert.equal(mode.isSupabaseMode, true);
  assert.equal(mode.backendMode, 'supabase');
});

test('"demo" is honoured outside production', () => {
  for (const nodeEnv of ['development', 'test', undefined]) {
    const mode = resolveBackendMode('demo', nodeEnv);
    assert.equal(mode.isDemoMode, true, String(nodeEnv));
    assert.equal(mode.isSupabaseMode, false, String(nodeEnv));
    assert.equal(mode.backendMode, 'demo', String(nodeEnv));
  }
});

// ── Rule 3: an unknown value throws ────────────────────────────────────────

test('any value outside the vocabulary throws, in every NODE_ENV', () => {
  const typos = ['supbase', 'Supabase', 'SUPABASE', 'prod', 'Demo', '', ' supabase', 'true'];
  for (const value of typos) {
    for (const nodeEnv of ENVS) {
      assert.throws(
        () => resolveBackendMode(value, nodeEnv),
        /NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND must be "supabase" or "demo"/,
        `${value} / ${nodeEnv}`,
      );
    }
  }
});

test('the throw names the offending value so a deploy log identifies the typo', () => {
  assert.throws(() => resolveBackendMode('supbase', 'production'), /got "supbase"/);
});

// ── The property the UAT turned on ─────────────────────────────────────────

test('no input at all can produce demo mode in production', () => {
  const inputs = [undefined, 'supabase', 'demo'];
  for (const value of inputs) {
    assert.equal(resolveBackendMode(value, 'production').isDemoMode, false, String(value));
  }
});
