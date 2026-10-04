import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseLaws } from "./parse-laws.ts";
import { seedLaws } from "../seed-library.ts";

function fixture(dateFields: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-issue-date-alias-"));
  const file = path.join(dir, "law.md");
  fs.writeFileSync(file, `---
id: TEST-ISSUE-DATE-ALIAS
title: اختبار اسم تاريخ الإصدار
type: مرسوم ملكي
status: active
section_code: "00"
${dateFields}---
<!-- ARTICLE_START {"number":"1","number_text":"البند أولاً"} -->
نص اختبار اصطناعي.
<!-- ARTICLE_END -->
`, "utf8");
  return file;
}

test("legacy date_issued keys reach parser and dry-seed law row without a fabricated date", async () => {
  const parsed = parseLaws(fixture("date_issued_hijri: '1445-09-22'\ndate_issued_gregorian: '2024-04-01'\n"));
  assert.equal(parsed.laws[0].issue_date_hijri, "1445-09-22");
  assert.equal(parsed.laws[0].issue_date_gregorian, "2024-04-01");
  const rows: Array<Record<string, unknown>> = [];
  const client = {
    async upsert(table: string, batch: Array<Record<string, unknown>>) {
      if (table === "laws") rows.push(...batch);
      return { data: batch, error: null };
    },
    async delete() { return { error: null }; },
  };
  const errors: string[] = [];
  await seedLaws(client as never, parsed as unknown as Record<string, unknown>, false, errors, false);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].issue_date_hijri, "1445-09-22");
  assert.equal(rows[0].issue_date_gregorian, "2024-04-01");
});

test("populated canonical issue dates take precedence over legacy aliases", () => {
  const parsed = parseLaws(fixture("issue_date_hijri: '1446-01-01'\ndate_issued_hijri: '1445-09-22'\nissue_date_gregorian: '2024-07-07'\ndate_issued_gregorian: '2024-04-01'\n"));
  assert.equal(parsed.laws[0].issue_date_hijri, "1446-01-01");
  assert.equal(parsed.laws[0].issue_date_gregorian, "2024-07-07");
});

test("undeclared issue dates remain empty in the parser", () => {
  const parsed = parseLaws(fixture(""));
  assert.equal(parsed.laws[0].issue_date_hijri, "");
  assert.equal(parsed.laws[0].issue_date_gregorian, "");
});
