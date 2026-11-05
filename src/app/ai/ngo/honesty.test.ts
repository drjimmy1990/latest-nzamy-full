/**
 * Owner's 30-Oct package, the NGO / government tool screens:
 * - LIVE-F19: the governance score vanishes on refresh while a «PDF» button
 *   (no handler) implied a kept report.
 * - the deadline calculator accepted a negative period.
 *
 * Source-read (.tsx cannot load under node --test); comments are stripped.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
const read = (f: string) => strip(readFileSync(new URL(f, import.meta.url), "utf8"));

const governance = read("./governance-checker/page.tsx");
const deadlines = read("../gov/deadline-calculator/page.tsx");

test("governance checker: says it is a temporary calculation and promises no PDF", () => {
  assert.match(governance, /حساب مؤقت: لا تُحفظ إجاباتك ولا النسبة/);
  assert.doesNotMatch(governance, /PDF/);
  assert.match(governance, /onClick=\{copyResult\}/);
  // the notice comes before the score
  assert.ok(governance.indexOf("حساب مؤقت") < governance.indexOf(">{score}%<"));
});

test("deadline calculator: refuses a period under one day", () => {
  assert.match(deadlines, /form\.periodDays >= 1/);
  assert.match(deadlines, /\|\| periodError\) return;/);
  assert.match(deadlines, /min=\{1\}/);
});
