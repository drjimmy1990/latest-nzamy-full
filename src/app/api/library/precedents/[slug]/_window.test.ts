/**
 * LIB-05 regression: the precedents collection API serves principles in
 * windows, so a 2,323-principle collection is reachable past PostgREST's
 * 1000-row cap, and the route never goes back to one unranged select.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isPrincipleLocked, planPrincipleWindow, PRINCIPLES_DEFAULT_LIMIT, PRINCIPLES_MAX_LIMIT } from "./_window.ts";

const q = (s: string) => new URLSearchParams(s);

test("defaults to the first window", () => {
  assert.deepEqual(planPrincipleWindow(q("")), { offset: 0, limit: PRINCIPLES_DEFAULT_LIMIT });
});

test("offset wins over page, and is never negative", () => {
  assert.deepEqual(planPrincipleWindow(q("offset=1000&limit=500&page=9")), { offset: 1000, limit: 500 });
  assert.deepEqual(planPrincipleWindow(q("offset=-5")), { offset: 0, limit: PRINCIPLES_DEFAULT_LIMIT });
});

test("page still works: offset = (page - 1) * limit", () => {
  assert.deepEqual(planPrincipleWindow(q("page=3&limit=100")), { offset: 200, limit: 100 });
});

test("garbage and out-of-range limits are clamped, never NaN", () => {
  assert.deepEqual(planPrincipleWindow(q("limit=abc&page=xyz")), { offset: 0, limit: PRINCIPLES_DEFAULT_LIMIT });
  assert.equal(planPrincipleWindow(q("limit=0")).limit, PRINCIPLES_DEFAULT_LIMIT);
  assert.equal(planPrincipleWindow(q("limit=100000")).limit, PRINCIPLES_MAX_LIMIT);
  assert.ok(PRINCIPLES_MAX_LIMIT <= 1000, "a window must fit under max-rows");
});

test("walking by offset with a changing limit reaches all 2,323 principles exactly once", () => {
  const all = Array.from({ length: 2323 }, (_, i) => `p-${i}`);
  const held: string[] = [];
  const limits = [100, 100, 500, 500, 500, 500, 500];
  for (const l of limits) {
    const { offset, limit } = planPrincipleWindow(q(`offset=${held.length}&limit=${l}`));
    const window = all.slice(offset, offset + Math.min(limit, 1000));
    if (window.length === 0) break;
    held.push(...window);
  }
  assert.equal(held.length, 2323);
  assert.equal(new Set(held).size, 2323);
});

test("route: ranged + counted, errors are 500s, lock uses the global index", () => {
  const src = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(src, /\.range\(offset, offset \+ limit - 1\)/);
  assert.match(src, /count: 'exact'/);
  assert.match(src, /principlesQuery\.error/);
  assert.match(src, /status: 500/);
  assert.match(src, /isPrincipleLocked\(isFree, freeLimit, offset \+ idx\)/);
  assert.match(src, /classification_keywords/);
});

/** The route's per-principle lock for one window, as it maps a window of rows. */
function lockWindow(query: string, collectionSize: number, freeLimit: number, freeIds: string[] = []) {
  const { offset, limit } = planPrincipleWindow(q(query));
  const all = Array.from({ length: collectionSize }, (_, i) => `p-${i}`);
  return all.slice(offset, offset + limit).map((id, idx) => ({
    id, locked: isPrincipleLocked(freeIds.includes(id), freeLimit, offset + idx),
  }));
}

test("paywall: window 2 of a free-limit-5 collection is fully locked for a guest", () => {
  const w2 = lockWindow("offset=100&limit=100", 2323, 5);
  assert.equal(w2.length, 100);
  assert.ok(w2.every((p) => p.locked), "no principle past the first 5 is unlocked by windowing");
  // page=2 is the same window.
  assert.ok(lockWindow("page=2&limit=100", 2323, 5).every((p) => p.locked));
  // Window 1: exactly global indexes 0..4 are open.
  const w1 = lockWindow("offset=0&limit=100", 2323, 5);
  assert.deepEqual(w1.filter((p) => !p.locked).map((p) => p.id), ["p-0", "p-1", "p-2", "p-3", "p-4"]);
  // A window that straddles the limit: offset 3 → p-3, p-4 open, p-5 on locked.
  assert.deepEqual(lockWindow("offset=3&limit=4", 2323, 5).map((p) => p.locked), [false, false, true, true]);
});

test("paywall: an unlimited user (freeLimit -1) sees nothing locked in any window", () => {
  for (const query of ["offset=0&limit=100", "offset=100&limit=100", "offset=2000&limit=500"]) {
    assert.ok(lockWindow(query, 2323, -1).every((p) => !p.locked), query);
  }
});

test("paywall: an explicitly free principle stays open deep in the collection", () => {
  const w = lockWindow("offset=1000&limit=10", 2323, 5, ["p-1004"]);
  assert.deepEqual(w.filter((p) => !p.locked).map((p) => p.id), ["p-1004"]);
});
