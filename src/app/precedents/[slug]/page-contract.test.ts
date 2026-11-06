/**
 * q390 / BUG-LIB-01 (S1 Task 5): the principles reader reads the database
 * only. Source contract — the reader needs a live library to render.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAGE = readFileSync(new URL("./page.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("no bundled fallback: nothing imported from @/constants/precedents", () => {
  assert.doesNotMatch(PAGE, /@\/constants\/precedents/);
  assert.doesNotMatch(PAGE, /import\(\s*["'][^"']*\.json["']\s*\)/);
});

test("no whole-collection walk: no loadAll, no search window, no paging loop", () => {
  assert.doesNotMatch(PAGE, /loadAll/);
  assert.doesNotMatch(PAGE, /SEARCH_WINDOW_LIMIT/);
  // The jump used to page `for (… i < 100 …) loadMore(…)` until the target was held.
  assert.doesNotMatch(PAGE, /for\s*\([^)]*\)\s*\{?[^}]*loadMore\(/);
  assert.doesNotMatch(PAGE, /i < 100/);
  assert.match(PAGE, /const WINDOW_LIMIT = 50;/);
});

test("no local filter box: in-reader search is the server panel only", () => {
  assert.doesNotMatch(PAGE, /تصفية المبادئ المعروضة/);
  assert.doesNotMatch(PAGE, /searchQuery/);
  assert.doesNotMatch(PAGE, /compileQueryMatcher/);
  assert.match(PAGE, /<ScopedSearchPanel/);
});

test("legacy slugs redirect or show an honest notice", () => {
  assert.match(PAGE, /legacyTarget\("collection", slug\)/);
  assert.match(PAGE, /router\.replace\(`\/precedents\/\$\{apiSlug\(/);
  assert.match(PAGE, /collectionNotice\(/);
  // A notice always carries the way back to the library: never a blank page.
  assert.match(PAGE, /العودة إلى المكتبة القانونية/);
});

test("a target opens its own window in one request (?target=)", () => {
  assert.match(PAGE, /&target=\$\{encodeURIComponent\(/);
  assert.match(PAGE, /pagination\?\.offset/);
  assert.match(PAGE, /targetFound/);
});

test("the run grows both ways: «عرض ما قبل هذا الموضع» prepends the previous window", () => {
  assert.match(PAGE, /runPrevWindow\(/);
  assert.match(PAGE, /prependRun\(/);
  assert.match(PAGE, /appendRun\(/);
  assert.match(PAGE, /عرض ما قبل هذا الموضع/);
  assert.doesNotMatch(PAGE, /nextOffset\(/);
});
