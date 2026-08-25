/**
 * _locator.test.ts — proves a fiqh block's locator never renders a fabricated
 * or literal-"null" value.
 *
 * Run: npm run test:unit
 */
import assert from 'node:assert/strict';
import { formatLocator, matchesLocator, pageToken, volumeToken } from './_locator.ts';

let passed = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (e) { console.error(`✗ ${name}`); throw e; }
};

// ── The literal-"null" regression ────────────────────────────────────────────

test('a NULL volume never prints the string "null"', () => {
  const s = formatLocator({ vol: null, page: 47 }, true);
  assert.ok(!s.includes('null'), s);
  assert.equal(s, 'ص 47');
});

test('both NULL yields an empty string so the caller can drop the segment', () => {
  assert.equal(formatLocator({ vol: null, page: null }, true), '');
  assert.equal(formatLocator({}, true), '');
  assert.equal(formatLocator(null, true), '');
  assert.equal(formatLocator(undefined, false), '');
});

test('a NULL page still shows the volume', () => {
  assert.equal(formatLocator({ vol: 3, page: null }, true), 'ج 3');
});

// ── Verbatim non-numeric tokens ──────────────────────────────────────────────

test('a non-numeric volume label survives as written', () => {
  // 887 volume tokens in the corpus are values like these.
  assert.equal(formatLocator({ vol: null, volLabel: 'مقدمة', page: 5 }, true), 'ج مقدمة، ص 5');
  assert.equal(formatLocator({ vol: null, volLabel: '7-1', page: null }, true), 'ج 7-1');
});

test('the label wins over the numeric column', () => {
  // The label is what the source wrote; the number is a parse of it.
  assert.equal(volumeToken({ vol: 1, volLabel: 'مقدمة' }), 'مقدمة');
  assert.equal(pageToken({ page: 9, pageLabel: 'None' }), 'None');
});

test('an empty-string label falls back to the number, not to ""', () => {
  assert.equal(volumeToken({ vol: 4, volLabel: '' }), '4');
  assert.equal(volumeToken({ vol: 4, volLabel: '   ' }), '4');
});

test('volume 0 is a stated value, not an absence', () => {
  assert.equal(volumeToken({ vol: 0 }), '0');
  assert.equal(pageToken({ page: 0 }), '0');
});

// ── Styles and languages ─────────────────────────────────────────────────────

test('short and long styles, both directions', () => {
  const b = { vol: 3, page: 47 };
  assert.equal(formatLocator(b, true, 'short'), 'ج 3، ص 47');
  assert.equal(formatLocator(b, true, 'long'), 'المجلد 3 — الصفحة 47');
  assert.equal(formatLocator(b, false, 'short'), 'V 3, P 47');
  assert.equal(formatLocator(b, false, 'long'), 'Volume 3 — Page 47');
});

test('no separator is left dangling when one part is missing', () => {
  for (const rtl of [true, false]) {
    for (const style of ['short', 'long'] as const) {
      for (const b of [{ vol: 3, page: null }, { vol: null, page: 47 }]) {
        const s = formatLocator(b, rtl, style);
        assert.ok(!/[،,]\s*$/.test(s), `trailing separator: "${s}"`);
        assert.ok(!/—\s*$/.test(s), `trailing dash: "${s}"`);
        assert.equal(s, s.trim());
      }
    }
  }
});

// ── Quick-jump matching ──────────────────────────────────────────────────────

test('a bare page query matches that page in ANY volume', () => {
  // Previously the volume defaulted to 1, which hid every match outside vol 1
  // once blocks started carrying real volumes (116,828 of them do).
  assert.ok(matchesLocator({ vol: 7, page: 47 }, null, '47'));
  assert.ok(matchesLocator({ vol: null, page: 47 }, null, '47'));
  assert.ok(!matchesLocator({ vol: 7, page: 48 }, null, '47'));
});

test('a vol/page query matches only that pair', () => {
  assert.ok(matchesLocator({ vol: 3, page: 47 }, '3', '47'));
  assert.ok(!matchesLocator({ vol: 4, page: 47 }, '3', '47'));
  assert.ok(!matchesLocator({ vol: 3, page: 46 }, '3', '47'));
});

test('a query matches a non-numeric locator by its label', () => {
  assert.ok(matchesLocator({ vol: null, volLabel: 'مقدمة', page: 2 }, 'مقدمة', '2'));
});

test('an empty query matches nothing', () => {
  assert.ok(!matchesLocator({ vol: 3, page: 47 }, null, null));
});

console.log(`✔ _locator: ${passed} tests passed`);
