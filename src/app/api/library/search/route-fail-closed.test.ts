import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { combineSearchOutcomes, type SearchResultItem, type SectionOutcome } from "./searchPlan.ts";

const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

const hit = (section: SearchResultItem["section"], id: string): SearchResultItem => ({
  id, section, title: `t-${id}`, snippet: `s-${id}`, locked: false, meta: {},
});
const ok = (section: SearchResultItem["section"], count: number, exact = count <= 1000): SectionOutcome => ({
  ok: true, results: [hit(section, `${section}-1`)], count, exact,
});
const failed: SectionOutcome = { ok: false };

test("a single-section request whose section failed returns 503 with no partial data", () => {
  for (const section of ["laws", "precedents", "orders", "feqh"] as const) {
    const res = combineSearchOutcomes(section, { [section]: failed }, { page: 1, query: "العمل" });
    assert.equal(res.status, 503);
    assert.equal(res.body.code, "search_unavailable");
    assert.match(String(res.body.error), /[؀-ۿ]/, "the error is Arabic");
    assert.equal("results" in res.body, false);
    assert.equal("counts" in res.body, false);
  }
});

test("LIB-01: section=all degrades one failed section instead of failing the whole search", () => {
  const res = combineSearchOutcomes(
    "all",
    { laws: ok("laws", 10226), precedents: ok("precedents", 3614), orders: ok("orders", 104), feqh: failed },
    { page: 1, query: "العمل" },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.degraded, ["feqh"]);
  // Counts stay numbers (the /laws page sums them); a degraded section is 0.
  assert.deepEqual(res.body.counts, { laws: 10226, precedents: 3614, orders: 104, feqh: 0 });
  assert.equal(res.body.total, 10226 + 3614 + 104);
  const results = res.body.results as SearchResultItem[];
  assert.deepEqual(results.map((r) => r.section), ["laws", "precedents", "orders"]);
  assert.equal(res.body.countsEstimated, true);
  assert.equal(res.body.countsExactUpTo, 1000);
  // SEARCH COUNTS CONTRACT: a degraded section is never exact (its 0 is
  // "unknown"); an estimate above 1000 is not exact either.
  assert.deepEqual(res.body.countsExact, { laws: false, precedents: false, orders: true, feqh: false });
});

test("countsExact: sections the request did not search stay exact, the searched one carries its own flag", () => {
  const exact = combineSearchOutcomes("orders", { orders: ok("orders", 28) }, { page: 1, query: "الحسابات البنكية" });
  assert.deepEqual(exact.body.countsExact, { laws: true, precedents: true, orders: true, feqh: true });
  const floor = combineSearchOutcomes("laws", { laws: ok("laws", 1001) }, { page: 1, query: "التحكيم" });
  assert.deepEqual(floor.body.countsExact, { laws: false, precedents: true, orders: true, feqh: true });
  // A short last page proves an exact count even above 1000.
  const proven = combineSearchOutcomes("laws", { laws: ok("laws", 1407, true) }, { page: 1, query: "العمل" });
  assert.equal((proven.body.countsExact as Record<string, boolean>).laws, true);
});

test("section=all with every section failed is a 503, not an empty 200", () => {
  const res = combineSearchOutcomes(
    "all",
    { laws: failed, precedents: failed, orders: failed, feqh: failed },
    { page: 1, query: "من" },
  );
  assert.equal(res.status, 503);
  const missing = combineSearchOutcomes("all", {}, { page: 1, query: "من" });
  assert.equal(missing.status, 503, "a section that never reported counts as failed");
});

test("a healthy search keeps the response shape the /laws page consumes", () => {
  const res = combineSearchOutcomes("laws", { laws: ok("laws", 5) }, { page: 1, query: "نظام" });
  assert.equal(res.status, 200);
  for (const key of ["results", "counts", "total", "page", "query", "degraded"]) {
    assert.ok(key in res.body, key);
  }
  assert.deepEqual(res.body.degraded, []);
  assert.deepEqual(res.body.counts, { laws: 5, precedents: 0, orders: 0, feqh: 0 });
});

