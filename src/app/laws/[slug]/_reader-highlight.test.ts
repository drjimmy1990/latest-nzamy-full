/**
 * Source contract for the law reader's search colours (owner note ٠٦) and the
 * coloured-diff button (owner note ١٢ §٣). The components need a DOM, so the
 * wiring is asserted on the source; the logic is tested in _highlight-html,
 * wordDiff and multiColorSearch.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const page = read("./page.tsx");
const reader = read("./_article-components.tsx");
const diffView = read("./_word-diff.tsx");

test("the reader reads ?q= and wraps the article list in one HighlightProvider", () => {
  assert.match(page, /const arrivalQuery = searchParams\?\.get\("q"\) \?\? "";/);
  assert.match(page, /const highlightQuery = jumpQuery\.trim\(\) \? jumpQuery : arrivalQuery;/);
  assert.equal((page.match(/<HighlightProvider query=/g) ?? []).length, 1);
  assert.match(page, /<HighlightProvider query=\{highlightQuery\}>/);
  assert.match(page, /<SearchLegendBar\s+onClear=\{clearHighlight\}/);
});

test("?q= only colours: it never reaches the article filter", () => {
  const start = page.indexOf("const filteredArticles = (() => {");
  const end = page.indexOf("})();", start);
  assert.ok(start > 0 && end > start);
  const filter = page.slice(start, end);
  assert.match(filter, /jumpQuery\.trim\(\)/);
  assert.doesNotMatch(filter, /arrivalQuery|highlightQuery|searchParams/);
  assert.doesNotMatch(page, /setJumpQuery\(\s*(?:arrivalQuery|searchParams)/);
});

test("✕ drops ?q= without a scroll jump and keeps the hash", () => {
  const start = page.indexOf("const clearHighlight = useCallback(");
  const body = page.slice(start, page.indexOf("}, [searchParams, router, pathname]);", start));
  assert.match(body, /next\.delete\("q"\)/);
  assert.match(body, /window\.location\.hash/);
  assert.match(body, /router\.replace\([^;]*\{ scroll: false \}\)/);
});

test("the provider covers preamble → articles; the scoped search panel stays outside", () => {
  const open = page.indexOf("<HighlightProvider query=");
  const close = page.indexOf("</HighlightProvider>");
  assert.ok(open > 0 && close > open);
  assert.ok(page.indexOf("<ScopedSearchPanel") < open, "ScopedSearchPanel is outside the provider");
  const inside = page.slice(open, close);
  for (const piece of ["<PreambleBlock", "renderArticle", "<ReaderArrivalScroll", "<SearchLegendBar"]) {
    assert.ok(inside.includes(piece), `${piece} is inside the provider`);
  }
  // The two <ArticleBlock> renders sit inside it too.
  assert.equal((inside.match(/<ArticleBlock\b/g) ?? []).length, 2);
});

test("arrival scroll: the #hash target first, else the first mark", () => {
  const start = page.indexOf("function ReaderArrivalScroll(");
  const body = page.slice(start, page.indexOf("return null;", start));
  const hashAt = body.indexOf("document.getElementById(hash)");
  const markAt = body.indexOf('querySelector<HTMLElement>("mark[data-hl-term]")');
  assert.ok(hashAt > 0 && markAt > hashAt, "the hash target is tried before the first mark");
  assert.match(body, /const hl = useHighlight\(\);/);
  assert.match(body, /if \(done\.current\) return;/);
  assert.match(page, /<ReaderArrivalScroll query=\{arrivalQuery\}/);
});

test("MD colours every markdown line through highlightSafeHtml, never raw", () => {
  const start = reader.indexOf("export function MD(");
  const body = reader.slice(start, reader.indexOf("import { type CartEntry }", start));
  assert.equal((body.match(/markdownBoldToSafeHtml\(/g) ?? []).length, 1, "one conversion, inside safeHtml");
  assert.match(body, /const safeHtml = \(md: string\) => highlightSafeHtml\(markdownBoldToSafeHtml\(md\), hlTerms, hlFocus\);/);
  assert.match(body, /renderMarkdownTableToHtml\(block\.content \|\| "", safeHtml\)/);
  assert.match(body, /const hlTerms = highlight && hlCtx \? hlCtx\.parsed\.terms : NO_TERMS;/);
});

test("locked previews are never coloured (the paywall text stays as it was)", () => {
  const previews = reader.match(/<MD text=\{[^}]*\.slice\(0, 2\)[^\n]*\/>/g) ?? [];
  assert.equal(previews.length, 3);
  for (const p of previews) assert.match(p, /highlight=\{false\}/);
});

test("article number, title, regulation ref and the amendment history are coloured", () => {
  assert.match(reader, /<Hl text=\{mainBadgeText\} \/>/);
  assert.match(reader, /<Hl text=\{article\.title\} \/>/);
  assert.match(reader, /<Hl text=\{mergedReg\.ref\} \/>/);
  assert.match(reader, /<Hl text=\{amend\.summary\} \/>/);
  assert.match(reader, /<Hl text=\{amend\.source\} \/>/);
  // A match inside a folded part opens it.
  assert.match(reader, /open=\{historyHasHit\}/);
  assert.match(reader, /open=\{historicRegHasHit\}/);
  assert.match(reader, /const showRepealed = repealedChoice \?\? repealedHasHit;/);
  assert.match(reader, /useTextHasHighlight\(isRepealed && !isLocked \? repealedText : ""\)/);
});

test("note ١٢ §٣: the coloured-diff toggle sits inside «الإصدارات السابقة», against the current text", () => {
  const start = reader.indexOf("الإصدارات السابقة (");
  const end = reader.indexOf("</details>", start);
  const block = reader.slice(start, end);
  assert.match(block, /<PreviousVersionText\s+oldText=\{amend\.fullText\}\s+currentText=\{article\.text\}/);
  assert.match(diffView, /"إظهار الفروق الملونة"/);
  assert.match(diffView, /diffWords\(diffSourceText\(oldText\), diffSourceText\(currentText\)\)/);
  // Struck through only as a deleted diff word.
  const strikes = diffView.match(/[^\n]*line-through[^\n]*/g) ?? [];
  assert.equal(strikes.filter((l) => l.includes("className")).length, 1);
  assert.match(diffView, /<del\b[\s\S]*?line-through/);
  // Dark-safe colours: no text-*-50/100 in the diff view.
  assert.doesNotMatch(diffView, /text-(?:gray|slate|emerald|red|zinc)-(?:50|100)\b/);
});
