import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseLaws } from "./parse-laws.ts";
import { seedLaws } from "../seed-library.ts";

function fixture(extra: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-law-identity-"));
  const source = `---
title: وثيقة اختبار هوية
slug: synthetic-law-identity
type: نظام
status: active
section_code: "00"
schema_version: "4.0"
${extra}---
<!-- CHAPTER_START {"number": 1, "title": "باب اختبار"} -->
<!-- ARTICLE_START {"number": "1", "number_text": "المادة الأولى"} -->
متن اختباري لا يمثل حكماً قانونياً.
<!-- ARTICLE_END -->
<!-- CHAPTER_END -->
`;
  const file = path.join(dir, "identity-fixture.md");
  fs.writeFileSync(file, source, "utf8");
  return file;
}

test("empty official law_guid retains the source document id without fabricating a GUID", async () => {
  const parsed = parseLaws(fixture("id: LAW-TEST-001\nlaw_guid: ''\n"));
  assert.equal(parsed.laws.length, 1);
  assert.equal(parsed.laws[0].id, "LAW-TEST-001");
  assert.equal(parsed.laws[0].law_guid, "");

  const inserted = new Map<string, Record<string, unknown>[]>();
  const fakeClient = {
    async upsert(table: string, rows: Record<string, unknown>[]) {
      inserted.set(table, [...(inserted.get(table) || []), ...rows]);
      return { data: rows, error: null };
    },
    async delete() { return { error: null }; },
  };
  const errors: string[] = [];
  await seedLaws(fakeClient as never, parsed as unknown as Record<string, unknown>, false, errors, false);
  assert.deepEqual(errors, []);
  assert.equal(inserted.get("laws")?.[0]?.slug, "synthetic-law-identity");
  assert.equal(inserted.get("laws")?.[0]?.law_guid, "");
});

test("keeps BOE law_guid separate from registry id when the field is absent", () => {
  const known = parseLaws(fixture("id: LAW-TEST-002\nlaw_guid: BOE-123\n")).laws[0];
  assert.equal(known.id, "BOE-123");
  assert.equal(known.law_guid, "BOE-123");

  const legacy = parseLaws(fixture("id: LAW-TEST-003\n")).laws[0];
  assert.equal(legacy.id, "LAW-TEST-003");
  assert.equal(legacy.instrument_id, "LAW-TEST-003");
  assert.equal(legacy.law_guid, "");

  const unknown = parseLaws(fixture("")).laws[0];
  assert.equal(unknown.id, "synthetic-law-identity");
  assert.equal(unknown.law_guid, "");
});