test("every section query error or malformed payload marks that section failed; none turns into an empty success", () => {
  // settlePage (searchPlan.readPage) is the only way a section reads its
  // response: a failure returns null and the runner returns { ok: false }.
  for (const name of ["laws", "precedents", "orders", "feqh"]) {
    assert.match(
      routeSource,
      new RegExp(`const settled = await settlePage\\('${name}',[\\s\\S]{0,200}?\\);\\s*if \\(!settled\\) return \\{ ok: false \\};`),
      name,
    );
  }
  assert.match(routeSource, /if \(read\.kind === 'failed'\) \{[\s\S]{0,160}return null;/);
  // A page past the end with no provable total is a failure too.
  assert.match(routeSource, /if \(total === null\) \{\s*console\.error\([^)]*\);\s*return null;/);
  for (const label of ["Laws", "Precedents", "Orders", "Feqh"]) {
    assert.match(routeSource, new RegExp(`console\\.error\\('\\[Search\\] ${label} error:', e\\);\\s*return \\{ ok: false \\};`));
  }
  assert.doesNotMatch(routeSource, /\|\| 0;/, "no `count || 0` swallowing");
});

test("every section query has a deterministic primary-key order and reports count exactness", () => {
  // articles, principles, decrees_circulars and feqh_blocks all order by `id`
  // (their primary key) before `.range()`, so pages are stable windows.
  assert.equal((routeSource.match(/\.order\('id'\)/g) ?? []).length, 4);
  // Every window asks PostgREST for at least SEARCH_MIN_FETCH rows: a tiny
  // LIMIT with order('id') walks the primary key and timed out on rare terms.
  assert.match(routeSource, /lawQuery\(withHistory\)\.order\('id'\)\.range\(from, from \+ fetchSizeFor\(size\) - 1\)/);
  for (const name of ["precQuery", "orderQuery", "feqhQuery"]) {
    assert.match(routeSource, new RegExp(`await ${name}\\(\\)\\s*\\.order\\('id'\\)\\s*\\.range\\(from, from \\+ fetchSizeFor\\(size\\) - 1\\)`));
  }
  assert.doesNotMatch(routeSource, /\.range\(from, from \+ size - 1\)/);
  assert.equal((routeSource.match(/requested: fetchSizeFor\(size\)/g) ?? []).length, 4);
  assert.equal((routeSource.match(/\.\.\.sectionCount\(\{/g) ?? []).length, 4);
  assert.match(routeSource, /q\.in\('category', categoryStoredSpellings\(filters\.category\)\)/);
});

test("ranking vs paging: section=laws never takes its order from the ranked RPC", () => {
  assert.match(routeSource, /if \(!rankedLawOrderApplies\(section\) \|\| from !== 0/);
  // Every section=laws page places its rows by the same title-hit count.
  assert.match(routeSource, /lawPageArticles\(articleItems, page, limit, titleMax, k\)/);
  assert.match(routeSource, /if \(section === 'laws' && page > 1 && !title\.complete\) \{[\s\S]{0,200}return \{ ok: false \};/);
});

test("sections run in parallel, use estimated counts, and the laws retry skips timeouts and pages past the end", () => {
  assert.match(routeSource, /await Promise\.all\(names\.map\(\(name\) => runners\[name\]\(\)\)\)/);
  assert.doesNotMatch(routeSource, /count: 'exact'/);
  assert.equal((routeSource.match(/count: 'estimated'/g) ?? []).length, 4);
  assert.match(routeSource, /if \(shouldRetryLawsWithoutHistory\(res\.error\)\)/);
  assert.match(routeSource, /combineSearchOutcomes\(section, outcomes/);
  assert.match(routeSource, /return searchUnavailableResponse\(500\);/);
});
