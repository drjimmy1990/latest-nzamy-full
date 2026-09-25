import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { truncateWithHighlight } from './snippet.ts';

test('locked and open previews stay within their complete character budgets', () => {
  const text = `مقدمة ${'س'.repeat(300)} نهاية`;
  for (const cap of [100, 200]) {
    const preview = truncateWithHighlight(text, ['س'.repeat(250)], cap);
    assert.ok(preview.length <= cap);
    assert.ok(preview.includes('س'));
  }
});

test('matching after leading spaces centers on the source without exceeding the cap', () => {
  const text = `   ${'قبل '.repeat(40)}إثبات ${'بعد '.repeat(40)}`;
  const preview = truncateWithHighlight(text, ['اثبات'], 100);
  assert.ok(preview.includes('إثبات'));
  assert.ok(preview.length <= 100);
});

test('unmatched, empty, and short previews never exceed the cap', () => {
  assert.equal(truncateWithHighlight(null, ['x'], 100), '');
  assert.equal(truncateWithHighlight('نص قصير', ['مفقود'], 100), 'نص قصير');
  assert.ok(truncateWithHighlight('أ'.repeat(500), ['مفقود'], 100).length <= 100);
  assert.ok(truncateWithHighlight('أ'.repeat(500), [], 100).length <= 100);
  assert.equal(truncateWithHighlight('أ'.repeat(10), ['أ'], 0), '');
});

test('orders use the same bounded preview helper as the other search sections', () => {
  const route = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');
  assert.match(
    route,
    /orderResults\.map\([\s\S]*?snippet:\s*truncateWithHighlight\(brief,\s*parsed\.plainTerms,\s*snippetLen\(isFree\)\)/,
  );
});
