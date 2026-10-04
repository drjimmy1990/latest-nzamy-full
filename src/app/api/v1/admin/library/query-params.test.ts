import assert from "node:assert/strict";
import test from "node:test";

import {
  parseLibraryListParams,
  computeTotalPages,
  planLibraryWindows,
  isRangeNotSatisfiable,
  toIlikeSubstring,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "./query-params.ts";

test("defaults to page 1, limit 50 when nothing is passed", () => {
  const { page, limit, offset, rangeTo } = parseLibraryListParams(null, null);
  assert.equal(page, 1);
  assert.equal(limit, DEFAULT_PAGE_SIZE);
  assert.equal(offset, 0);
  assert.equal(rangeTo, DEFAULT_PAGE_SIZE - 1);
});

test("computes the .range() window for a later page (LIB-15: laws has 5,901 rows)", () => {
  const { offset, rangeTo } = parseLibraryListParams("3", "50");
  assert.equal(offset, 100);
  assert.equal(rangeTo, 149);
});

test("clamps a non-positive or non-numeric page to 1", () => {
  assert.equal(parseLibraryListParams("0", null).page, 1);
  assert.equal(parseLibraryListParams("-5", null).page, 1);
  assert.equal(parseLibraryListParams("abc", null).page, 1);
  assert.equal(parseLibraryListParams("", null).page, 1);
});

test("clamps limit into [1, MAX_PAGE_SIZE] — never unbounded (the LIB-15 bug)", () => {
  assert.equal(parseLibraryListParams(null, "0").limit, 1);
  assert.equal(parseLibraryListParams(null, "-10").limit, 1);
  assert.equal(parseLibraryListParams(null, "100000").limit, MAX_PAGE_SIZE);
  assert.equal(parseLibraryListParams(null, "abc").limit, DEFAULT_PAGE_SIZE);
  assert.equal(parseLibraryListParams(null, "75").limit, 75);
});

test("rangeTo is always offset + limit - 1, so consecutive pages tile with no gap or overlap", () => {
  const page1 = parseLibraryListParams("1", "50");
  const page2 = parseLibraryListParams("2", "50");
  assert.equal(page1.rangeTo + 1, page2.offset);
});

// LIB-15 follow-up (advisor-caught bug): page count in "الكل" mode must be
// bounded by the LARGEST table being fetched, not by ceil(SUM / limit) — the
// four tables are windowed independently by the same page, so once the
// biggest one runs out, so does the combined view, even though the sum of
// all four counts is still much larger.
test("computeTotalPages bounds pages by the largest count, not the sum (the real self-hosted shape)", () => {
  // laws 5,901 · decrees 3,318 · principles 18,983 · feqh_books 185 — the
  // "الكل" (no category filter) case: all four counts are real.
  const pages = computeTotalPages([5901, 3318, 18983, 185], 50);
  assert.equal(pages, Math.ceil(18983 / 50)); // 380, not ceil(28387/50)=568
  assert.notEqual(pages, Math.ceil((5901 + 3318 + 18983 + 185) / 50));
});

test("computeTotalPages: a single-category filter (only one active count) matches ceil(count/limit)", () => {
  // Category filters zero out the other three tables' fetch, and their
  // count is always 0 by construction (never queried) — so passing all
  // four still gives the right answer for the one active table.
  assert.equal(computeTotalPages([0, 0, 18983, 0], 50), Math.ceil(18983 / 50));
  assert.equal(computeTotalPages([185, 0, 0, 0], 200), Math.ceil(185 / 200));
});

test("computeTotalPages never returns fewer than 1 page, even with zero rows", () => {
  assert.equal(computeTotalPages([0, 0, 0, 0], 50), 1);
});

test("computeTotalPages tolerates a zero/negative limit without dividing by zero or Infinity", () => {
  // limit <= 0 is clamped to 1 rather than dividing by zero — every row
  // becomes its own page instead of NaN/Infinity reaching the client.
  assert.equal(computeTotalPages([100], 0), 100);
  assert.equal(computeTotalPages([100], -5), 100);
  assert.equal(Number.isFinite(computeTotalPages([100], 0)), true);
});

// ─── planLibraryWindows — the round-2 blocker ───────────────────────────────
// Measured on self-hosted 2026-09-25 (unfiltered «الكل»): laws 5,901,
// decrees_circulars 3,318, principles 18,983, feqh_books 185. PostgREST
// answers 416 PGRST103 when a ranged read starts past a table's row count, and
// the route used to turn that into a 500 for pages 5..380.
const MEASURED = { laws: 5901, decrees: 3318, principles: 18983, feqh: 185 };

/** Every planned window must be satisfiable: inside [0, count - 1]. */
function assertSatisfiable(counts: Record<string, number>, windows: ReturnType<typeof planLibraryWindows>) {
  for (const w of windows) {
    assert.ok(w.from >= 0 && w.from <= w.to, `${w.table}: empty/negative window ${w.from}-${w.to}`);
    assert.ok(w.to < counts[w.table], `${w.table}: window ends at ${w.to}, past row ${counts[w.table] - 1}`);
  }
}

test("page 5 / limit 50 in «الكل»: feqh_books (185 rows) is NOT queried; the other three are", () => {
  const { offset, limit } = parseLibraryListParams("5", "50");
  assert.equal(offset, 200);
  const windows = planLibraryWindows(MEASURED, offset, limit);
  assert.deepEqual(windows, [
    { table: "laws", from: 200, to: 249 },
    { table: "decrees", from: 200, to: 249 },
    { table: "principles", from: 200, to: 249 },
  ]);
  assert.equal(windows.some((w) => w.table === "feqh"), false);
  assertSatisfiable(MEASURED, windows);
});

test("page 4 / limit 50: feqh_books gets a SHORT window ending on its last row (150-184), never 150-199", () => {
  const { offset, limit } = parseLibraryListParams("4", "50");
  const feqh = planLibraryWindows(MEASURED, offset, limit).find((w) => w.table === "feqh");
  assert.deepEqual(feqh, { table: "feqh", from: 150, to: 184 });
});

test("page 380 (the last page computeTotalPages advertises) reads principles only; page 381 reads nothing", () => {
  assert.equal(computeTotalPages(Object.values(MEASURED), 50), 380);
  const last = planLibraryWindows(MEASURED, parseLibraryListParams("380", "50").offset, 50);
  assert.deepEqual(last, [{ table: "principles", from: 18950, to: 18982 }]);
  assert.deepEqual(planLibraryWindows(MEASURED, parseLibraryListParams("381", "50").offset, 50), []);
});

test("every page 1..380 plans only satisfiable windows and at least one table", () => {
  for (let page = 1; page <= 380; page++) {
    const { offset, limit } = parseLibraryListParams(String(page), "50");
    const windows = planLibraryWindows(MEASURED, offset, limit);
    assert.ok(windows.length > 0, `page ${page} planned nothing`);
    assertSatisfiable(MEASURED, windows);
  }
});

test("a search that leaves a table with 0 matches never ranges it (feqh on «عقد», page 2)", () => {
  // «عقد» filtered counts, measured on self-hosted 2026-09-25 (title/text
  // substring): feqh_books has 0 matches, so round 1 drew a 416 from page 2.
  const counts = { laws: 42, decrees: 26, principles: 3535, feqh: 0 };
  // Page 1: laws and decrees get short windows ending on their last match.
  assert.deepEqual(planLibraryWindows(counts, 0, 50), [
    { table: "laws", from: 0, to: 41 },
    { table: "decrees", from: 0, to: 25 },
    { table: "principles", from: 0, to: 49 },
  ]);
  // Page 2 (offset 50): only principles still has rows.
  assert.deepEqual(planLibraryWindows(counts, parseLibraryListParams("2", "50").offset, 50), [
    { table: "principles", from: 50, to: 99 },
  ]);
});

test("a category filter (one table in `counts`) plans only that table", () => {
  assert.deepEqual(planLibraryWindows({ principles: 18983 }, 0, 50), [{ table: "principles", from: 0, to: 49 }]);
  assert.deepEqual(planLibraryWindows({ feqh: 185 }, 200, 50), []);
});

test("isRangeNotSatisfiable recognises only PGRST103", () => {
  assert.equal(isRangeNotSatisfiable({ code: "PGRST103" }), true);
  assert.equal(isRangeNotSatisfiable({ code: "57014" }), false); // statement timeout stays an error
  assert.equal(isRangeNotSatisfiable(null), false);
  assert.equal(isRangeNotSatisfiable(undefined), false);
});

test("toIlikeSubstring wraps in % and makes %, _ and backslash literal", () => {
  assert.equal(toIlikeSubstring("تعويض"), "%تعويض%");
  assert.equal(toIlikeSubstring("50%"), String.raw`%50\%%`);
  assert.equal(toIlikeSubstring("a_b"), String.raw`%a\_b%`);
  assert.equal(toIlikeSubstring(String.raw`a\b`), String.raw`%a\\b%`);
});

// PostgREST's own ilike/like `*` → `%` alias cannot be escaped with a
// backslash (it is applied to the raw filter value, ahead of any SQL LIKE
// escaping), so a literal `*` is stripped instead of passed through. Left
// unstripped, an admin searching "*" would match every row in every table,
// and "نظام*العمل" would act as a real wildcard instead of a literal search.
test("toIlikeSubstring strips literal * (PostgREST's un-escapable ilike wildcard alias)", () => {
  assert.equal(toIlikeSubstring("*"), "%%"); // matches every row on its own — not this route's problem to fix, but no wider than a bare search box normally is
  assert.equal(toIlikeSubstring("نظام*العمل"), "%نظامالعمل%");
  assert.equal(toIlikeSubstring("**"), "%%");
  assert.equal(toIlikeSubstring("a*b_c"), String.raw`%ab\_c%`);
});
