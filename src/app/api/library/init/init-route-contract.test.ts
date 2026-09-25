import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Source contract for GET /api/library/init (LIB-16 / LIB-08 / LIB-03). The
// route needs a live Supabase to run, so these checks read its source: they
// pin the properties a refactor could silently lose.
const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "route.ts"), "utf8");

test("list reads name their card columns instead of select('*')", () => {
  assert.doesNotMatch(source, /fetchSection\(\s*"[a-z_]+",\s*"\*"/);
  assert.doesNotMatch(source, /\.select\(\s*"\*"/);
  // The heavy columns stay out of every list.
  for (const heavy of ["fts", "preamble", "metadata"]) {
    const lists = source.match(/const [A-Z_]+_LIST_COLUMNS =\s*\n?\s*"[^"]+"/g) ?? [];
    assert.ok(lists.length >= 4, "expected the four *_LIST_COLUMNS constants");
    for (const list of lists) {
      assert.doesNotMatch(list, new RegExp(`\\b${heavy}\\b`), `${heavy} leaked into ${list}`);
    }
  }
});

test("every paged section carries a deterministic order", () => {
  const sections = source.match(/\? fetchSection\(/g) ?? [];
  assert.equal(sections.length, 4, "laws, decrees, principles, books are paged");
  for (const table of ["laws", "decrees_circulars", "principles", "feqh_books"]) {
    const m = new RegExp(`fetchSection\\(\\s*"${table}"`).exec(source);
    assert.ok(m, `${table} section not found`);
    // The call's own shape callback, up to the next section's ternary.
    const rest = source.slice(m.index);
    const end = rest.indexOf(": Promise.resolve(emptySection())");
    assert.match(rest.slice(0, end), /\.order\(/, `${table} has no .order()`);
  }
});

test("collections are read whole through selectAllPages, not one 50-row page", () => {
  assert.match(source, /selectAllPages<Record<string, unknown>>\(\s*\(f, t\)\s*=>\s*supabase\s*\.schema\("library"\)\s*\.from\("judicial_collections"\)/);
  assert.match(source, /hasMore: false, page, limit: data\.length/);
});

test("the laws filters reach PostgREST only through .eq (no user input in .or)", () => {
  assert.match(source, /out\.eq\("section_code", lawSectionCode\)/);
  assert.match(source, /out\.eq\("type", lawType\)/);
  // The only .or() is the fixed executive-regulation literal.
  const ors = source.match(/\bout\.or\([^\n]*/g) ?? [];
  assert.equal(ors.length, 1);
  assert.match(ors[0], /EXEC_REGULATION_TYPE/);
  assert.doesNotMatch(ors[0], /lawType/);
});

test("the outer failure answers in Arabic, not with a raw driver message", () => {
  assert.doesNotMatch(source, /error: error\.message/);
});
