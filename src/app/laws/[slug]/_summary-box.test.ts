/**
 * N2.1 — the reader shows the موجز as `<details open>` above the preamble and
 * the identity card in the sidebar, from the fields the law route sends.
 * Source contract: the page and the sidebar are client components.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(path.join(here, f), "utf8").replace(/\r\n/g, "\n");
const BOX = read("_summary-box.tsx");
const PAGE = read("page.tsx");
const SIDEBAR = read("_sidebar.tsx");

test("the موجز box is an open <details> with the owner preview's test id and the file's own label", () => {
  assert.match(BOX, /<details\s+open\s+data-testid="law-document-summary-box"/);
  assert.match(BOX, /label\?\.trim\(\) \|\| LAW_SUMMARY_FALLBACK_LABEL/);
  assert.match(BOX, /if \(!summary \|\| !summary\.trim\(\)\) return null;/);
  // Dark mode: no light-only surface, no invisible gray text.
  assert.doesNotMatch(BOX, /text-gray-(100|200)\b/);
  assert.match(BOX, /isDark \?/);
});

test("the page maps summary + summaryLabel and draws the box ABOVE the preamble", () => {
  assert.match(PAGE, /summary: data\.summary \|\| '',\n\s*summaryLabel: data\.summaryLabel \|\| '',/);
  const box = PAGE.indexOf("<LawSummaryBox");
  const preamble = PAGE.indexOf("<PreambleBlock");
  assert.ok(box > 0 && preamble > box, "LawSummaryBox must render before PreambleBlock");
});

test("the sidebar card's badge is never an invented «نظام»", () => {
  assert.doesNotMatch(SIDEBAR, /\?\.value \|\| \(isRTL \? "نظام" : "Law"\)/);
  assert.match(SIDEBAR, /typeRow\?\.value \|\| law\.documentType \|\| ""/);
  assert.match(SIDEBAR, /if \(item === typeRow\) return null;/);
});

test("a card value's link is a link only when it is http(s)", () => {
  assert.match(SIDEBAR, /if \(!\/\^https\?:\\\/\\\/\\S\+\$\/i\.test\(url\)\) \{\n\s*parts\.push\(text\);/);
});
