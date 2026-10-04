import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseLaws } from "./parse-laws.ts";
import { seedLaws } from "../seed-library.ts";

function fixture(frontmatter: string, identityLine = "id: LAW-CHILD-001"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-parent-linkage-"));
  const file = path.join(dir, "secondary.md");
  fs.writeFileSync(file, `---
${identityLine}
law_guid: ''
title: لائحة اختبارية
type: لائحة تنفيذية
status: active
section_code: "00"
${frontmatter}---
<!-- ARTICLE_START {"number":"1","number_text":"المادة الأولى"} -->
متن اختباري فقط.
<!-- ARTICLE_END -->
`, "utf8");
  return file;
}

async function seededLaw(frontmatter: string): Promise<{ parsed: any; row: Record<string, unknown> }> {
  const parsed = parseLaws(fixture(frontmatter));
  const rows: Record<string, unknown>[] = [];
  const fakeClient = {
    async upsert(table: string, values: Record<string, unknown>[]) {
      if (table === "laws") rows.push(...values);
      return { data: values, error: null };
    },
    async delete() { return { error: null }; },
  };
  const errors: string[] = [];
  await seedLaws(fakeClient as never, parsed as unknown as Record<string, unknown>, false, errors, false);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  return { parsed: parsed.laws[0], row: rows[0] };
}

test("document_id remains source metadata and never impersonates registry identity", () => {
  const parsed = parseLaws(fixture("", "document_id: NCAR-DOC-00531")).laws[0];
  assert.equal(parsed.instrument_id, "");
  assert.equal(parsed.id, parsed.slug);
  assert.equal(parsed.law_guid, "");
});

test("canonical parent fields survive parser and seeder without corrupting law_guid", async () => {
  const { parsed, row } = await seededLaw(`instrument_id: LAW-CHILD-CANONICAL
parent_law_id: LAW-PARENT-001
parent_law: "نظام الاختبار"
enabling_article: "المادة الثانية من نظام الاختبار"
metadata:
  parent_law: "اسم موروث يجب ألا يتغلب على الجذر"
`);

  assert.equal(parsed.law_guid, "");
  assert.equal(parsed.instrument_id, "LAW-CHILD-CANONICAL");
  assert.equal(parsed.parent_law_id, "LAW-PARENT-001");
  assert.equal(parsed.parent_law, "نظام الاختبار");
  assert.equal(row.law_guid, "");
  assert.equal(row.instrument_id, "LAW-CHILD-CANONICAL");
  assert.equal(row.parent_law_id, "LAW-PARENT-001");
  assert.equal(row.parent_law, "نظام الاختبار");
  assert.equal(row.enabling_article, "المادة الثانية من نظام الاختبار");
});

test("legacy nested parent name remains readable while missing fields seed as NULL", async () => {
  const { parsed, row } = await seededLaw(`metadata:
  parent_law: "نظام موروث"
`);
  assert.equal(parsed.instrument_id, "LAW-CHILD-001");
  assert.equal(parsed.parent_law, "نظام موروث");
  assert.equal(row.instrument_id, "LAW-CHILD-001");
  assert.equal(row.parent_law, "نظام موروث");
  assert.equal(row.parent_law_id, null);
  assert.equal(row.enabling_article, null);
});
