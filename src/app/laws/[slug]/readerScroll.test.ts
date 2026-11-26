/**
 * A-72 (owner package 25-Nov, annex 09 P-05): long laws froze the tab while
 * scrolling. Measured live on /laws/labor-law (guest, 249 cards): every
 * article scrolled past set `activeId`, and each change re-rendered all 249
 * cards — a 106–141 ms main-thread task per step. The cards are memoised and
 * the page passes them stable callbacks, so only the two cards whose
 * `isActive` flips render again. No windowing: every card stays in the DOM
 * (anchors, contents jumps, in-page search, print).
 * Source-read: .tsx cannot load under node --test.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/app/laws/[slug]/readerScroll.test.ts"
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("ArticleBlock is exported memoised", () => {
  const barrel = read("./_components.tsx");
  assert.match(barrel, /import \{ memo \} from "react";/);
  assert.match(barrel, /export const ArticleBlock = memo\(ArticleBlockCard\);/);
});

test("the page gives every article card stable props: no inline arrow for showPaywall / onExplain", () => {
  const page = read("./page.tsx");
  const blocks = page.match(/<ArticleBlock\b[\s\S]*?\/>/g) ?? [];
  assert.equal(blocks.length, 2);
  for (const block of blocks) {
    assert.match(block, /showPaywall=\{openPaywall\}/);
    assert.match(block, /onExplain=\{setExplainArticle\}/);
    assert.match(block, /onActive=\{setActiveId\}/);
    assert.doesNotMatch(block, /=\{\(\w*\) =>/, "an inline arrow is a new prop on every render");
  }
  assert.match(page, /const openPaywall = useCallback\(\(\) => setShowPaywall\(true\), \[\]\);/);
});

test("the flat regulation view renders memoised cards, ids unchanged", () => {
  const page = read("./page.tsx");
  assert.match(page, /const RegulationCard = memo\(function RegulationCard\(/);
  assert.match(page, /<RegulationCard\s+key=\{`\$\{inst\.ref\}-\$\{a\.regNum \?\? i\}`\}\s+cardId=\{cardId\}/);
  assert.match(page, /id=\{cardId\}/);
});
