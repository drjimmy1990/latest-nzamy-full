import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildAutocompleteBody, facetCount, facetCountExact, type TopMatch } from "./facets.ts";

const timeout = { code: "57014", message: "canceling statement due to statement timeout" };
const okCount = (count: number) => ({ count, error: null });

test("LIB-10: a failed facet count is null, never a false 0", () => {
  assert.equal(facetCount({ count: 10226, error: null }), 10226);
  assert.equal(facetCount({ count: null, error: null }), 0, "no error and no rows is a real 0");
  assert.equal(facetCount({ count: null, error: timeout }), null);
  assert.equal(facetCount({ count: 5, error: timeout }), null);
  assert.equal(facetCount(undefined), null);
});

test("LIB-10: one timed-out section keeps the others and reports null for itself", () => {
  const built = buildAutocompleteBody({
    counts: { laws: { count: null, error: timeout }, precedents: okCount(3614), orders: okCount(104), feqh: okCount(3661) },
    matches: [{ result: { error: null }, items: [] }],
  });
  assert.equal(built.status, 200);
  assert.deepEqual(built.body.counts, { laws: null, precedents: 3614, orders: 104, feqh: 3661 });
  // SEARCH COUNTS CONTRACT: the failed section is degraded and not exact;
  // counts above 1000 are estimates, not exact.
  assert.deepEqual(built.body.degraded, ["laws"]);
  assert.deepEqual(built.body.countsExact, { laws: false, precedents: false, orders: true, feqh: false });
});

test("facetCountExact: only a PostgREST-counted total (<= 1000) is exact", () => {
  assert.equal(facetCountExact(0), true);
  assert.equal(facetCountExact(951), true);
  assert.equal(facetCountExact(1000), true);
  assert.equal(facetCountExact(1001), false);
  assert.equal(facetCountExact(10083), false);
  assert.equal(facetCountExact(null), false);
});

test("top matches: max 2 per section, max 6 total, one per section+title", () => {
  const laws: TopMatch[] = [
    { title: "آلية تصنيف الشركات", section: "laws", slug: "a" },
    { title: "آلية تصنيف الشركات", section: "laws", slug: "a-copy" },
    { title: "نظام الشركات", section: "laws", slug: "b" },
    { title: "نظام الشركات المهنية", section: "laws", slug: "c" },
  ];
  const orders: TopMatch[] = [
    { title: "أمر 1", section: "orders", slug: "o1" },
    { title: "أمر 2", section: "orders", slug: "o2" },
    { title: "أمر 3", section: "orders", slug: "o3" },
  ];
  const built = buildAutocompleteBody({
    counts: { laws: okCount(1), precedents: okCount(1), orders: okCount(1), feqh: okCount(1) },
    matches: [{ result: { error: null }, items: laws }, { result: { error: null }, items: orders }],
  });
  const top = built.body.topMatches as TopMatch[];
  assert.deepEqual(top.map((m) => m.slug), ["a", "b", "o1", "o2"]);
});

test("every query failing is a 503 with an Arabic error, not an empty 200", () => {
  const built = buildAutocompleteBody({
    counts: {
      laws: { error: timeout }, precedents: { error: timeout }, orders: { error: timeout }, feqh: { error: timeout },
    },
    matches: [{ result: { error: timeout }, items: [] }, { result: { error: timeout }, items: [] }],
  });
  assert.equal(built.status, 503);
  assert.match(String(built.body.error), /[؀-ۿ]/);
  assert.deepEqual(built.body.countsExact, { laws: false, precedents: false, orders: false, feqh: false });
  assert.deepEqual(built.body.degraded, ["laws", "precedents", "orders", "feqh"]);
});

test("the route reads every count through the facet helper and uses estimated counts", () => {
  const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /\.count \|\| 0/);
  assert.doesNotMatch(route, /count: 'exact'/);
  assert.match(route, /count: 'estimated', head: true/);
  assert.match(route, /buildAutocompleteBody\(/);
  // Every body the route builds by hand carries countsExact too.
  assert.equal((route.match(/countsExact: uniformCountsExact\((true|false)\)/g) ?? []).length, 2);
  // Top matches are stable per query.
  assert.equal((route.match(/\.order\('(id|slug)'\)/g) ?? []).length, 3);
});
