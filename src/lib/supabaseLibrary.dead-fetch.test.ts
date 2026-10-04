/**
 * fetchLawBySlug was a dead export whose nested query selected columns that
 * the current `library.article_amendments` contract does not define.  This
 * guard is intentionally static: the module must not be imported merely to
 * demonstrate that an obsolete database request is unreachable.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import test from "node:test";

const librarySource = fs.readFileSync(new URL("./supabaseLibrary.ts", import.meta.url), "utf8");
const schema = fs.readFileSync(
  new URL("../../supabase/migrations/20260626_legal_library_schema.sql", import.meta.url),
  "utf8",
);

test("fetchLawBySlug is not an active export or an active article_amendments query", () => {
  assert.doesNotMatch(librarySource, /\bfetchLawBySlug\b/);
  assert.doesNotMatch(librarySource, /article_amendments\s*\(/);
});

test("the current article_amendments contract proves the retired query was invalid", () => {
  const table = schema.match(/create table if not exists library\.article_amendments\s*\(([\s\S]*?)\n\);/i)?.[1] ?? "";
  assert.ok(table, "article_amendments must be declared in the test schema");

  for (const column of ["id", "article_id", "date", "source", "type", "summary", "full_text"]) {
    assert.match(table, new RegExp(`\\b${column}\\b`), `${column} must remain in the real contract`);
  }
  for (const staleColumn of ["date_hijri", "description", "old_text", "new_text", "decree_number"]) {
    assert.doesNotMatch(table, new RegExp(`\\b${staleColumn}\\b`), `${staleColumn} is not an article_amendments column`);
  }
});
