/**
 * apiSlug.test.ts — pins the double-encoding bug that 404'd all 144 fiqh books.
 *
 * Run: npx tsx src/utils/apiSlug.test.ts
 */
import assert from 'node:assert/strict';
import { apiSlug } from './apiSlug';

let passed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (e) { console.error(`✗ ${name}`); throw e; }
};

const AR_BOOK = 'الأسس العامة للعقود الإدارية - دراسة مقارنة';

test('an already-encoded slug is NOT encoded a second time', () => {
  const encoded = encodeURIComponent(AR_BOOK);
  assert.equal(apiSlug(encoded), encoded);
  // The regression itself: both stdlib helpers double-encode this input.
  assert.notEqual(encodeURI(encoded), encoded);
  assert.notEqual(encodeURIComponent(encoded), encoded);
  assert.ok(!apiSlug(encoded).includes('%25'), apiSlug(encoded).slice(0, 40));
});

test('a plain Arabic slug is encoded exactly once', () => {
  assert.equal(apiSlug(AR_BOOK), encodeURIComponent(AR_BOOK));
});

test('encoded and plain inputs agree — the function is shape-agnostic', () => {
  assert.equal(apiSlug(AR_BOOK), apiSlug(encodeURIComponent(AR_BOOK)));
});

test('round-trips back to the original title', () => {
  assert.equal(decodeURIComponent(apiSlug(AR_BOOK)), AR_BOOK);
  assert.equal(decodeURIComponent(apiSlug(encodeURIComponent(AR_BOOK))), AR_BOOK);
});

test('ASCII slugs are untouched — laws/decrees/precedents keep working', () => {
  assert.equal(apiSlug('labor-law-qadha'), 'labor-law-qadha');
  assert.equal(apiSlug('precedents-bog-1402-1436'), 'precedents-bog-1402-1436');
});

test('spaces and dashes survive (book ids contain " - ")', () => {
  assert.equal(decodeURIComponent(apiSlug('المغني - الجزء 13')), 'المغني - الجزء 13');
});

test('a malformed sequence does not throw', () => {
  for (const bad of ['%', '%zz', '100%', '%E0%A4%A']) {
    assert.doesNotThrow(() => apiSlug(bad), `threw on ${bad}`);
  }
});

test('missing / array params are handled', () => {
  assert.equal(apiSlug(undefined), '');
  assert.equal(apiSlug(null), '');
  assert.equal(apiSlug(['a', 'b']), 'a%2Fb');
});

console.log(`✔ apiSlug: ${passed} tests passed`);
