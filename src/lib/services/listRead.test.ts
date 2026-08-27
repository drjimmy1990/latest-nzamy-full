/**
 * listRead.test.ts
 *
 * The defect: 35 service readers end in `catch { return [] }` and 17 API routes
 * answer a failed query with `{ data: [] }` and HTTP 200. A lawyer whose
 * hearings query fails reads «لا توجد جلسات قادمة» and misses a court date.
 *
 * What is pinned here is the distinction itself — that a failure can never
 * become an empty list by passing through this module, in either direction.
 *
 * Run: npm run test:unit
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  listOk,
  listFailed,
  listFromApi,
  listViewState,
  itemsOf,
  truncationNoticeAr,
} from './listRead.ts';

test('an empty successful read is empty, not failed', () => {
  const read = listOk<string>([]);
  assert.equal(read.ok, true);
  assert.equal(listViewState(false, read), 'empty');
});

test('a failed read is never empty', () => {
  const read = listFailed<string>();
  assert.equal(read.ok, false);
  assert.equal(listViewState(false, read), 'unreadable');
  // The one substitution this whole module exists to prevent.
  assert.notEqual(listViewState(false, read), 'empty');
});

test('loading beats both — an unanswered read asserts nothing', () => {
  // «لا توجد جلسات» flashing on first paint at a lawyer who does have hearings
  // is the same false statement, just briefer.
  assert.equal(listViewState(true, null), 'loading');
  assert.equal(listViewState(true, listOk<string>([])), 'loading');
  assert.equal(listViewState(true, listFailed<string>()), 'loading');
});

test('never asked is unreadable, not empty', () => {
  assert.equal(listViewState(false, null), 'unreadable');
  assert.equal(listViewState(false, undefined), 'unreadable');
});

test('a populated read is ready', () => {
  assert.equal(listViewState(false, listOk(['a', 'b'])), 'ready');
});

// ── The API body ───────────────────────────────────────────────────────────

test('degraded: true is a failure even though the status was 200', () => {
  // This is exactly what /api/v1/service-requests returns when its query
  // errored: HTTP 200, an empty data array, and this marker. Reading only
  // `data` gives «لا توجد طلبات» over a database failure.
  assert.equal(listFromApi({ data: [], total: 0, degraded: true }).ok, false);
  assert.equal(listFromApi({ data: [1, 2], degraded: true }).ok, false);
});

test('a body with no data array is a failure, not an empty list', () => {
  // A response missing `data` is nearly always an error object. Rendering it
  // as "you have nothing" is the defect.
  assert.equal(listFromApi({}).ok, false);
  assert.equal(listFromApi(null).ok, false);
  assert.equal(listFromApi(undefined).ok, false);
  assert.equal(listFromApi({ data: null }).ok, false);
  assert.equal(listFromApi({ data: undefined, total: 0 }).ok, false);
});

test('a healthy empty body is an honest empty list', () => {
  const read = listFromApi<number>({ data: [], total: 0 });
  assert.equal(read.ok, true);
  assert.equal(listViewState(false, read), 'empty');
});

test('the server total is carried through, not recomputed from the page', () => {
  const read = listFromApi({ data: [1, 2, 3], total: 47 });
  assert.ok(read.ok);
  assert.equal(read.total, 47);
  assert.equal(read.items.length, 3);
});

// ── Truncation ─────────────────────────────────────────────────────────────

test('truncation is claimed only when the server said there is more', () => {
  const cut = listOk([1, 2, 3], 47);
  assert.ok(cut.ok && cut.truncated);

  const whole = listOk([1, 2, 3], 3);
  assert.ok(whole.ok && !whole.truncated);
});

test('an unknown total is not evidence of truncation', () => {
  // A banner saying rows are hidden when none are is its own false statement.
  const unknown = listOk([1, 2, 3]);
  assert.ok(unknown.ok);
  assert.equal(unknown.total, null);
  assert.equal(unknown.truncated, false);
  assert.equal(truncationNoticeAr(unknown), null);
});

test('a nonsense total is treated as unknown rather than trusted', () => {
  for (const bad of [Number.NaN, Infinity, -Infinity]) {
    const read = listOk([1], bad);
    assert.ok(read.ok);
    assert.equal(read.total, null, String(bad));
    assert.equal(read.truncated, false, String(bad));
  }
});

test('the truncation notice reads in Arabic-Indic numerals', () => {
  const notice = truncationNoticeAr(listOk([1, 2, 3], 47));
  assert.ok(notice);
  assert.ok(notice.includes('٣'), notice);
  assert.ok(notice.includes('٤٧'), notice);
  assert.ok(!/[0-9]/.test(notice), `western digits leaked: ${notice}`);
});

test('there is no notice when nothing was cut, and none on a failure', () => {
  assert.equal(truncationNoticeAr(listOk([1, 2], 2)), null);
  assert.equal(truncationNoticeAr(listFailed()), null);
  assert.equal(truncationNoticeAr(null), null);
});

// ── itemsOf ────────────────────────────────────────────────────────────────

test('itemsOf yields nothing for a failure, so a misuse renders empty not wrong', () => {
  assert.deepEqual(itemsOf(listFailed<number>()), []);
  assert.deepEqual(itemsOf(null), []);
  assert.deepEqual(itemsOf(listOk([1, 2])), [1, 2]);
});
