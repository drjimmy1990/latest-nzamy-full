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
  assert.match(SIDEBAR, /typeField\?\.value \|\| law\.documentType \|\| ""/);
  // The type is the badge, not repeated as a row (owner ٢٦١ layout).
  assert.match(SIDEBAR, /if \(f\.id === "type"\) return null;/);
});

test("under the file's card a subscriber still gets the DB official link / gazette when the card has no row for them", () => {
  assert.match(SIDEBAR, /const cardRows = \[\.\.\.law\.metadata_card\.main, \.\.\.law\.metadata_card\.more\];/);
  assert.match(SIDEBAR, /const dbOfficialRows = renderDbOfficialRows\(cardRows, topLinks\);/);
  assert.match(SIDEBAR, /\{dbOfficialRows\}/);
  assert.match(SIDEBAR, /if \(metaLocked \|\| !officialMeta\) return null;/);
  // The rule itself is dbOfficialRowsUnderCard (_official-meta.test.ts), not a loose key match:
  // «الجهة المصدرة» contains «المصدر» and hid the link on nearly every card.
  // (owner ٢٩٧: not repeated when the issuer row already shows that link).
  assert.match(SIDEBAR, /const found = dbOfficialRowsUnderCard\(rows, officialMeta, officialLink\);/);
  // Note ٠١ item ٣: nor repeated when «المصادر الرسمية» at the top already lists it.
  assert.match(SIDEBAR, /const sourceUrl = shownLinks\.some\(\(l\) => l\.url === found\.sourceUrl\) \? "" : found\.sourceUrl;/);
  assert.doesNotMatch(SIDEBAR, /f\.key\.includes\("المصدر"\)/);
});

test("the موجز box is not printed, like the preamble", () => {
  assert.match(BOX, /overflow-hidden print:hidden/);
});

test("a card value's link is a link only when it is http(s)", () => {
  assert.match(SIDEBAR, /if \(!\/\^https\?:\\\/\\\/\\S\+\$\/i\.test\(url\)\) \{\n\s*parts\.push\(text\);/);
});
