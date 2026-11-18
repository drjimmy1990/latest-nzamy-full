/**
 * Owner ٣٨ (18 Nov 2026): the five analysis tools show an indicator only as
 * «مؤشر مساعد», never an outcome prediction; the fake «قوة موقفك القانوني» bar
 * and the dead wargaming mock are gone.
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

test("the label and its line: «مؤشر مساعد», and it never predicts the outcome", () => {
  assert.equal(ASSIST_INDICATOR_LABEL, "مؤشر مساعد");
  assert.match(ASSIST_INDICATOR_NOTE, /لا يتنبأ بنتيجة القضية/);
});

test("a percentage is only ever «مؤشر مساعد: N٪», 0–100, Arabic digits", () => {
  assert.equal(assistIndicatorPercent(65), "مؤشر مساعد: ٦٥٪");
  assert.equal(assistIndicatorPercent(0), "مؤشر مساعد: ٠٪");
  assert.equal(assistIndicatorPercent(99.6), "مؤشر مساعد: ١٠٠٪");
  for (const bad of [-1, 101, NaN, Infinity, "65", null, undefined]) assert.equal(assistIndicatorPercent(bad), null, String(bad));
});

test("no bare percentage on the five tools' result screens; the two with an indicator carry the label", () => {
  for (const rel of ASSIST_INDICATOR_SCREENS) {
    assert.doesNotMatch(code(rel), /٪|%\}|\d%|\$\{[^}]*\}%/, rel);
  }
  assert.match(src("app/ai/analyze-strength/page.tsx"), /<AssistIndicatorNote isDark=\{isDark\}/);
  assert.match(src("app/ai/wargaming/_SimResultView.tsx"), /<AssistIndicatorNote isDark=\{isDark\}/);
  assert.match(src("components/ai/AssistIndicatorNote.tsx"), /assistIndicatorPercent\(percent\) \?\? ASSIST_INDICATOR_LABEL/);
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
