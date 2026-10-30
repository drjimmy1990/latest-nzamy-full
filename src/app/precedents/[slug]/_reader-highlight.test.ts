/**
 * Owner note ٠٦ — multi-colour highlight in the collection reader, the decree
 * reader and the in-document search panel. Source pins: the readers need a
 * live library; the engine is tested in src/lib/search/*.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const PAGE = read("./page.tsx");
const BLOCK = read("./_principle-block.tsx");
const PANEL = read("../../../components/library/ScopedSearchPanel.tsx");
const ORDERS = read("../../laws/orders/[slug]/page.tsx");

test("principle block: the dead searchQuery prop is gone; header, body, reference and details go through <Hl>", () => {
  assert.doesNotMatch(BLOCK, /searchQuery/);
  assert.match(BLOCK, /<p key=\{i\} className=\{className\}><Hl text=\{para\} \/><\/p>/);
  assert.match(BLOCK, /<Hl text=\{isRTL \? `مبدأ رقم \(\$\{p\.number\}\)`/);
  assert.match(BLOCK, /<Hl text=\{isRTL \? `قرار رقم \(\$\{p\.decision_number\}\)`/);
  assert.match(BLOCK, /<Hl text=\{p\.issuing_body\} \/>/);
  assert.match(BLOCK, /<Hl text=\{cleanRef\} \/>/);
  // A match inside «الوقائع والتسبيب والمنطوق» opens it — set once, never a controlled `open`.
  assert.match(BLOCK, /useTextHasHighlight\(Object\.values\(details\)/);
  assert.match(BLOCK, /detailsRef\.current\.open = true/);
  assert.match(BLOCK, /<details ref=\{detailsRef\}/);
  assert.doesNotMatch(BLOCK, /<details[^>]*\sopen=\{/);
});

test("collection reader: ?q= colours, never filters; the hash or ?target= is the target", () => {
  assert.match(PAGE, /const arrival = readerArrival\(window\.location\.search, window\.location\.hash\);/);
  assert.match(PAGE, /setUrlQuery\(arrival\.query\);/);
  // ?q= never reaches the filter box (note ١٢: that hid the target principle).
  assert.doesNotMatch(PAGE, /setSearchQuery\(arrival/);
  assert.doesNotMatch(PAGE, /setSearchQuery\(urlQuery/);
  assert.match(PAGE, /const highlightQuery = searchQuery\.trim\(\) \? searchQuery : urlQuery;/);
  assert.match(PAGE, /<HighlightProvider query=\{highlightQuery\}>/);
  assert.match(PAGE, /<SearchLegendBar\s+onClear=\{clearHighlight\}\s+partial=\{hasMore\}/);
  // The filter box uses the same grammar as the highlight.
  assert.match(PAGE, /const matches = compileQueryMatcher\(parseHighlightQuery\(q\)\);/);
  // The panel sits outside the reader's provider (its own colours and counts).
  assert.ok(PAGE.indexOf("<ScopedSearchPanel") < PAGE.indexOf("<HighlightProvider"));
  assert.match(PAGE, /onOpenHit=\{openScopedHit\}/);
});

test("in-document panel: the shared engine, its own legend, ?q= on «الانتقال للموضع»", () => {
  assert.match(PANEL, /<HighlightProvider query=\{data\?\.query \?\? ""\}>/);
  assert.match(PANEL, /<SearchLegendBar partial=/);
  assert.match(PANEL, /highlightSegments\(text, terms\)/);
  assert.match(PANEL, /<mark key=\{i\} data-hl-term=\{seg\.term\}/);
  assert.match(PANEL, /scopedHitHref\(hit, data\.query\)/);
  assert.match(PANEL, /if \(onOpenHit\?\.\(hit, data\.query\)\) e\.preventDefault\(\);/);
  assert.match(PANEL, /الانتقال للموضع/);
});

test("decree reader: title, preamble and pages coloured; ?q= read; summary keeps its plain path", () => {
  assert.match(ORDERS, /setUrlQuery\(readerArrival\(window\.location\.search, ""\)\.query\);/);
  assert.match(ORDERS, /<HighlightProvider query=\{highlightQuery\}>/);
  assert.match(ORDERS, /<Hl text=\{order\.title\} \/>/);
  assert.match(ORDERS, /<Hl text=\{order\.preamble\} \/>/);
  assert.match(ORDERS, /<BoldHl text=\{art\} \/>/);
  assert.doesNotMatch(ORDERS, /formatBold\(art\)/);
  assert.match(ORDERS, /<SearchLegendBar onClear=\{clearHighlight\}/);
  assert.match(ORDERS, /البحث داخل هذا المستند/);
});
