/**
 * N2.2 — the outer cards: two lines of موجز + «... قراءة المزيد ▾» / «طي الموجز ▴»
 * in place, the toggle only when the text is really cut, never opening the card.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clampOverflows, lawCardSummaryText, summaryToggleLabel } from "./summaryClamp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(path.join(here, f), "utf8").replace(/\r\n/g, "\n");

test("the card text: the موجز first; a description only when it is not the title again", () => {
  assert.equal(lawCardSummaryText("موجز النظام", "وصف", "نظام العمل"), "موجز النظام");
  assert.equal(lawCardSummaryText("", "نظام العمل", "نظام العمل"), "");
  assert.equal(lawCardSummaryText("  ", " نظام العمل ", "نظام العمل"), "");
  assert.equal(lawCardSummaryText(null, "ينظم علاقات العمل", "نظام العمل"), "ينظم علاقات العمل");
  assert.equal(lawCardSummaryText(undefined, undefined, undefined), "");
});

test("the toggle shows only when two lines cut the text", () => {
  assert.equal(clampOverflows(40, 40), false);
  assert.equal(clampOverflows(41, 40), false); // rounding
  assert.equal(clampOverflows(60, 40), true);
});

test("labels as in the owner preview", () => {
  assert.equal(summaryToggleLabel(false), "... قراءة المزيد ▾");
  assert.equal(summaryToggleLabel(true), "طي الموجز ▴");
  assert.equal(summaryToggleLabel(false, false), "... Read more ▾");
});

test("ClampedSummary: line-clamp-2 until opened, aria-expanded, stops the card's click, dark mode", () => {
  const src = read("ClampedSummary.tsx");
  assert.match(src, /\$\{expanded \? "" : "line-clamp-2"\}/);
  assert.match(src, /aria-expanded=\{expanded\}/);
  assert.match(src, /e\.preventDefault\(\);\n\s*e\.stopPropagation\(\);\n\s*setExpanded/);
  assert.match(src, /\{\(overflows \|\| expanded\) && \(/);
  assert.match(src, /isDark \? "text-\[#C8A762\]" : "text-\[#0B3D2E\]"/);
  assert.doesNotMatch(src, /text-gray-(100|200)\b/);
});

test("the law cards (grid and list) and the decree / precedent cards use it", () => {
  const laws = read("LawsTabContent.tsx");
  assert.equal(laws.match(/<ClampedSummary /g)?.length, 2);
  assert.equal(laws.match(/lawCardSummaryText\(sys\.summaryBrief,/g)?.length, 2);
  const items = read("ListItems.tsx");
  assert.equal(items.match(/<ClampedSummary /g)?.length, 4);
  const page = read("../page.tsx");
  assert.match(page, /summaryBrief: stripMarkdownMarks\(law\.summary_brief \|\| ""\),/);
});
