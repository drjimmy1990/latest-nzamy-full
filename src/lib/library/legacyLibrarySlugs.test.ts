/**
 * q390 (S1 Task 4): the 33 bundled collections and the bundled book had
 * English slugs. The bundles go; the slugs stay as catalogue entries only —
 * a title and the database id (null until the production precheck answers).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LEGACY_BOOK_SLUGS, LEGACY_COLLECTION_SLUGS, legacyTarget } from "./legacyLibrarySlugs.ts";

const BUNDLED = [
  "admin-supreme-1439-1440-1441-part1", "admin-supreme-1439-1440-1441-part2",
  "admin-supreme-1442-part1", "admin-supreme-1442-part2", "admin-supreme-1442-part3",
  "admin-supreme-1443-part1", "admin-supreme-1443-part2", "admin-supreme-1443-part3",
  "admin-supreme-1443-part4", "admin-supreme-1443-part5",
  "admin-supreme-1444-part1", "admin-supreme-1444-part2", "admin-supreme-1444-part3",
  "admin-supreme-1444-part4", "admin-supreme-1444-part5",
  "banking-1408-1427", "banking-1443", "commercial-papers", "customs-2015-2023", "customs-2024",
  "insurance-principles", "labor-principles-1431-vol1", "labor-principles-1431-vol2",
  "labor-principles-1432", "price-adjustment", "supreme-judicial-council", "tamyeez",
  "tax-2024", "zakat-2024", "zakat-tax-2020-2021-j1", "zakat-tax-2020-2021-j2",
  "zakat-tax-2022-j3", "zakat-tax-2023-j4",
];

test("34 collection keys: the 33 bundled slugs plus insurance-1438", () => {
  assert.equal(BUNDLED.length, 33);
  assert.equal(Object.keys(LEGACY_COLLECTION_SLUGS).length, 34);
  assert.deepEqual(Object.keys(LEGACY_COLLECTION_SLUGS).sort(), [...BUNDLED, "insurance-1438"].sort());
  assert.equal(LEGACY_COLLECTION_SLUGS["insurance-1438"], LEGACY_COLLECTION_SLUGS["insurance-principles"]);
});

test("every entry is a non-empty Arabic title and a dbId that is null or a non-empty id", () => {
  for (const [slug, entry] of [...Object.entries(LEGACY_COLLECTION_SLUGS), ...Object.entries(LEGACY_BOOK_SLUGS)]) {
    assert.ok(typeof entry.titleAr === "string" && /[؀-ۿ]/.test(entry.titleAr), slug);
    assert.ok(entry.dbId === null || (typeof entry.dbId === "string" && entry.dbId.trim() !== ""), slug);
  }
  assert.ok(Object.isFrozen(LEGACY_COLLECTION_SLUGS) && Object.isFrozen(LEGACY_BOOK_SLUGS));
});

test("legacyTarget finds a collection and the book by their legacy slug", () => {
  assert.equal(legacyTarget("collection", "tamyeez")?.titleAr, "تقريرات محكمة التمييز");
  assert.equal(legacyTarget("collection", "insurance-1438")?.titleAr, "مدونة المبادئ القضائية التأمينية");
  assert.equal(legacyTarget("collection", " tamyeez ")?.titleAr, "تقريرات محكمة التمييز", "normalised like a quota key");
  assert.equal(legacyTarget("book", "sources-of-right-1")?.titleAr, "مصادر الحق في الفقه الإسلامي");
  assert.deepEqual(Object.keys(LEGACY_BOOK_SLUGS), ["sources-of-right-1"]);
});

test("legacyTarget: unknown, encoded, empty and prototype slugs are null, never a throw", () => {
  assert.equal(legacyTarget("collection", "%D8%A3"), null);
  assert.equal(legacyTarget("collection", "%E0%A4%A"), null);
  assert.equal(legacyTarget("collection", ""), null);
  assert.equal(legacyTarget("collection", "constructor"), null);
  assert.equal(legacyTarget("collection", "__proto__"), null);
  assert.equal(legacyTarget("book", "tamyeez"), null, "kinds do not mix");
  assert.equal(legacyTarget("collection", "sources-of-right-1"), null, "kinds do not mix");
});

test("source scan: no value is longer than 200 characters, so no text can hide here", () => {
  const src = readFileSync(new URL("./legacyLibrarySlugs.ts", import.meta.url), "utf8");
  const literals = [...src.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((m) => m[2]);
  assert.ok(literals.length >= 34, "the scan reads the literals");
  for (const value of literals) assert.ok(value.length <= 200, `a ${value.length}-character literal`);
  assert.doesNotMatch(src, /import\s*\(|\.json["']/, "no bundle is imported");
});
