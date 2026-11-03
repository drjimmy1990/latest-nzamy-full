import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { circuitFields, queryMentionsProsecution, searchRows, SUGGESTION_LIMIT } from "./_circuitsSearch.ts";
import { parseHighlightQuery } from "../../../lib/search/multiColorSearch.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const directory = JSON.parse(fs.readFileSync(path.resolve(here, "../../../data/circuits-directory.json"), "utf8")) as {
  circuits: { id: string; name: string; category: string; region: string; city: string; email: string }[];
};
const rows = directory.circuits;
const names = (q: string) => searchRows(rows, q, circuitFields).matches.map((r) => r.name);

test("LIVE-F13: «التجارية + الرياض» and «الرياض + التجارية» find المحكمة التجارية بالرياض, as «التجارية» alone does", () => {
  assert.ok(names("التجارية").includes("المحكمة التجارية بالرياض"));
  assert.ok(names("التجارية + الرياض").includes("المحكمة التجارية بالرياض"));
  assert.ok(names("الرياض + التجارية").includes("المحكمة التجارية بالرياض"));
  assert.ok(names("التجارية الرياض").includes("المحكمة التجارية بالرياض"));
});

test("`+` is never a search word: a query of operators only matches everything", () => {
  assert.equal(searchRows(rows, " + ", circuitFields).matches.length, rows.length);
});

test("`/` is OR, `-` excludes, a phrase stays whole, `*` is a prefix", () => {
  const or = searchRows(rows, "التجارية / الاستئناف", circuitFields).matches;
  assert.ok(or.some((r) => r.name === "المحكمة التجارية بالرياض"));
  assert.ok(or.some((r) => r.category === "استئناف"));

  const withEx = searchRows(rows, "التجارية -الرياض", circuitFields).matches;
  assert.ok(!withEx.some((r) => r.name === "المحكمة التجارية بالرياض"));

  const phrase = searchRows(rows, '"المحكمة التجارية"', circuitFields).matches;
  assert.ok(phrase.length >= 1 && phrase.every((r) => /المحكمة التجارية/.test(r.name)));

  const prefix = searchRows(rows, "تجار*", circuitFields).matches;
  assert.ok(prefix.some((r) => r.name === "المحكمة التجارية بالرياض"));
});

test("Arabic folding: hamza, taa marbuta and alif maqsura are interchangeable", () => {
  assert.deepEqual(names("التجاريه + الرياض"), names("التجارية + الرياض"));
  assert.ok(names("احوال").length > 0);
  assert.deepEqual(names("احوال"), names("أحوال"));
});

test("NOTE-19 «الشرقية + اموال»: no row, «اموال» reported unmatched, up to 10 «هل تقصد» rows, prosecution flagged", () => {
  const r = searchRows(rows, "الشرقية + اموال", circuitFields);
  assert.equal(r.matches.length, 0);
  assert.deepEqual(r.unmatchedTerms.map((t) => t.label), ["اموال"]);
  assert.ok(r.suggestions.length > 0 && r.suggestions.length <= SUGGESTION_LIMIT);
  assert.ok(r.suggestions.every((s) => /الشرقي/.test(circuitFields(s).join(" "))));
  assert.equal(r.mentionsProsecution, true);
});

test("suggestions rank by words matched and still honour exclusions", () => {
  const r = searchRows(rows, "التجارية + الرياض + غيرموجودةاطلاقا -بالرياض", circuitFields);
  assert.equal(r.matches.length, 0);
  assert.deepEqual(r.unmatchedTerms.map((t) => t.label), ["غيرموجودةاطلاقا"]);
  assert.ok(!r.suggestions.some((s) => s.name.includes("بالرياض")));
});

test("a query with matches carries no suggestions or unmatched words", () => {
  const r = searchRows(rows, "التجارية", circuitFields);
  assert.equal(r.suggestions.length, 0);
  assert.equal(r.unmatchedTerms.length, 0);
});

test("prosecution keywords are detected after folding, and only those", () => {
  for (const q of ["النيابة العامة", "النيابه", "دائرة الأموال", "التحقيق", "هيئة الادعاء"]) {
    assert.equal(queryMentionsProsecution(parseHighlightQuery(q)), true, q);
  }
  for (const q of ["التجارية", "الرياض", "-نيابة"]) {
    assert.equal(queryMentionsProsecution(parseHighlightQuery(q)), false, q);
  }
});
