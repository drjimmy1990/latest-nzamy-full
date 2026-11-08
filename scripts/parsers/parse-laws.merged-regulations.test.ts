// Owner package 2026-11-06 item 4: frontmatter merged_regulation_details
// reaches the parsed law and the laws row (merged_regulations jsonb) with the
// card fields only — never the editorial status_note / note.
//
// Run: node --import tsx --test scripts/parsers/parse-laws.merged-regulations.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mergedRegulationDetailsOf, parseLaws } from "./parse-laws.ts";
import { seedLaws } from "../seed-library.ts";

type Row = Record<string, unknown>;

function lawFile(frontmatterExtra: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-merged-reg-"));
  const file = path.join(dir, "synthetic.md");
  fs.writeFileSync(
    file,
    `---\nid: TEST-MERGED-REG\ntitle: نظام العمل التطوعي الاختباري\ntype: نظام\nstatus: active\nsection_code: "00"\nhas_merged_regulation: true\n${frontmatterExtra}---\n` +
      `<!-- ARTICLE_START {"number":"1","number_text":"المادة الأولى"} -->\nمتن.\n<!-- ARTICLE_END -->\n`,
    "utf8",
  );
  return file;
}

async function lawRow(file: string): Promise<Row> {
  const parsed = parseLaws(file);
  const rows: Row[] = [];
  const client = {
    async upsert(table: string, batch: Row[]) {
      if (table === "laws") rows.push(...batch);
      return { data: batch, error: null };
    },
    async delete() { return { error: null }; },
  };
  const errors: string[] = [];
  await seedLaws(client as never, JSON.parse(JSON.stringify(parsed)) as Row, false, errors, false);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  return rows[0];
}

const DETAILS = `merged_regulation_details:
  - name: اللائحة التنفيذية للعمل التطوعي
    issuing_instrument: وزارة الموارد البشرية — 1444/03/21هـ
    status_note: ملاحظة تحريرية طويلة لا تُنشر
    status: active
    total_articles: 18
  - title: جدول المخالفات
    type: جداول
    note: ملاحظة
  - name: غير محدد
  - issuing_instrument: بلا اسم
`;

test("the card fields of each named entry reach the laws row; editorial keys never do", async () => {
  const row = await lawRow(lawFile(DETAILS));
  assert.deepEqual(row.merged_regulations, [
    { name: "اللائحة التنفيذية للعمل التطوعي", status: "active", total_articles: 18, issuing_instrument: "وزارة الموارد البشرية — 1444/03/21هـ" },
    { name: "جدول المخالفات", type: "جداول" },
  ]);
  assert.doesNotMatch(JSON.stringify(row.merged_regulations), /status_note|note|تحريرية/);
});

test("a law whose file lists no merged regulation gets NULL (the ref-name fallback applies)", async () => {
  assert.equal((await lawRow(lawFile(""))).merged_regulations, null);
  assert.equal((await lawRow(lawFile("merged_regulation_details: null\n"))).merged_regulations, null);
  assert.equal((await lawRow(lawFile("merged_regulation_details: []\n"))).merged_regulations, null);
});

test("mergedRegulationDetailsOf: names required, duplicates once, total_articles only as a non-negative integer", () => {
  assert.equal(mergedRegulationDetailsOf("x"), null);
  assert.deepEqual(mergedRegulationDetailsOf([
    { name: "أ", total_articles: "7" },
    { name: " أ ", total_articles: 9 },
    { name: "ب", total_articles: -1 },
    { name: "ج", total_articles: 2.5 },
    ["not", "an", "object"],
  ]), [{ name: "أ", total_articles: 7 }, { name: "ب" }, { name: "ج" }]);
});
