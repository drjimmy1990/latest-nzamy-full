/**
 * sessionResponse.test.ts — the decision behind GET /api/v1/auth/session.
 *
 * Pure-argument tests, the same shape as routeAccess.test.ts and
 * onboardingGate.test.ts beside it: no Supabase client is mocked anywhere in
 * this repo, and nothing here needs one. The properties that are only visible
 * in the route file itself (RLS client, no-store, the guarded profile read)
 * are pinned in src/app/api/v1/auth/session/route.test.ts.
 *
 * Run: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionResponseFor } from './sessionResponse.ts';
import { AUTH_UNAVAILABLE_AR } from './resolveAuthOutcome.ts';

const USER_ID = '00000000-0000-0000-0000-000000000001';

// ── The three outcomes ─────────────────────────────────────────────────────

test('ok returns 200 with the user id and the profile user_type', () => {
  const decision = sessionResponseFor('ok', USER_ID, { user_type: 'lawyer' });
  assert.equal(decision.status, 200);
  assert.deepEqual(decision.body, { userId: USER_ID, userType: 'lawyer' });
});

test('anonymous returns 401 — the server did not accept the cookies', () => {
  const decision = sessionResponseFor('anonymous', null, null);
  assert.equal(decision.status, 401);
  assert.equal(decision.body.error, 'غير مصرح — يرجى تسجيل الدخول');
  assert.equal(decision.body.userId, undefined);
});

test('unavailable returns 503 with the Arabic copy, never 401', () => {
  const decision = sessionResponseFor('unavailable', null, null);
  assert.equal(decision.status, 503);
  assert.equal(decision.body.error, AUTH_UNAVAILABLE_AR);
});

test('unavailable stays 503 even when a user id is somehow present', () => {
  // Defence against a future caller passing both: 503 must win over 200, or a
  // half-answered check would be reported as a verified session.
  assert.equal(sessionResponseFor('unavailable', USER_ID, { user_type: 'lawyer' }).status, 503);
});

// ── userType is never guessed ──────────────────────────────────────────────

test('a missing profile row answers userType null, not "individual"', () => {
  // The demotion WP-2 item 6 removes from useUser must not reappear here: the
  // login page decides where to send the user from this value, and inventing
  // "individual" for a lawyer is exactly the UAT-LIVE-AI-001 failure.
  for (const profile of [null, {}, { user_type: null }, { user_type: '' }]) {
    const decision = sessionResponseFor('ok', USER_ID, profile);
    assert.equal(decision.status, 200);
    assert.equal(decision.body.userType, null, JSON.stringify(profile));
    assert.equal(decision.body.userId, USER_ID);
  }
});

test('ok without a user id degrades to 401 rather than reporting a session', () => {
  assert.equal(sessionResponseFor('ok', null, { user_type: 'lawyer' }).status, 401);
});
