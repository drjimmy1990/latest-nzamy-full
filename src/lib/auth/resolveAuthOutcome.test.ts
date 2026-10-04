/**
 * resolveAuthOutcome.test.ts
 *
 * Pins the distinction UAT-LIVE-SESSION-001 turned on: a transport failure is
 * NOT a signed-out user. Every case below was answered "401 / redirect to
 * /login" by the `authError || !user` spelling these tests replace.
 *
 * Run: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveAuthOutcome,
  isTransportFailure,
  AUTH_UNAVAILABLE_AR,
  type AuthErrorLike,
} from './resolveAuthOutcome.ts';

const USER = { id: '00000000-0000-0000-0000-000000000001' };

// ── ok ─────────────────────────────────────────────────────────────────────

test('a user object with no error is ok', () => {
  assert.equal(resolveAuthOutcome(USER, null), 'ok');
  assert.equal(resolveAuthOutcome(USER), 'ok');
  assert.equal(resolveAuthOutcome(USER, undefined), 'ok');
});

test('a user object present alongside a stale error is still ok', () => {
  // The case the old spelling got wrong in the other direction: `authError ||
  // !user` returned 401 for a session that had in fact come back.
  assert.equal(
    resolveAuthOutcome(USER, { name: 'AuthRetryableFetchError', message: 'fetch failed' }),
    'ok',
  );
  assert.equal(resolveAuthOutcome(USER, { status: 401, message: 'Invalid JWT' }), 'ok');
});

// ── anonymous ──────────────────────────────────────────────────────────────

test('no user and no error is anonymous', () => {
  assert.equal(resolveAuthOutcome(null, null), 'anonymous');
  assert.equal(resolveAuthOutcome(null), 'anonymous');
  assert.equal(resolveAuthOutcome(undefined, undefined), 'anonymous');
});

test('a definitive auth rejection (an HTTP status from the Auth server) is anonymous', () => {
  const definitive: AuthErrorLike[] = [
    { name: 'AuthApiError', status: 401, message: 'Invalid JWT' },
    { name: 'AuthApiError', status: 403, message: 'User from sub claim in JWT does not exist' },
    { name: 'AuthSessionMissingError', status: 400, message: 'Auth session missing!' },
    { name: 'AuthApiError', status: 422, message: 'invalid claim' },
  ];
  for (const error of definitive) {
    assert.equal(resolveAuthOutcome(null, error), 'anonymous', error.message);
  }
});

// ── unavailable ────────────────────────────────────────────────────────────

test('AuthRetryableFetchError is unavailable whatever else it carries', () => {
  assert.equal(
    resolveAuthOutcome(null, { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }),
    'unavailable',
  );
  // A retryable fetch error that DID get a status (504 from a gateway) is still
  // a transport failure, not a statement about this session.
  assert.equal(
    resolveAuthOutcome(null, { name: 'AuthRetryableFetchError', status: 504, message: 'Gateway Timeout' }),
    'unavailable',
  );
});

test('a missing or zero HTTP status is unavailable — the request never completed', () => {
  assert.equal(resolveAuthOutcome(null, { name: 'TypeError', message: 'boom' }), 'unavailable');
  assert.equal(resolveAuthOutcome(null, { status: 0, message: 'boom' }), 'unavailable');
});

test('the network/TLS message family is unavailable even with an HTTP status attached', () => {
  const transport = [
    'fetch failed',
    'request to https://x.supabase.co/auth/v1/user failed, reason: connect ECONNREFUSED 127.0.0.1:443',
    'getaddrinfo ENOTFOUND x.supabase.co',
    'unable to verify the first certificate',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'network error',
  ];
  for (const message of transport) {
    assert.equal(resolveAuthOutcome(null, { status: 500, message }), 'unavailable', message);
  }
});

// ── the predicate on its own ───────────────────────────────────────────────

test('isTransportFailure is false for no error at all', () => {
  assert.equal(isTransportFailure(null), false);
  assert.equal(isTransportFailure(undefined), false);
});

test('the Arabic 503 copy is exactly the string the gates return', () => {
  assert.equal(AUTH_UNAVAILABLE_AR, 'تعذّر التحقق من الجلسة حالياً، حاول بعد قليل');
});
