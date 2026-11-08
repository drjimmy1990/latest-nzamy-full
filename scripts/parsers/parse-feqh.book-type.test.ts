/**
 * DATA-01 (final handoff 2026-11-06): a fiqh-library book's sharia / wadi
 * type comes from the owner's own statements before any guess — the two cited
 * books «الأسس العامة للعقود الإدارية» (school «قانون مقارن وحديث», was
 * sharia) and «الأموال» لأبي عبيد (no school, was wadi). Temp fixtures only.
 *   node --import tsx --test scripts/parsers/parse-feqh.book-type.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { classifyFeqhBookType, parseFeqh } from "./parse-feqh.ts";

function book(folder: string, name: string, frontmatter: string): string {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-feqh-type-")), folder);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, `---
${frontmatter}---
## باب

<!-- PAGE_START {"page": 1, "volume": 1} -->
نص الصفحة الأولى.
<!-- PAGE_END -->
`, "utf8");
  return file;
}

const typeOf = (file: string) => {
  const out = parseFeqh(file);
  assert.equal(out.books.length, 1);
  return out.books[0].type;
};

test("DATA-01: «الأسس العامة للعقود الإدارية» (school «قانون مقارن وحديث») is wadi", () => {
  const f = book("كتب", "الأسس العامة للعقود الإدارية - دراسة مقارنة.md",
    "title: الأسس العامة للعقود الإدارية - دراسة مقارنة\nauthor: سليمان محمد سليمان الطماوي\nschool: قانون مقارن وحديث\ntype: كتاب فقهي\n");
  assert.equal(typeOf(f), "wadi");
});

test("DATA-01: «الأموال» لأبي عبيد (school null, as text or absent) is sharia", () => {
  for (const school of ["school: null\n", "school: None\n", ""]) {
    const f = book("كتب", "الأموال.md", `title: الأموال\nauthor: القاسم بن سلاّم أبو عبيد\n${school}type: كتاب فقهي\n`);
    assert.equal(typeOf(f), "sharia", JSON.stringify(school));
  }
});

test("the owner's folder label «- قانوني» / «- شرعي» decides before the school", () => {
  const law = book("2- مؤلفات سليمان الطماوي - قانوني", "القضاء الإداري.md", "title: القضاء الإداري\nauthor: الطماوي\nschool: حنبلي\n");
  assert.equal(typeOf(law), "wadi");
  const sharia = book(path.join("الإنصاف - شرعي", "ج1"), "الإنصاف_ج1.md", "title: الإنصاف\nauthor: المرداوي\n");
  assert.equal(typeOf(sharia), "sharia");
});

test("unchanged: a madhab book stays sharia; an explicit book_kind or type word wins", () => {
  const base = { filePath: path.join("x", "y.md"), title: "كتاب", author: "مؤلف" };
  assert.equal(classifyFeqhBookType({ ...base, meta: {}, school: "حنبلي" }), "sharia");
  assert.equal(classifyFeqhBookType({ ...base, meta: {}, school: "hanbali" }), "sharia");
  assert.equal(classifyFeqhBookType({ ...base, meta: {}, school: "فقه مقارن" }), "sharia");
  assert.equal(classifyFeqhBookType({ ...base, meta: {}, school: "قانون جنائي" }), "wadi");
  assert.equal(classifyFeqhBookType({ ...base, meta: { book_kind: "مقارن" }, school: "حنبلي" }), "comparative");
  assert.equal(classifyFeqhBookType({ ...base, meta: { type: "wadi" }, school: "حنبلي" }), "wadi");
  assert.equal(classifyFeqhBookType({ ...base, meta: { type: "كتاب قانوني" }, school: "" }), "wadi");
  // The old guess is kept for everything nothing above decides.
  assert.equal(classifyFeqhBookType({ ...base, meta: {}, school: "unknown" }), "wadi");
  assert.equal(classifyFeqhBookType({ ...base, title: "فقه المعاملات", meta: {}, school: "unknown" }), "sharia");
});
