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

test("int(): a refused value can store something else than the empty-input default (a chapter's volume never becomes 1)", () => {
  const r = createSeedValueReport();
  // empty / absent → the column's old default, as before
  assert.equal(r.int("feqh_chapters", "volume_number", "ch1", undefined, 1, null), 1);
  assert.equal(r.int("feqh_chapters", "volume_number", "ch1", "", 1, null), 1);
  // a range is refused → NULL, not an invented volume 1
  assert.equal(r.int("feqh_chapters", "volume_number", "ch2", "3-4", 1, null), null);
  assert.equal(r.int("feqh_chapters", "volume_number", "ch3", "2", 1, null), 2);
  assert.deepEqual(r.snapshot().intRejected.map((e) => [e.key, e.stored]), [["ch2", null]]);
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
  assert.match(SEEDER, /page_label: values\.label\("feqh_blocks", "page_label", `\$\{secId\}__blk-\$\{pi\}`, pg\.page_label, pg\.page_number, 60\)/);
  assert.match(SEEDER, /volume_label: values\.label\("feqh_blocks", "volume_label", `\$\{secId\}__blk-\$\{pi\}`, pg\.volume_label, pg\.volume, 60\)/);
  for (const field of ["year_hijri", "volume_number", "page_number"]) {
    assert.match(SEEDER, new RegExp(`${field}: values\\.int\\(`), `${field} goes through values.int`);
  }
  // a chapter's refused volume is NULL (the column is nullable), never the empty-input 1
  assert.match(SEEDER, /volume_number: values\.int\("feqh_chapters", "volume_number", chId, [^,]*(?:,[^,]*)?, 1, null\),/);
  assert.match(SEEDER, /values\.reset\(\);/);
  assert.match(SEEDER, /value_report: seedValueReportJson\(valueReport, finishedAt\.toISOString\(\)\)/);
  assert.match(SEEDER, /seed-value-report\.json/);
});

test("label(): a refused page or volume keeps its verbatim text in the label twin; nothing else changes", () => {
  const r = createSeedValueReport();
  // the source's own label always wins
  assert.equal(r.label("feqh_blocks", "page_label", "b1", "مقدمة", "12-13", 60), "مقدمة");
  // a range refused by the integer column survives in the label
  assert.equal(r.int("feqh_blocks", "page_number", "b2", "12-13", null), null);
  assert.equal(r.label("feqh_blocks", "page_label", "b2", null, "12-13", 60), "12-13");
  // a whole number, or no value: the label exactly as it came
  assert.equal(r.label("feqh_blocks", "page_label", "b3", null, "218", 60), null);
  assert.equal(r.label("feqh_blocks", "page_label", "b4", "", 218, 60), "");
  assert.equal(r.label("feqh_blocks", "page_label", "b5", undefined, undefined, 60), null);
  // the label column is varchar(60): a longer verbatim value is cut and reported
  assert.equal(r.label("feqh_blocks", "volume_label", "b6", null, "س".repeat(70), 60)?.length, 60);
  assert.ok(r.snapshot().truncated.some((t) => t.field === "volume_label" && t.key === "b6"));
});

// ── What changed against the old safeInt (measured, not asserted) ──────────
// The seeder's old rule, verbatim from before N2.7:
function oldSafeInt(v: unknown, fallback: number | null): number | null {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n >= -2147483648 && n <= 2147483647 ? n : fallback;
}

test("old safeInt vs values.int: identical for plain integers and empty input; the differences are listed", () => {
  const same: unknown[] = [12, 0, -3, "12", " 12 ", "1434", "1434هـ", "1434 ه", null, undefined, "", "abc", NaN, Infinity, 3e10, "99999999999"];
  for (const v of same) {
    const r = createSeedValueReport();
    assert.equal(r.int("t", "f", "k", v, null), oldSafeInt(v, null), `same for ${String(v)}`);
  }
  // Every input whose stored value changes, old → new:
  const changed: Array<[unknown, number | null, number | null]> = [
    // refused handling (the point of N2.7): a range or trailing text no longer loads as its first number
    ["1439-1441", 1439, null],
    ["12-13", 12, null],
    ["12أ", 12, null],
    ["12.5", 12, null],
    // NOT refused handling: Arabic-Indic / Persian digits now read as the number (were NaN → fallback)
    ["١٤٣٤", null, 1434],
    ["۱۲", null, 12],
    // a fractional number used to reach the integer column as 12.5 (a 22P02 for the batch)
    [12.5, 12.5, null],
  ];
  for (const [v, before, after] of changed) {
    const r = createSeedValueReport();
    assert.equal(oldSafeInt(v, null), before, `old ${String(v)}`);
    assert.equal(r.int("t", "f", "k", v, null), after, `new ${String(v)}`);
  }
});
