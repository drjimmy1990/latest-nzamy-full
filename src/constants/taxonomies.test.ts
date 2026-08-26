import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEGAL_TAXONOMY,
  normalizeCategoryId,
  categoryLabelFor,
} from "./taxonomies.ts";

test("the vocabulary is the 31 the owner ruled on", () => {
  assert.equal(LEGAL_TAXONOMY.length, 31);
});

test("REGRESSION: the three spellings of one specialisation now agree", () => {
  // dashboard/client/find-lawyer wrote `real-estate` into metadata.specialty
  // on real requests, EscalationFlow used `real_estate`, and
  // dashboard/micro/find-lawyer used the Arabic label itself as the id. Three
  // spellings of SA-07 in one database, groupable by nothing.
  for (const legacy of ["real-estate", "real_estate", "عقاري", "عقارات", "القضايا العقارية"]) {
    assert.equal(normalizeCategoryId(legacy), "SA-07", `failed: ${legacy}`);
  }
});

test("every legacy id still in a picker resolves", () => {
  const inUse: [string, string][] = [
    ["labor", "SA-06"], ["عمالي", "SA-06"], ["قضايا عمالية", "SA-06"],
    ["commercial", "SA-04"], ["corporate", "SA-04"], ["تجاري", "SA-04"], ["شركات", "SA-04"],
    ["family", "SA-03"], ["civil", "SA-03"], ["أحوال شخصية", "SA-03"],
    ["criminal", "SA-01"], ["جنائي", "SA-01"], ["جزائي", "SA-01"],
    ["ip", "SA-05"], ["ملكية فكرية", "SA-05"],
    ["admin", "SA-02"], ["إداري", "SA-02"],
    ["بنكي/مالي", "SA-08"], ["تنفيذ", "SA-00"],
  ];
  for (const [legacy, expected] of inUse) {
    assert.equal(normalizeCategoryId(legacy), expected, `failed: ${legacy}`);
  }
});

test("canonical ids and slugs pass through, in any case", () => {
  assert.equal(normalizeCategoryId("SA-06"), "SA-06");
  assert.equal(normalizeCategoryId("sa-06"), "SA-06");
  assert.equal(normalizeCategoryId("sec_06_labor"), "SA-06");
});

test("the all-option and the unknown resolve to null, never to a guessed category", () => {
  assert.equal(normalizeCategoryId("all"), null);
  assert.equal(normalizeCategoryId("الكل"), null);
  assert.equal(normalizeCategoryId(""), null);
  assert.equal(normalizeCategoryId("   "), null);
  assert.equal(normalizeCategoryId(null), null);
  assert.equal(normalizeCategoryId(undefined), null);
  assert.equal(normalizeCategoryId("something-nobody-defined"), null);
});

test("a label is always Arabic, and an unmapped value shows itself rather than an English id", () => {
  assert.equal(categoryLabelFor("real_estate"), "العقاري والبناء والمقاولات");
  assert.equal(categoryLabelFor("SA-06"), "العمل والتأمينات");
  // The intakeValues.ts rule: never print «—» over a value the client actually
  // chose, and never print a raw English key where a human wrote Arabic.
  assert.equal(categoryLabelFor("العقود والاتفاقيات"), "العقود والاتفاقيات");
  assert.equal(categoryLabelFor(null), "");
});

test("no alias points at a category that does not exist", () => {
  // The alias table is hand-written; a typo would silently produce a label of
  // the raw id instead of an Arabic name.
  const ids = new Set(LEGAL_TAXONOMY.map((c) => c.id));
  for (const legacy of ["labor", "commercial", "criminal", "ip", "admin", "banking", "arbitration", "enforcement", "civil", "real_estate"]) {
    const mapped = normalizeCategoryId(legacy);
    assert.ok(mapped && ids.has(mapped), `${legacy} maps to ${mapped}, which is not in LEGAL_TAXONOMY`);
  }
});
