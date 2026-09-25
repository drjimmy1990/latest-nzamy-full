import assert from "node:assert/strict";
import test from "node:test";
import {
  EXEC_REGULATION_TYPE,
  SECTION_30,
  buildLawFacets,
  countLaws,
  docTypesFor,
  lawsFilterKey,
  lawsFilterParams,
  toSectionCode,
  toTaxonomyId,
  type LawFacetRow,
} from "./lawsIndexFacets.ts";

// Per-section totals measured on self-hosted library.laws, 2026-09-25
// (count=exact per section_code; they sum to the table's 5,901).
const SECTION_TOTALS: Record<string, number> = {
  "00": 119, "01": 95, "02": 442, "03": 30, "04": 233, "05": 40, "06": 296, "07": 168,
  "08": 319, "09": 146, "10": 231, "11": 132, "12": 134, "13": 546, "14": 147, "15": 50,
  "16": 152, "17": 78, "18": 175, "19": 84, "20": 273, "21": 56, "22": 43, "23": 209,
  "24": 149, "25": 120, "26": 339, "27": 132, "28": 29, "29": 831, "30": 103,
};

test("toSectionCode accepts the UI id, padded and bare codes; rejects anything else", () => {
  assert.equal(toSectionCode("SA-06"), "06");
  assert.equal(toSectionCode("sa-06"), "06");
  assert.equal(toSectionCode("06"), "06");
  assert.equal(toSectionCode("6"), "06");
  assert.equal(toSectionCode(" 30 "), "30");
  assert.equal(toSectionCode(8), "08");
  for (const bad of ["", "all", "SA-", "SA-100", "123", "06,07", "06)", null, undefined, {}]) {
    assert.equal(toSectionCode(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("toTaxonomyId pads bare decree codes so '8' matches the SA-08 chip (LIB-09)", () => {
  assert.equal(toTaxonomyId("8"), "SA-08");
  assert.equal(toTaxonomyId("02"), "SA-02");
  assert.equal(toTaxonomyId("30"), "SA-30");
  assert.equal(toTaxonomyId("SA-04"), "SA-04");
  assert.equal(toTaxonomyId(null), null);
  assert.equal(toTaxonomyId(""), null);
});

test("section facets over grouped rows sum to the whole table, not to one loaded page", () => {
  const rows: LawFacetRow[] = Object.entries(SECTION_TOTALS).map(([code, n]) => ({
    section_code: code, type: "نظام", has_merged_regulation: false, n,
  }));
  const facets = buildLawFacets(rows);
  assert.equal(facets.total, 5901);
  const sum = Object.values(facets.sections).reduce((a, s) => a + s.total, 0);
  assert.equal(sum, 5901);
  assert.equal(Object.keys(facets.sections).length, 31);
  // Section 30 has a chip id of its own and its 103 laws are counted.
  assert.equal(countLaws(facets, SECTION_30.id, "all"), 103);
  assert.equal(countLaws(facets, "SA-29", "all"), 831);
  assert.equal(countLaws(facets, "all", "all"), 5901);
  // A category the table holds no laws in reads 0, never a placeholder.
  assert.equal(countLaws(facets, "SA-99", "all"), 0);
});

test("the «لائحة تنفيذية» count includes merged regulations without double counting", () => {
  // Mirrors the measured shape: 2,155 rows typed لائحة تنفيذية, 233 laws with
  // has_merged_regulation of which 217 are not themselves typed لائحة تنفيذية
  // → the init route's `type.eq.لائحة تنفيذية OR has_merged_regulation` = 2,372.
  const rows: LawFacetRow[] = [
    { section_code: "06", type: EXEC_REGULATION_TYPE, has_merged_regulation: false, n: 2139 },
    { section_code: "06", type: EXEC_REGULATION_TYPE, has_merged_regulation: true, n: 16 },
    { section_code: "06", type: "نظام", has_merged_regulation: true, n: 200 },
    { section_code: "13", type: "نظام", has_merged_regulation: true, n: 17 },
    { section_code: "13", type: "نظام", has_merged_regulation: false, n: 376 },
    { section_code: "13", type: "قرار", has_merged_regulation: false, n: 1037 },
  ];
  const facets = buildLawFacets(rows);
  assert.equal(countLaws(facets, "all", EXEC_REGULATION_TYPE), 2155 + 217);
  assert.equal(countLaws(facets, "SA-06", EXEC_REGULATION_TYPE), 2155 + 200);
  assert.equal(countLaws(facets, "SA-13", EXEC_REGULATION_TYPE), 17);
  assert.equal(countLaws(facets, "SA-13", "نظام"), 393);
  assert.equal(countLaws(facets, "SA-13", "قرار"), 1037);
  assert.equal(countLaws(facets, "SA-06", "قرار"), 0);
  // Type counts still sum to the table total (merged regulations are not a type).
  const typeSum = Object.values(facets.types).reduce((a, b) => a + b, 0);
  assert.equal(typeSum, facets.total);
});

test("per-row input (the paged scan fallback) counts like the grouped RPC rows", () => {
  const perRow: LawFacetRow[] = [
    { section_code: "8", type: "نظام" },
    { section_code: "08", type: "نظام", has_merged_regulation: true },
    { section_code: null, type: null },
  ];
  const facets = buildLawFacets(perRow);
  assert.equal(facets.total, 3);
  assert.equal(countLaws(facets, "SA-08", "all"), 2);
  assert.equal(countLaws(facets, "SA-08", EXEC_REGULATION_TYPE), 1);
  assert.equal(facets.sections[""].total, 1);
});

test("docTypesFor lists the types the data holds, most frequent first, zeros dropped", () => {
  const facets = buildLawFacets([
    { section_code: "13", type: "قرار", n: 10 },
    { section_code: "13", type: "نظام", has_merged_regulation: true, n: 3 },
    { section_code: "13", type: "", n: 2 },
    { section_code: "02", type: "اتفاقية دولية", n: 5 },
  ]);
  assert.deepEqual(docTypesFor(facets, "SA-13"), [
    { type: "قرار", count: 10 },
    // Ties break alphabetically: ل before ن.
    { type: EXEC_REGULATION_TYPE, count: 3 },
    { type: "نظام", count: 3 },
  ]);
  assert.deepEqual(docTypesFor(facets, "SA-02"), [{ type: "اتفاقية دولية", count: 5 }]);
  assert.deepEqual(docTypesFor(facets, "SA-99"), []);
});

test("laws filter params send the stored code and omit 'all'", () => {
  assert.deepEqual(lawsFilterParams("all", "all"), {});
  assert.deepEqual(lawsFilterParams("SA-06", "all"), { section_code: "06" });
  assert.deepEqual(lawsFilterParams("SA-30", "نظام"), { section_code: "30", type: "نظام" });
  assert.deepEqual(lawsFilterParams("all", EXEC_REGULATION_TYPE), { type: EXEC_REGULATION_TYPE });
  assert.notEqual(lawsFilterKey("SA-06", "all"), lawsFilterKey("SA-06", "نظام"));
});
