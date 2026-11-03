import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { filterCircuits, type CircuitRow } from "./circuitsDirectoryFilter.ts";
import { compileQueryMatcher, highlightMultiColorSegments, matchesQuery, parseHighlightQuery } from "./multiColorSearch.ts";

const row = (o: Partial<CircuitRow>): CircuitRow => ({
  id: "x", name: "", category: "", region: "", city: "", email: "", needsVerification: false, ...o,
});

const FIXTURES: CircuitRow[] = [
  row({ id: "jed-com", name: "الدائرة التجارية الأولى بالمحكمة التجارية بجدة", category: "محكمة تجارية", region: "منطقة مكة المكرمة", city: "جدة", email: "COMA@MOJ.GOV.SA" }),
  row({ id: "ryd-com", name: "المحكمة التجارية بالرياض", category: "محكمة تجارية", region: "منطقة الرياض", city: "منطقة الرياض", email: "CR@MOJ.GOV.SA" }),
  row({ id: "ryd-exe", name: "الدائرة الأولى بمحكمة التنفيذ", category: "محكمة تنفيذ", region: "منطقة الرياض", city: "الرياض", email: "EXEA@MOJ.GOV.SA", needsVerification: true }),
  row({ id: "jed-gen", name: "الدائرة الانهائية ١ بالمحكمة العامة بمحافظة جدة", category: "محكمة عامة", region: "منطقة مكة المكرمة", city: "جدة", email: "GEN1@MOJ.GOV.SA" }),
  row({ id: "dam-per", name: "محكمة الأحوال الشخصية بالدمام", category: "محاكم ودوائر قضائية", region: "المنطقة الشرقية", city: "الدمام", email: "PS@MOJ.GOV.SA" }),
];
const ids = (q: string, extra: Omit<Parameters<typeof filterCircuits>[1], "query"> = {}) =>
  filterCircuits(FIXTURES, { query: q, ...extra }).map((r) => r.id);

test("note ٠٧: «تجارية جده» crosses name/category and city (with ة/ه folding)", () => {
  assert.deepEqual(ids("تجارية جده"), ["jed-com"]);
});

test("note ٠٧: «تنفيذ + الرياض» — the category in one field, the city in another", () => {
  assert.deepEqual(ids("تنفيذ + الرياض"), ["ryd-exe"]);
});

test("note ٠٧: «الدائرة 1» finds «الدائرة ١»; «الاحوال» finds «الأحوال»", () => {
  assert.deepEqual(ids("الدائرة 1"), ["jed-gen"]);
  assert.deepEqual(ids("الاحوال"), ["dam-per"]);
});

test("operators in the directory: phrase, OR, prefix, exclusion, e-mail", () => {
  assert.deepEqual(ids('"المحكمة التجارية"'), ["jed-com", "ryd-com"]);
  assert.deepEqual(ids("الدمام / التنفيذ"), ["ryd-exe", "dam-per"]);
  assert.deepEqual(ids("تجاري* -جدة"), ["ryd-com"]);
  assert.deepEqual(ids("exea@moj"), ["ryd-exe"]);
});

test("region / category / verification filters combine with the query", () => {
  assert.deepEqual(ids("", { region: "منطقة الرياض" }), ["ryd-com", "ryd-exe"]);
  assert.deepEqual(ids("المحكمة", { category: "محكمة تجارية", region: "الكل" }), ["jed-com", "ryd-com"]);
  assert.deepEqual(ids("", { verification: "needsVerification" }), ["ryd-exe"]);
  assert.equal(ids("", { verification: "verified" }).length, 4);
  assert.equal(ids("").length, FIXTURES.length);
});

test("real data (2,192 rows): cross-field queries that returned 0 before now find rows", () => {
  const data = JSON.parse(readFileSync(new URL("../../data/circuits-directory.json", import.meta.url), "utf8")) as { circuits: CircuitRow[] };
  assert.equal(data.circuits.length, 2192);
  const execRiyadh = filterCircuits(data.circuits, { query: "تنفيذ + الرياض" });
  assert.ok(execRiyadh.length > 100, `تنفيذ + الرياض → ${execRiyadh.length}`);
  // The old single-field test: no field contains the whole string «تنفيذ الرياض».
  assert.equal(data.circuits.filter((c) => [c.name, c.category, c.city, c.region, c.email].some((f) => f.includes("تنفيذ الرياض"))).length, 0);
  const western = filterCircuits(data.circuits, { query: "الدائرة 1" }).map((r) => r.id);
  const indic = filterCircuits(data.circuits, { query: "الدائرة ١" }).map((r) => r.id);
  assert.ok(western.length > 0);
  assert.deepEqual(western, indic);
  assert.ok(filterCircuits(data.circuits, { query: "عامة جده" }).length > 0, "general courts in Jeddah exist");
});

// ── The owner's own examples from note ٠٦ against the engine ────────────────

const marked = (text: string, q: string) =>
  highlightMultiColorSegments(text, parseHighlightQuery(q).terms).filter((s) => s.term !== null).map((s) => [s.text, s.term]);

test('note ٠٦ examples: «عزل + المحكمة + 1436», «"عزل الوكيل"», «اعتزال / عزل», «وكيل*», «-تحكيم», 123↔١٢٣, الاثبات↔الإثبات', () => {
  const text = "قضت المحكمة عام ١٤٣٦هـ بعزل الوكيل لاعتزاله، وأيدت وكالته في نظام الإثبات (المادة ١٢٣) دون تحكيم";
  assert.deepEqual(marked(text, "عزل + المحكمة + 1436"), [["المحكمة", 1], ["١٤٣٦", 2], ["عزل", 0]]);
  assert.deepEqual(marked("طلب عزل الوكيل", '"عزل الوكيل"'), [["عزل الوكيل", 0]]);
  const or = parseHighlightQuery("اعتزال / عزل");
  assert.deepEqual(or.terms.map((t) => t.color), [0, 1]);
  assert.equal(matchesQuery(["قرار بالعزل"], or), true);
  assert.deepEqual(marked("وكيله ووكالته والوكيلان", "وكيل*"), [["وكيله", 0], ["وكيلان", 0]]);
  const ex = parseHighlightQuery("عزل -تحكيم");
  assert.equal(matchesQuery([text], ex), false);
  assert.equal(matchesQuery(["عزل الوكيل"], ex), true);
  assert.deepEqual(marked(text, "123"), [["١٢٣", 0]]);
  assert.deepEqual(marked(text, "الاثبات"), [["الإثبات", 0]]);
});

test("compileQueryMatcher agrees with matchesQuery", () => {
  for (const q of ["", "عزل", "عزل -تحكيم", "a / b c", '"عزل الوكيل"', "وكيل*"]) {
    const p = parseHighlightQuery(q);
    const m = compileQueryMatcher(p);
    for (const fields of [["عزل الوكيل"], ["تحكيم عزل"], ["a"], ["b", "c"], ["وكيلها"], []]) {
      assert.equal(m(fields), matchesQuery(fields, p), `${q} / ${fields.join("|")}`);
    }
  }
});
