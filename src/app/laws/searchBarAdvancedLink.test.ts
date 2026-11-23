import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Owner Q170 (22 Nov, batch l13): the /laws search keeps the big bar alone;
 * under it a small «خيارات متقدمة» link opens the advanced panel, in place of
 * the big green «بحث متقدم» button.
 */
const page = readFileSync(new URL("./(index)/page.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const row = page.slice(page.indexOf('<div className="mb-6 flex flex-col md:flex-row gap-3">'), page.indexOf("{/* ── Filter Unit"));
// the row without its JSX comments (one of them names the old button)
const bar = row.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("Q170: no big green «بحث متقدم» button beside the bar", () => {
  assert.ok(bar.length > 0, "the search row is found");
  assert.doesNotMatch(bar, /بحث متقدم/);
  assert.doesNotMatch(bar, /<Faders/);
  assert.doesNotMatch(bar, /px-6 py-4 bg-\[#0B3D2E\] text-white rounded-2xl/);
});

test("Q170: a small «خيارات متقدمة» link under the bar opens the advanced panel", () => {
  const link = bar.slice(bar.indexOf('data-testid="library-advanced-link"') - 200, bar.indexOf('data-testid="library-advanced-link"') + 600);
  assert.match(link, /type="button"/);
  assert.match(link, /onClick=\{\(\) => setShowAdvSearch\(true\)\}/);
  assert.match(link, /aria-haspopup="dialog"/);
  assert.match(link, /text-xs font-bold underline/, "a small link, not a button block");
  assert.match(link, /min-h-\[44px\] sm:min-h-0/, "a phone-sized tap target");
  assert.match(link, /\{isRTL \? "خيارات متقدمة" : "Advanced options"\}/);
  // under the bar: after the input's own box (which anchors the suggestions), in the same column
  const input = bar.indexOf("placeholder={phList[phIdx]}");
  const linkAt = bar.indexOf('data-testid="library-advanced-link"');
  const tools = bar.indexOf("<SearchSyntaxHelp");
  assert.ok(input > 0 && linkAt > input && tools > linkAt, "bar, then the link, then the other tools");
  assert.match(bar, /<div className="flex-1 min-w-0">\n\s*<div className="relative">/, "the suggestions open under the input, not under the link");
  // the panel itself is unchanged
  assert.match(page, /<AdvancedSearchModal/);
});
