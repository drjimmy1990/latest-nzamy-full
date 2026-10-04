/**
 * startupProbe.test.ts
 *
 * Pins the boot-time verdict WP-2 item 3 asks for, without a network: the
 * probe's decision lives in a pure function precisely so `node --test` can
 * assert the exact line a misconfigured deploy will print.
 *
 * Run: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeAuthProbeResult,
  AUTH_PROBE_PREFIX,
  AUTH_PROBE_UNREACHABLE_MESSAGE,
} from './startupProbe.ts';

// ── a response came back ───────────────────────────────────────────────────

test('any 2xx is ok and names the status', () => {
  for (const status of [200, 201, 204, 299]) {
    const verdict = describeAuthProbeResult(status);
    assert.equal(verdict.level, 'ok', String(status));
    assert.equal(verdict.message, `${AUTH_PROBE_PREFIX} returned ${status}`);
  }
});

test('a non-2xx status is an error carrying that status', () => {
  // 401 is the interesting one: Auth ANSWERED, so this is not the UAT-ENV-001
  // class — it is a wrong/absent anon key, and the number is what says so.
  for (const status of [301, 400, 401, 403, 404, 500, 502, 503]) {
    const verdict = describeAuthProbeResult(status);
    assert.equal(verdict.level, 'error', String(status));
    assert.equal(verdict.message, `${AUTH_PROBE_PREFIX} returned ${status}`);
  }
});

test('the status line is exactly the string the review specified', () => {
  assert.equal(
    describeAuthProbeResult(503).message,
    '[startup] Supabase auth health probe returned 503',
  );
});

// ── nothing came back ──────────────────────────────────────────────────────

test('a thrown Error is UNREACHABLE, whatever it says', () => {
  const cases = [
    new TypeError('fetch failed'),
    Object.assign(new Error('unable to verify the first certificate'), {
      code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    }),
    new Error('getaddrinfo ENOTFOUND db.example.supabase.co'),
    new DOMException('The operation was aborted.', 'TimeoutError'),
  ];
  for (const thrown of cases) {
    const verdict = describeAuthProbeResult(thrown);
    assert.equal(verdict.level, 'error', String(thrown));
    assert.equal(verdict.message, AUTH_PROBE_UNREACHABLE_MESSAGE);
  }
});

test('a non-Error throw is still UNREACHABLE — catch(e) is `unknown`', () => {
  for (const thrown of ['boom', undefined, null, { message: 'nope' }, false]) {
    const verdict = describeAuthProbeResult(thrown);
    assert.equal(verdict.level, 'error', String(thrown));
    assert.equal(verdict.message, AUTH_PROBE_UNREACHABLE_MESSAGE);
  }
});

test('the UNREACHABLE line names the consequence and forbids the wrong fix', () => {
  assert.match(AUTH_PROBE_UNREACHABLE_MESSAGE, /every getUser\(\) will answer 503/);
  assert.match(AUTH_PROBE_UNREACHABLE_MESSAGE, /set NODE_EXTRA_CA_CERTS/);
  assert.match(AUTH_PROBE_UNREACHABLE_MESSAGE, /never NODE_TLS_REJECT_UNAUTHORIZED=0/);
});

// ── the shape the caller relies on ─────────────────────────────────────────

test('every verdict is one of the two levels and carries a non-empty message', () => {
  for (const outcome of [200, 500, new Error('x'), 'x', undefined]) {
    const verdict = describeAuthProbeResult(outcome);
    assert.ok(verdict.level === 'ok' || verdict.level === 'error');
    assert.ok(verdict.message.length > 0);
    assert.match(verdict.message, /^\[startup\] /);
  }
});
