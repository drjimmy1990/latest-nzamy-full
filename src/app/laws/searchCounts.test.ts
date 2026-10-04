import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SEARCH_MAX_DEPTH,
  appendSearchRows,
  searchPagingState,
  viewAllLabel,
  EMPTY_SEARCH_COUNTS,
  formatCountAr,
  readSearchCounts,
  sectionCountDisplay,
  totalCountDisplay,
} from "./searchCounts.ts";

test("missing countsExact (older API) is treated as exact", () => {
  const info = readSearchCounts({ counts: { laws: 1407, precedents: 3, orders: 0, feqh: 12 } });
  assert.deepEqual(sectionCountDisplay(info, "laws"), { kind: "exact", value: 1407 });
  assert.equal(formatCountAr(totalCountDisplay(info)), "١٬٤٢٢");
});

test("countsExact false shows «أكثر من ١٬٠٠٠», never the planner estimate", () => {
  const info = readSearchCounts({
    counts: { laws: 1109, precedents: 40, orders: 2, feqh: 1001 },
    countsExact: { laws: false, precedents: true, orders: true, feqh: false },
    degraded: [],
  });
  assert.equal(formatCountAr(sectionCountDisplay(info, "laws")), "أكثر من ١٬٠٠٠");
  assert.equal(formatCountAr(sectionCountDisplay(info, "feqh")), "أكثر من ١٬٠٠٠");
  assert.equal(formatCountAr(sectionCountDisplay(info, "precedents")), "٤٠");
  // 1000 + 40 + 2 + 1000 as a floor, not 1109 + 1001 + …
  assert.deepEqual(totalCountDisplay(info), { value: 2042, atLeast: true });
  assert.equal(formatCountAr(totalCountDisplay(info)), "أكثر من ٢٬٠٤٢");
});

test("a degraded section is never a number and makes the total a floor", () => {
  const info = readSearchCounts({
    counts: { laws: 0, precedents: 7, orders: 0, feqh: 0 },
    countsExact: { laws: true, precedents: true, orders: true, feqh: true },
    degraded: ["laws"],
  });
  assert.deepEqual(sectionCountDisplay(info, "laws"), { kind: "degraded" });
  assert.equal(formatCountAr(sectionCountDisplay(info, "laws")), null);
  assert.equal(info.exact.laws, false);
  assert.deepEqual(info.degraded, ["laws"]);
  assert.deepEqual(totalCountDisplay(info), { value: 7, atLeast: true });
});

test("autocomplete null count is its failure signal and reads as degraded", () => {
  const info = readSearchCounts({ counts: { laws: null, precedents: 5, orders: 0, feqh: 0 } });
  assert.deepEqual(info.degraded, ["laws"]);
  assert.deepEqual(sectionCountDisplay(info, "laws"), { kind: "degraded" });
});

test("degraded is limited to the requested sections", () => {
  const info = readSearchCounts({ counts: { laws: 10, feqh: 1001 }, countsExact: { laws: true, feqh: false }, degraded: ["feqh", "bogus"] }, ["laws"]);
  assert.deepEqual(info.degraded, []);
  assert.equal(info.exact.feqh, true);
  assert.deepEqual(totalCountDisplay(info, ["laws"]), { value: 10, atLeast: false });
});

test("round-1 API shape (countsEstimated + countsExactUpTo, no countsExact) proves nothing above the ceiling", () => {
  const info = readSearchCounts({ counts: { laws: 1001, precedents: 1000, orders: 3, feqh: 0 }, countsEstimated: true, countsExactUpTo: 1000 });
  assert.equal(info.exact.laws, false);
  assert.equal(info.exact.precedents, true);
  assert.equal(formatCountAr(sectionCountDisplay(info, "laws")), "أكثر من ١٬٠٠٠");
});

test("empty state is exact zeros", () => {
  assert.deepEqual(totalCountDisplay(EMPTY_SEARCH_COUNTS), { value: 0, atLeast: false });
  assert.deepEqual(readSearchCounts(null).degraded, []);
});

// ─── Search paging (single-section load-more) ────────────────────────────────

const exactInfo = (section: "laws" | "precedents" | "orders" | "feqh", n: number) =>
  readSearchCounts({ counts: { [section]: n }, countsExact: { [section]: true } }, [section]);
const floorInfo = (section: "laws" | "precedents" | "orders" | "feqh") =>
  readSearchCounts({ counts: { [section]: 1001 }, countsExact: { [section]: false } }, [section]);
