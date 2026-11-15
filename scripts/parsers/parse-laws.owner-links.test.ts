// 20261118_10: the owner's own links (superseded_by, repealed_by, supersedes,
// repeals, affected_laws, related_laws) reach the parsed law and the laws row
// (owner_links jsonb); a file path resolves to the target law's final slug.
//
// Run: node --import tsx --test scripts/parsers/parse-laws.owner-links.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseLaws } from "./parse-laws.ts";
import { seedLaws } from "../seed-library.ts";
import { tallyOwnerLinks } from "./lib/owner-links-tally.ts";

type Row = Record<string, unknown>;

function library(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-owner-links-"));
  const dir = path.join(root, "أنظمة ولوائح", "00 - القسم الإجرائي والقضائي");
  fs.mkdirSync(dir, { recursive: true });
  const body = `<!-- ARTICLE_START {"number":"1","number_text":"المادة الأولى"} -->\nمتن.\n<!-- ARTICLE_END -->\n`;
  fs.writeFileSync(
    path.join(dir, "old.md"),
    `---\nid: TEST-OWNER-OLD\nslug: test-old-notary\ntitle: لائحة كتاب العدل الاختبارية\ntype: لائحة\nstatus: repealed\nsection_code: "00"\n` +
      `repealed_by: نظام التوثيق الاختباري الصادر بالمرسوم الملكي رقم (م/164)\n` +
      `related_laws:\n  - نظام غير موجود في المكتبة\n` +
      `editorial_notes: ملاحظة لا تُقرأ\n---\n${body}`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "new.md"),
    `---\nid: TEST-OWNER-NEW\nslug: test-notary\ntitle: نظام التوثيق الاختباري\ntype: نظام\nstatus: active\nsection_code: "00"\n` +
      `supersedes: لائحة كتاب العدل (القديمة) — أنظمة ولوائح/00 - القسم الإجرائي والقضائي/old.md\n` +
      `affected_laws:\n  - name: لائحة كتاب العدل الاختبارية\n    affected_articles: ["1"]\n---\n${body}`,
    "utf8",
  );
  return path.join(root, "أنظمة ولوائح");
}

test("owner links are read after the drops, a path resolves to the final slug, and the row carries them", async () => {
  const parsed = parseLaws(library());
  const bySlug = new Map(parsed.laws.map((l) => [l.slug, l]));
  assert.deepEqual(bySlug.get("test-old-notary")?.owner_links, [
    { kind: "repealed_by", name: "نظام التوثيق الاختباري الصادر بالمرسوم الملكي رقم (م/164)" },
    { kind: "related", name: "نظام غير موجود في المكتبة" },
  ]);
  assert.deepEqual(bySlug.get("test-notary")?.owner_links, [
    { kind: "supersedes", slug: "test-old-notary", id: "TEST-OWNER-OLD", name: "لائحة كتاب العدل" },
    { kind: "affects", name: "لائحة كتاب العدل الاختبارية", articles: ["1"] },
  ]);

  // The owner's own run tells him which links name no single law.
  const tally = tallyOwnerLinks(parsed.laws);
  assert.equal(tally.links, 4);
  assert.equal(tally.resolved, 3);
  assert.deepEqual(tally.unresolved, ["test-old-notary · related · نظام غير موجود في المكتبة — not found"]);

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
  const row = rows.find((r) => r.slug === "test-notary");
  assert.deepEqual(row?.owner_links, bySlug.get("test-notary")?.owner_links);
  assert.equal(JSON.stringify(rows).includes("ملاحظة لا تُقرأ"), false);
});
