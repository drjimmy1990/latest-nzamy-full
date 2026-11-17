/**
 * «دليل ناجز» as data (owner package 13 Nov, N06-4 / N06-5): 7 courts → 43
 * classes → 243 types and the six filing steps, with no PDF page reference
 * left, and the committed JSON exactly what the builder makes of the guide.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/murshid/najizClassifications.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractUserGuide, parseGuideBlocks, stripInternalNotes } from "./guideBlocks.ts";
import { buildNajizClassifications, headingCount, withoutPages, type NajizClassifications } from "./najizClassifications.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, "../../data/murshid");
const md = fs.readFileSync(path.join(dataDir, "najiz-guide-2026-10-28.md"), "utf8").replace(/\r\n/g, "\n");
const built = buildNajizClassifications(parseGuideBlocks(stripInternalNotes(extractUserGuide(md)).md));
const committed = JSON.parse(fs.readFileSync(path.join(dataDir, "najiz-classifications.json"), "utf8")) as NajizClassifications;

test("the committed JSON is the builder's output on the committed guide (run scripts/murshid-najiz-classifications.mjs)", () => {
  assert.deepEqual(committed, built);
});

test("7 courts, 43 classes, 243 types numbered 1–243, six steps", () => {
  assert.equal(built.courts.length, 7);
  const classes = built.courts.flatMap((c) => c.classes);
  assert.equal(classes.length, 43);
  const types = classes.flatMap((k) => k.types);
  assert.equal(types.length, 243);
  assert.deepEqual(types.map((t) => t.no), Array.from({ length: 243 }, (_, i) => i + 1));
  assert.deepEqual(built.steps.map((s) => s.no), [1, 2, 3, 4, 5, 6]);
  for (const t of types) assert.ok(t.name.length > 0, `type ${t.no} has a name`);
});

test("each class holds exactly the count its heading states", () => {
  for (const c of built.courts) {
    for (const k of c.classes) assert.equal(k.types.length, k.count, `${k.no} ${k.title}`);
  }
});

test("no page reference is left anywhere («ص 4»، «ص 6 أسفل»، «تفريغ ص 2»)", () => {
  const text = JSON.stringify(committed);
  assert.doesNotMatch(text, /(?<!\p{L})ص\s*[0-9٠-٩]/u);
  assert.doesNotMatch(text, /\*\*|`/, "no Markdown marks");
  assert.equal(built.courts[0].title, "دعاوى الأحوال الشخصية");
  assert.equal(built.courts[0].classes[3].title, "دعاوى الحضانة والزيارة والنفقة");
  assert.equal(built.courts[0].scopeIntro, "تختص محاكم الأحوال الشخصية بالنظر فيما يلي:");
});

test("the page-reference scrub and the count words", () => {
  assert.equal(withoutPages("1.4 التصنيف الفرعي الرابع: دعاوى الحضانة (ص 6 أسفل — 8 أنواع)"), "1.4 التصنيف الفرعي الرابع: دعاوى الحضانة");
  assert.equal(withoutPages("**نطاق الاختصاص النوعي (ص 3) — تختص المحاكم**"), "نطاق الاختصاص النوعي — تختص المحاكم");
  assert.equal(withoutPages("دليل الخطوات (تفريغ ص 2)"), "دليل الخطوات");
  assert.equal(withoutPages("نص 5 من النظام"), "نص 5 من النظام", "a word ending in ص is not a page");
  assert.equal(headingCount("(ص 4 — 8 أنواع)"), 8);
  assert.equal(headingCount("(ص 11 — 11 نوعاً)"), 11);
  assert.equal(headingCount("(ص 17 أعلى — نوعان)"), 2);
  assert.equal(headingCount("(ص 19 أعلى — نوع واحد)"), 1);
  assert.equal(headingCount("بلا عدد"), null);
});