const rows = (n: number, prefix = "a") => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, meta: { kind: "article" } }));

test("SEARCH_MAX_DEPTH mirrors the API's cap in filters.ts", () => {
  const filters = readFileSync(new URL("../api/library/search/filters.ts", import.meta.url), "utf8");
  const m = filters.match(/export const SEARCH_MAX_DEPTH = (\d+);/);
  assert.ok(m, "filters.ts exports SEARCH_MAX_DEPTH");
  assert.equal(Number(m[1]), SEARCH_MAX_DEPTH);
});

test("orders: 28 counted, 27 rows after dedupe → no page 2 (it would be past the end)", () => {
  assert.deepEqual(searchPagingState(exactInfo("orders", 28), "orders", 1, rows(27)), { hasMore: false, depthCapped: false });
});

test("orders: 104 exact → pages 1 and 2 load more, page 3 is the end", () => {
  assert.equal(searchPagingState(exactInfo("orders", 104), "orders", 1, rows(50)).hasMore, true);
  assert.equal(searchPagingState(exactInfo("orders", 104), "orders", 2, rows(99)).hasMore, true);
  assert.equal(searchPagingState(exactInfo("orders", 104), "orders", 3, rows(104)).hasMore, false);
});

test("laws: 55 articles, page 1 holds 47 (3 slots reserved) → a short page is not the end", () => {
  assert.equal(searchPagingState(exactInfo("laws", 55), "laws", 1, rows(47)).hasMore, true);
  // with 3 title hits beside them: the hits do not count against the 55
  const withHits = [...rows(3, "law:x").map(r => ({ ...r, meta: { kind: "law" } })), ...rows(47)];
  assert.equal(searchPagingState(exactInfo("laws", 55), "laws", 1, withHits).hasMore, true);
  assert.equal(searchPagingState(exactInfo("laws", 55), "laws", 2, [...withHits, ...rows(8, "b")]).hasMore, false);
});

test("laws, current API (lawTitleHits present): counts.laws includes the hits, so every row counts", () => {
  const hits = rows(3, "law:x").map(r => ({ ...r, meta: { kind: "law" } }));
  const opts = { lawCountIncludesTitleHits: true };
  // 58 listed = 3 hits + 55 articles; page 1 shows 50 of them
  assert.equal(searchPagingState(exactInfo("laws", 58), "laws", 1, [...hits, ...rows(47)], opts).hasMore, true);
  assert.equal(searchPagingState(exactInfo("laws", 58), "laws", 2, [...hits, ...rows(55)], opts).hasMore, false);
  // the old article-only rule would have asked for a page 3 here
  assert.equal(searchPagingState(exactInfo("laws", 58), "laws", 2, [...hits, ...rows(55)]).hasMore, true);
});

test("laws: 50 exact, 50 articles on page 1 (no slots) → end", () => {
  assert.equal(searchPagingState(exactInfo("laws", 50), "laws", 1, rows(50)).hasMore, false);
});

test("inexact count: more until page 20, then the depth cap", () => {
  assert.deepEqual(searchPagingState(floorInfo("precedents"), "precedents", 5, rows(250)), { hasMore: true, depthCapped: false });
  assert.deepEqual(searchPagingState(floorInfo("precedents"), "precedents", 20, rows(1000)), { hasMore: false, depthCapped: true });
});

test("a degraded section never pages", () => {
  const info = readSearchCounts({ counts: { feqh: 0 }, degraded: ["feqh"] }, ["feqh"]);
  assert.deepEqual(searchPagingState(info, "feqh", 1, []), { hasMore: false, depthCapped: false });
});

test("appendSearchRows drops ids already shown", () => {
  const out = appendSearchRows([{ id: 1 }, { id: 2 }], [{ id: "2" }, { id: 3 }]);
  assert.deepEqual(out.map(r => String(r.id)), ["1", "2", "3"]);
});

test("view-all says «كل» only for an exact, reachable count", () => {
  assert.equal(viewAllLabel(exactInfo("orders", 104), "orders"), "عرض كل النتائج (١٠٤)");
  assert.equal(viewAllLabel(floorInfo("precedents"), "precedents"), "تصفّح حتى ١٬٠٠٠ نتيجة (الإجمالي أكثر من ١٬٠٠٠)");
  const degraded = readSearchCounts({ counts: { feqh: null } }, ["feqh"]);
  assert.equal(viewAllLabel(degraded, "feqh"), null);
});
