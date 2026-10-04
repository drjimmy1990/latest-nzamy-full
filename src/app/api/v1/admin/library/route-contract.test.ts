import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Source-contract checks for the admin library GET. The BEHAVIOUR of the
// paging plan (which tables are read, with which range, for the measured
// counts) is tested in ./query-params.test.ts against planLibraryWindows; the
// checks here only pin that route.ts actually wires that plan in, and that the
// round-1 shortcuts (fts on principles, one offset for every table) are gone.
const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
// Strip full-line comments so a mention in a doc comment cannot masquerade as
// a real call site.
const routeCode = routeSource
  .split("\n")
  .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
  .join("\n");

test("every table has a unique-key order column and a search column in one TABLES spec", () => {
  assert.match(routeCode, /laws: \{\s*from: "laws",\s*key: "slug",/);
  assert.match(routeCode, /decrees: \{ from: "decrees_circulars", key: "id",[^}]*searchColumn: "title" \}/);
  assert.match(routeCode, /principles: \{ from: "principles", key: "id",[^}]*searchColumn: "text" \}/);
  assert.match(routeCode, /feqh: \{ from: "feqh_books", key: "id",[^}]*searchColumn: "title" \}/);
});

test("head counts come first, with the same filtered builder as the read", () => {
  assert.match(routeCode, /buildQuery\(table, TABLES\[table\]\.key, \{ count: "exact", head: true \}\)/);
  assert.match(routeCode, /buildQuery\(w\.table, TABLES\[w\.table\]\.columns\)\s*\.order\(TABLES\[w\.table\]\.key\)\s*\.range\(w\.from, w\.to\)/);
});

test("ranged reads follow planLibraryWindows — never one shared offset for every table", () => {
  assert.match(routeCode, /const windows = planLibraryWindows\(activeCounts, offset, limit\);/);
  assert.doesNotMatch(routeCode, /\.range\(offset, rangeTo\)/);
});

test("search is one substring rule for every table; no fts on principles", () => {
  assert.match(routeCode, /const pattern = search \? toIlikeSubstring\(search\) : null;/);
  assert.match(routeCode, /if \(pattern\) q = q\.ilike\(spec\.searchColumn, pattern\);/);
  assert.doesNotMatch(routeCode, /textSearch\(/);
  assert.doesNotMatch(routeCode, /LIBRARY_FTS_CONFIG/);
});

test("PGRST103 is an empty window; every other error is a 500 with an Arabic message", () => {
  assert.match(routeCode, /if \(res\.error && !isRangeNotSatisfiable\(res\.error\)\)/);
  assert.match(routeCode, /if \(res\.error \|\| typeof res\.count !== "number"\)/);
  assert.match(routeCode, /status: 500/);
  assert.match(routeCode, /حدث خطأ أثناء جلب سجلات المكتبة/);
});

test("the response uses the {data,total} list envelope, not entries.length", () => {
  assert.match(routeCode, /data: entries,\s*\n\s*total,/);
  assert.doesNotMatch(routeCode, /total: entries\.length/);
});

test("page count comes from computeTotalPages(counts), never from ceil(total/limit)", () => {
  assert.match(routeCode, /computeTotalPages\(Object\.values\(counts\), limit\)/);
  assert.doesNotMatch(routeCode, /Math\.ceil\(total\s*\/\s*limit\)/);
  assert.match(routeCode, /pages,\s*\n\s*counts,/);
});
