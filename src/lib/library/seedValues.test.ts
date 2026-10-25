/**
 * N2.7 — the seeder's integer and varchar rules (src/lib/library/seedValues.ts)
 * and their use in scripts/seed-library.ts (source pins: the seeder needs a
 * corpus and a database to run, and is never run from here).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSeedValueReport,
  parseStrictInt,
  summarizeSeedValueReport,
} from "./seedValues.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const SEEDER = readFileSync(path.join(here, "../../../scripts/seed-library.ts"), "utf8").replace(/\r\n/g, "\n");

test("parseStrictInt: a whole integer only — a range is refused, never cut to its first year", () => {
  assert.deepEqual(parseStrictInt("1439-1441"), { value: null, rejected: "a range, not one integer" });
  assert.deepEqual(parseStrictInt("1420 - 1425"), { value: null, rejected: "a range, not one integer" });
  assert.deepEqual(parseStrictInt("1420-1425هـ"), { value: null, rejected: "a range, not one integer" });
  assert.equal(parseStrictInt("12/13").rejected, "a range, not one integer");
  assert.equal(parseStrictInt("1.5").rejected, "not a whole integer");
  assert.equal(parseStrictInt(1.5).rejected, "not a whole number");
  assert.equal(parseStrictInt("المجلد الأول").rejected, "not a whole integer");
  assert.equal(parseStrictInt("99999999999").rejected, "outside the int4 range");
  assert.equal(parseStrictInt({}).rejected, "not a number (object)");
});

test("parseStrictInt: integers in every spelling the corpus uses", () => {
  assert.deepEqual(parseStrictInt("1434"), { value: 1434, rejected: null });
  assert.deepEqual(parseStrictInt(" 1434هـ "), { value: 1434, rejected: null });
  assert.deepEqual(parseStrictInt("1434 ه"), { value: 1434, rejected: null });
  assert.deepEqual(parseStrictInt("١٤٣٤"), { value: 1434, rejected: null });
  assert.deepEqual(parseStrictInt(7), { value: 7, rejected: null });
  assert.deepEqual(parseStrictInt("-3"), { value: -3, rejected: null });
  // empty is not a rejection: the source simply has no value
  assert.deepEqual(parseStrictInt(""), { value: null, rejected: null });
  assert.deepEqual(parseStrictInt(null), { value: null, rejected: null });
  assert.deepEqual(parseStrictInt(undefined), { value: null, rejected: null });
});

test("int(): the fallback for refused and empty input, and one report entry per refusal", () => {
  const r = createSeedValueReport();
  assert.equal(r.int("judicial_collections", "year_hijri", "c1", "1439-1441", null), null);
  assert.equal(r.int("judicial_collections", "year_hijri", "c1", "1439-1441", null), null);
  assert.equal(r.int("feqh_blocks", "volume_number", "b1", "", 1), 1);
  assert.equal(r.int("feqh_blocks", "page_number", "b1", "12", null), 12);
  const snap = r.snapshot();
  assert.equal(snap.intRejected.length, 1);
  assert.deepEqual(snap.intRejected[0], {
    table: "judicial_collections", field: "year_hijri", key: "c1", raw: "1439-1441",
    reason: "a range, not one integer", stored: null,
  });
});

test("cap(): cuts exactly like .substring (ids stay byte-identical) and reports every cut", () => {
  const r = createSeedValueReport();
  const long = "أ".repeat(25);
  assert.equal(r.cap("laws", "issue_date_hijri", "law-1", long, 20), long.substring(0, 20));
  assert.equal(r.cap("laws", "type", "law-1", "نظام", 50), "نظام");
  // an emoji pair is cut where .substring always cut it
  const emoji = "x".repeat(9) + "😀";
  assert.equal(r.cap("laws", "slug", "law-2", emoji, 10), emoji.substring(0, 10));
  const snap = r.snapshot();
  assert.equal(snap.truncated.length, 2);
  assert.deepEqual(snap.truncated[0], { table: "laws", field: "issue_date_hijri", key: "law-1", length: 25, max: 20, identity: false });
  assert.equal(snap.truncated[1].identity, true);
  r.reset();
  assert.equal(r.snapshot().truncated.length, 0);
});

test("summary: identity cuts are named apart", () => {
  const r = createSeedValueReport();
  r.cap("laws", "slug", "k", "s".repeat(201), 200);
  r.cap("laws", "section_name", "k", "n".repeat(201), 200);
  r.int("principles", "year_hijri", "p", "1420-1425", null);
  const lines = summarizeSeedValueReport(r.snapshot()).join("\n");
  assert.match(lines, /Truncated values: 2 \(identity fields: 1\)/);
  assert.match(lines, /⚠ laws\.slug: 1 id\/slug value\(s\) cut/);
  assert.match(lines, /Integer values refused \(ranges \/ non-integers\): 1/);
  assert.match(lines, /principles\.year_hijri p: «1420-1425»/);
});

test("the seeder: no silent parseInt, no bare .substring cap, the report reaches its result", () => {
  assert.doesNotMatch(SEEDER, /function safeInt\(/, "the lenient safeInt is gone");
  assert.doesNotMatch(SEEDER, /parseInt\(/);
  // The only bare .substring left is the hash-suffixed article-id builder,
  // whose cut keeps a unique hash core by design.
  const code = SEEDER.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  const bare = code.match(/\.substring\(0,/g) ?? [];
  assert.equal(bare.length, 1, `bare .substring caps left: ${bare.length}`);
  assert.match(SEEDER, /return `\$\{lawId\.substring\(0, Math\.max\(0, 150 - core\.length\)\)\}\$\{core\}`;/);
  for (const field of ["year_hijri", "volume_number", "page_number"]) {
    assert.match(SEEDER, new RegExp(`${field}: values\\.int\\(`), `${field} goes through values.int`);
  }
  assert.match(SEEDER, /values\.reset\(\);/);
  assert.match(SEEDER, /value_report: seedValueReportJson\(valueReport, finishedAt\.toISOString\(\)\)/);
  assert.match(SEEDER, /seed-value-report\.json/);
});
