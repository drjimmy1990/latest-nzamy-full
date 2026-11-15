// 20261118_10: a decree's own links (mostly affected_laws: the laws and
// articles it amends) reach the parsed decree and the decrees_circulars row
// (owner_links jsonb); a law named by its file path resolves to that law's
// slug and registry id, read from the law file's own frontmatter.
//
// Run: node --import tsx --test scripts/parsers/parse-decrees.owner-links.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseDecrees } from "./parse-decrees.ts";
import { seedDecrees } from "../seed-library.ts";
import { parseLaws } from "./parse-laws.ts";

type Row = Record<string, unknown>;

const LAWS = "أنظمة ولوائح";
const DECREES = "أوامر وتعاميم";
const BODY = `<!-- ARTICLE_START {"number":"1","status":"active"} -->\nمتن اختباري لا يمثل حكماً قانونياً.\n<!-- ARTICLE_END -->\n`;

function library(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-owner-links-dec-"));
  fs.mkdirSync(path.join(root, LAWS), { recursive: true });
  fs.mkdirSync(path.join(root, DECREES), { recursive: true });
  fs.writeFileSync(
    path.join(root, LAWS, "law.md"),
    `---\nid: TEST-DEC-LAW\nslug: test-dec-law\ntitle: نظام اختباري\ntype: نظام\nstatus: active\nsection_code: "00"\n---\n${BODY}`,
    "utf8",
  );
  // No slug line, an Arabic file name: the laws parser derives the slug.
  fs.writeFileSync(
    path.join(root, LAWS, "نظام المرافعات الاختباري.md"),
    `---\nid: TEST-DEC-LAW2\ntitle: نظام المرافعات الاختباري\ntype: نظام\nstatus: active\nsection_code: "00"\n---\n${BODY}`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(root, DECREES, "dec.md"),
    `---\nid: TEST-DEC-1\ntitle: مرسوم اختباري\ntype: مرسوم ملكي\nstatus: active\nsection_code: "00"\n` +
      `affected_laws:\n` +
      `  - name: نظام اختباري\n    affected_articles: ["3", "المادة الخامسة"]\n    law_file: ${LAWS}/law.md\n` +
      `  - name: نظام آخر لا ملف له\n` +
      `  - law_file: ${LAWS}/نظام المرافعات الاختباري.md\n    affected_articles: [1]\n` +
      `related_laws: نظام ذو صلة\n` +
      `editorial_notes: ملاحظة لا تُقرأ\n---\n${BODY}`,
    "utf8",
  );
  return root;
}

test("a decree's affected_laws reach the parsed decree (a law_file resolves to slug + id) and its row", async () => {
  const root = library();
  let parsed;
  try {
    parsed = parseDecrees(path.join(root, DECREES), root);
  } finally {
    process.exitCode = 0;
  }
  // The slug the laws parser itself stores for the file without a slug line.
  let derivedSlug: string | undefined;
  try {
    derivedSlug = parseLaws(path.join(root, LAWS)).laws.find((l) => l.id === "TEST-DEC-LAW2")?.slug;
  } finally {
    process.exitCode = 0;
  }
  assert.ok(derivedSlug && !/[\u0600-\u06FF\s]/.test(derivedSlug), `a URL-safe derived slug: ${derivedSlug}`);
  const dec = parsed.decrees[0];
  assert.equal(parsed.decrees.length, 1);
  assert.ok(dec, "the decree is parsed");
  assert.deepEqual(dec.owner_links, [
    { kind: "affects", name: "نظام اختباري", slug: "test-dec-law", id: "TEST-DEC-LAW", articles: ["3", "المادة الخامسة"] },
    { kind: "affects", name: "نظام آخر لا ملف له" },
    { kind: "affects", slug: derivedSlug, id: "TEST-DEC-LAW2", articles: ["1"] },
    { kind: "related", name: "نظام ذو صلة" },
  ]);

  const rows: Row[] = [];
  const client = {
    async upsert(table: string, batch: Row[]) {
      if (table === "decrees_circulars") rows.push(...batch);
      return { data: batch, error: null };
    },
    async delete() { return { error: null }; },
  };
  const errors: string[] = [];
  await seedDecrees(client as never, JSON.parse(JSON.stringify(parsed)) as Row, false, errors, false);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.ok(row, "the decree row is written");
  assert.deepEqual(row.owner_links, dec.owner_links);
  assert.equal(JSON.stringify(rows).includes("ملاحظة لا تُقرأ"), false);
});
