/**
 * Owner ٣٨ (18 Nov 2026): the five analysis tools show an indicator only as
 * «مؤشر مساعد», never an outcome prediction; the fake «قوة موقفك القانوني» bar
 * and the dead wargaming mock are gone. Owner ١٢٤a (20 Nov) worded it: a value
 * reads «بنسبة تقديرية X٪», and the fixed line sits on all five result screens.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/assistIndicator.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ASSIST_INDICATOR_LABEL, ASSIST_INDICATOR_NOTE, ASSIST_INDICATOR_SCREENS, assistIndicatorPercent } from "./assistIndicator.ts";

const src = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
/** Comments out: a code comment may name what was removed. */
const code = (rel: string) =>
  src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");

test("owner ١٢٤a: the fixed line «مؤشر مساعد لا يتنبأ بنتيجة القضية»", () => {
  assert.equal(ASSIST_INDICATOR_LABEL, "مؤشر مساعد");
  assert.match(ASSIST_INDICATOR_NOTE, /^مؤشر مساعد لا يتنبأ بنتيجة القضية/);
});

test("owner ١٢٤a: a percentage is only ever «بنسبة تقديرية N٪», 0–100, Arabic digits", () => {
  assert.equal(assistIndicatorPercent(65), "بنسبة تقديرية ٦٥٪");
  assert.equal(assistIndicatorPercent(0), "بنسبة تقديرية ٠٪");
  assert.equal(assistIndicatorPercent(99.6), "بنسبة تقديرية ١٠٠٪");
  for (const bad of [-1, 101, NaN, Infinity, "65", null, undefined]) assert.equal(assistIndicatorPercent(bad), null, String(bad));
});

test("owner ١٢٤a: all five live result screens carry the line, and none prints a bare percentage", () => {
  assert.equal(ASSIST_INDICATOR_SCREENS.length, 5);
  for (const rel of ASSIST_INDICATOR_SCREENS) {
    // A CSS calc(100% - 18px) is layout, not a figure.
    assert.doesNotMatch(code(rel).replace(/calc\([^)]*\)/g, ""), /٪|%\}|\d%|\$\{[^}]*\}%/, rel);
    assert.match(src(rel), /<AssistIndicatorNote isDark=\{isDark\}/, rel);
  }
  // The chip appears only with a real value; the line always.
  const note = src("components/ai/AssistIndicatorNote.tsx");
  assert.match(note, /const chip = assistIndicatorPercent\(percent\);/);
  assert.match(note, /\{chip && \(/);
  assert.match(note, /<span>\{ASSIST_INDICATOR_NOTE\}<\/span>/);
});

test("the client analyzer's hard-coded «قوة موقفك القانوني» bar is gone", () => {
  const analyzer = code("app/ai/analyze/_components/SmartAnalyzer.tsx");
  assert.doesNotMatch(analyzer, /قوة موقفك القانوني|strengthScore|report\.strength/);
  const report = code("app/ai/analyze/_components/evalReport.ts");
  assert.doesNotMatch(report, /strengthScore|strength:|65|35/);
});

test("the dead wargaming mock (an outcome prediction, invented probabilities) is deleted", () => {
  const page = code("app/ai/wargaming/page.tsx");
  assert.doesNotMatch(page, /MOCK_MEMO_BASE|buildPoints|probability|٦٨٪|لصالحك بنسبة|function Results|SimulatingLoader|"simulating"|"results"/);
  assert.doesNotMatch(page, /٪/);
});
