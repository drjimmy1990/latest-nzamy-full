/**
 * Regression proof for the status sentinel: absence of source lifecycle
 * evidence must survive parsing and seeding, while an unknown assertion fails
 * closed. The temporary inputs contain only synthetic test prose.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseLaws } from "./parse-laws.ts";
import { resolveArticleIdentityStatus, resolveSeedArticleStatus, seedLaws } from "../seed-library.ts";
import { articleStatusForDetail } from "../../src/app/api/library/laws/[slug]/route.ts";

function fixture(articleStatus: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-status-undeclared-"));
  const statusField = articleStatus === null ? "" : `, \"status\": \"${articleStatus}\"`;
  const source = `---
id: TEST-STATUS-UNDECLARED
title: اختبار حالة المادة
type: نظام
status: active
section_code: \"00\"
schema_version: \"4.0\"
---
<!-- CHAPTER_START {\"number\": 1, \"title\": \"باب الاختبار\"} -->
<!-- ARTICLE_START {\"number\": \"1\", \"number_text\": \"المادة الأولى\"${statusField}} -->
متن اختباري لا يمثل نصاً قانونياً.
<!-- ARTICLE_END -->
<!-- CHAPTER_END -->
`;
  const file = path.join(dir, "status-fixture.md");
  fs.writeFileSync(file, source, "utf8");
  return file;
}

function syntheticFixture(parentStatus: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-synthetic-status-"));
  const source = `---
id: TEST-SYNTHETIC-STATUS
title: اختبار مادة اصطناعية
type: نظام
status: ${parentStatus}
section_code: "00"
schema_version: "4.0"
---
متن اختباري بلا ARTICLE_START ولا يمثل نصاً قانونياً.
`;
  const file = path.join(dir, "synthetic-fixture.md");
  fs.writeFileSync(file, source, "utf8");
  return file;
}

async function seededArticleStatus(inputPath: string): Promise<string> {
  const parsed = parseLaws(inputPath);
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
  return String((inserted.get("articles") || [])[0]?.status);
}

test("keeps an explicit status_undeclared article through parsing, fake seed, and detail API", async () => {
  const result = parseLaws(fixture("status_undeclared"));
  assert.equal(result.laws.length, 1);
  const article = result.laws[0].chapters[0].articles[0];
  assert.equal(article.status, "status_undeclared");
  assert.equal(article.status_provenance, "explicit");
  assert.equal(article.status_legacy_identity, "status_undeclared");
  assert.equal(article.text, "متن اختباري لا يمثل نصاً قانونياً.");
  assert.equal(await seededArticleStatus(fixture("status_undeclared")), "status_undeclared");
  assert.equal(await seededArticleStatus(fixture("active")), "active");
  assert.equal(articleStatusForDetail("status_undeclared"), "status_undeclared");
  assert.equal(articleStatusForDetail("active"), "active");
});

test("maps missing or blank article status to undeclared without borrowing the parent law status", async () => {
  const result = parseLaws(fixture(null));
  assert.equal(result.laws.length, 1);
  assert.equal(result.laws[0].law_status, "active", "parent law status remains untouched");
  assert.equal(result.laws[0].chapters[0].articles[0].status, "status_undeclared");
  assert.equal(result.laws[0].chapters[0].articles[0].status_provenance, "missing");
  assert.equal(result.laws[0].chapters[0].articles[0].status_legacy_identity, "active");
  assert.equal(parseLaws(fixture("")).laws[0].chapters[0].articles[0].status, "status_undeclared");
  assert.equal(await seededArticleStatus(fixture(null)), "status_undeclared");
  assert.equal(articleStatusForDetail(null), "status_undeclared");
  assert.equal(articleStatusForDetail("   "), "status_undeclared");
});

test("preserves historical identity tokens without borrowing parent lifecycle for display", () => {
  assert.equal(resolveArticleIdentityStatus({ status: "status_undeclared", status_provenance: "missing" }), "active");
  assert.equal(resolveArticleIdentityStatus({ status: "status_undeclared", status_provenance: "explicit" }), "status_undeclared");
  assert.equal(resolveArticleIdentityStatus({
    status: "status_undeclared",
    status_provenance: "synthetic_parent_legacy",
    status_legacy_identity: "repealed",
  }), "repealed");

  const synthetic = parseLaws(syntheticFixture("repealed")).laws[0].chapters[0].articles[0];
  assert.equal(synthetic.status, "status_undeclared");
  assert.equal(synthetic.status_provenance, "synthetic_parent_legacy");
  assert.equal(synthetic.status_legacy_identity, "repealed");
});

test("an unknown nonblank article status still fails closed", () => {
  try {
    assert.throws(() => parseLaws(fixture("invented_lifecycle")), /Law parse rejected/);
  } finally {
    // parseLaws correctly records this fatal fixture in process.exitCode. This
    // test intentionally consumes that failure, so it must not fail its test
    // runner after the assertion has proved the closed path.
    process.exitCode = 0;
  }
  assert.throws(() => resolveSeedArticleStatus("invented_lifecycle"), /unknown article status/);
  assert.throws(() => articleStatusForDetail("invented_lifecycle"), /unknown article status/);
});
