/**
 * Owner ٢٦٢ / ٢٦٣ — parse-feqh reads a book's series, volume number and
 * summary from temp fixture files only (no corpus, no database, no env).
 *   node --import tsx --test scripts/parsers/parse-feqh.series-summary.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseFeqh } from "./parse-feqh.ts";

function book(frontmatter: string, body = ""): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-feqh-series-"));
  const file = path.join(dir, "الإنصاف_ج7.md");
  fs.writeFileSync(file, `---
title: الإنصاف في معرفة الراجح من الخلاف — الجزء 7
author: المرداوي
${frontmatter}---
${body}
## باب الصلاة

<!-- PAGE_START {"page": 1, "volume": 7} -->
نص الصفحة الأولى.
<!-- PAGE_END -->
`, "utf8");
  return file;
}

const only = (file: string) => {
  const out = parseFeqh(file);
  assert.equal(out.books.length, 1);
  return out.books[0];
};

test("collection_id + current_volume (today's files) → series_id + volume_number", () => {
  const b = only(book("collection_id: mardawi-insaf\ncurrent_volume: 7\nvolumes_total: 31\n"));
  assert.equal(b.series_id, "mardawi-insaf");
  assert.equal(b.volume_number, 7);
  assert.equal(b.description, "");
});

test("series_id wins over collection_id; volume_number over current_volume; quotes go", () => {
  const b = only(book(`series_id: "insaf"\ncollection_id: mardawi-insaf\nvolume_number: "٧"\ncurrent_volume: 3\n`));
  assert.equal(b.series_id, "insaf");
  assert.equal(b.volume_number, 7);
});

test("no series fields → null, never derived from the title", () => {
  const b = only(book(""));
  assert.equal(b.series_id, null);
  assert.equal(b.volume_number, null);
});

test("an unreadable volume («3-4», a word) is null, not a guess", () => {
  assert.equal(only(book("current_volume: 3-4\n")).volume_number, null);
  assert.equal(only(book("volume_number: السابع\n")).volume_number, null);
});

test("summary: a one-line front-matter value", () => {
  assert.equal(only(book(`summary: "شرح فقهي حنبلي يذكر الخلاف في المذهب."\n`)).description, "شرح فقهي حنبلي يذكر الخلاف في المذهب.");
});

test("summary: a block scalar (`summary: |`) keeps its lines; other keys are not affected", () => {
  const b = only(book("summary: |\n  السطر الأول.\n  السطر الثاني.\ncollection_id: mardawi-insaf\n"));
  assert.equal(b.description, "السطر الأول.\nالسطر الثاني.");
  assert.equal(b.series_id, "mardawi-insaf");
});

test("summary: a folded value (`summary: >`) and a wrapped plain value read as one line", () => {
  assert.equal(only(book("summary: >\n  أول\n  ثانٍ\n")).description, "أول ثانٍ");
  assert.equal(only(book("summary: أول\n  ثانٍ\n")).description, "أول ثانٍ");
});

test("summary: the body's «📝 موجز» block when the front matter has none — and it is not book text", () => {
  const b = only(book("", "<details open>\n<summary>📝 موجز الكتاب</summary>\n\n> كتاب في الخلاف داخل المذهب.\n\n</details>\n"));
  assert.equal(b.description, "كتاب في الخلاف داخل المذهب.");
  const text = JSON.stringify(b.chapters);
  assert.ok(!text.includes("موجز الكتاب"), "the block is not parsed as a chapter / page");
});

test("the loader row carries series_id / volume_number / description (source pin; the loader is never run)", () => {
  const seed = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "seed-library.ts"), "utf8");
  const bookRow = seed.slice(seed.indexOf("bookRows.push({"), seed.indexOf("const chapters = (book.chapters"));
  assert.match(bookRow, /description: book\.description \|\| "",/);
  assert.match(bookRow, /series_id: book\.series_id \? cap\("feqh_books", "series_id", bookId, String\(book\.series_id\), 150\) : null,/);
  assert.match(bookRow, /volume_number: values\.int\("feqh_books", "volume_number", bookId, book\.volume_number, null, null\),/);
});
