/**
 * _bounded.test.ts — POST-L18-01 (batch l19): the links route and the reader
 * never wait without end. Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/app/api/library/laws/[[]slug]/citations/_bounded.test.ts"
 *
 * The pure helpers, then source contracts on route.ts and _ref-box.tsx (they
 * import next/server and React, so they cannot be loaded by node --test).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GATE_BUDGET_MS,
  FLAGS_BUDGET_MS,
  GRAPH_BUDGET_MS,
  LINKS_FETCH_TIMEOUT_MS,
  VIEWER_BUDGET_MS,
  closedViewer,
  createSingleFlight,
  fetchJsonWithin,
  orFallback,
  withinBudget,
} from "./_bounded.ts";

const never = <T>() => new Promise<T>(() => undefined);

test("withinBudget: a quick answer passes through", async () => {
  assert.deepEqual(await withinBudget(Promise.resolve(7), 50), { timedOut: false, value: 7 });
});

test("withinBudget: a hung read ends at the budget", async () => {
  const t0 = Date.now();
  const r = await withinBudget(never<number>(), 30);
  assert.deepEqual(r, { timedOut: true });
  assert.ok(Date.now() - t0 < 1000);
});

test("withinBudget: a rejection in time is passed through; a late one is swallowed", async () => {
  await assert.rejects(withinBudget(Promise.reject(new Error("boom")), 50), /boom/);
  let unhandled = false;
  const onUnhandled = () => {
    unhandled = true;
  };
  process.on("unhandledRejection", onUnhandled);
  const late = new Promise<number>((_, reject) => setTimeout(() => reject(new Error("late")), 40));
  assert.deepEqual(await withinBudget(late, 5), { timedOut: true });
  await new Promise((r) => setTimeout(r, 80));
  process.off("unhandledRejection", onUnhandled);
  assert.equal(unhandled, false, "a rejection after the budget must not surface as unhandled");
});

test("orFallback: the fallback, and which one answered", async () => {
  assert.deepEqual(await orFallback(Promise.resolve("a"), 50, "b"), ["a", false]);
  assert.deepEqual(await orFallback(never<string>(), 10, "b"), ["b", true]);
});

test("closedViewer fails closed: no subscriber, every article hidden", () => {
  const v = closedViewer();
  assert.equal(v.isSubscriber, false);
  assert.ok(v.openIds instanceof Set);
  assert.equal(v.openIds.size, 0);
});

test("single flight: concurrent callers of one key share one read; it is forgotten once settled", async () => {
  const flight = createSingleFlight<number>();
  let calls = 0;
  let release!: (n: number) => void;
  const start = () => {
    calls++;
    return new Promise<number>((r) => {
      release = r;
    });
  };
  const a = flight.run("law-a", start);
  const b = flight.run("law-a", start);
  const c = flight.run("law-b", () => Promise.resolve(2));
  assert.equal(calls, 1, "the second waiter must not start a second graph read");
  assert.equal(flight.size, 2);
  release(1);
  assert.deepEqual(await Promise.all([a, b, c]), [1, 1, 2]);
  assert.equal(flight.size, 0, "a settled read is not kept (the TTL cache keeps answers, never errors)");
  await flight.run("law-a", () => Promise.resolve(3));
  assert.equal(flight.size, 0);
});

test("single flight: a failed read is shared, then forgotten (the next request retries)", async () => {
  const flight = createSingleFlight<number>();
  await assert.rejects(flight.run("k", () => Promise.reject(new Error("db"))), /db/);
  assert.equal(flight.size, 0);
  assert.equal(await flight.run("k", () => Promise.resolve(5)), 5);
  // a synchronous throw from start() is a rejection, not a crash
  await assert.rejects(flight.run("t", () => { throw new Error("sync"); }), /sync/);
  assert.equal(flight.size, 0);
});

test("budgets: the reader's wait outlasts the route's whole budget", () => {
  assert.ok(VIEWER_BUDGET_MS <= GRAPH_BUDGET_MS, "the viewer read runs beside the graph read");
  assert.ok(LINKS_FETCH_TIMEOUT_MS > GATE_BUDGET_MS + FLAGS_BUDGET_MS + GRAPH_BUDGET_MS + 250 + 1000);
});

test("fetchJsonWithin: JSON on 2xx; a non-2xx rejects", async () => {
  const ok = async () => ({ ok: true, status: 200, json: async () => ({ a: 1 }) });
  assert.deepEqual(await fetchJsonWithin<{ a: number }>("/x", 100, ok), { a: 1 });
  const bad = async () => ({ ok: false, status: 502, json: async () => ({}) });
  await assert.rejects(fetchJsonWithin("/x", 100, bad), /502/);
});

test("fetchJsonWithin: a hung request is aborted at the deadline", async () => {
  let aborted = false;
  const hang = (_: string, init: { signal: AbortSignal }) =>
    new Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>((_, reject) => {
      init.signal.addEventListener("abort", () => {
        aborted = true;
        reject(new Error("AbortError"));
      });
    });
  const t0 = Date.now();
  await assert.rejects(fetchJsonWithin("/x", 30, hang), /AbortError/);
  assert.ok(aborted);
  assert.ok(Date.now() - t0 < 1000);
});

// ── source contracts ──────────────────────────────────────────────────────────

const route = readFileSync(join(import.meta.dirname, "route.ts"), "utf8").replace(/\r\n/g, "\n");
const refBox = readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "..", "laws", "[slug]", "_ref-box.tsx"), "utf8").replace(/\r\n/g, "\n");

test("route: the public guard is bounded and a timeout is a 503, never an open answer", () => {
  assert.match(route, /withinBudget\(libraryGate\(\), GATE_BUDGET_MS\)/);
  const at = route.indexOf("if (gateRun.timedOut)");
  assert.ok(at > -1);
  assert.ok(route.slice(at, at + 300).includes("return linksBusy("), "a guard timeout must refuse");
  assert.ok(!/await libraryGate\(\)/.test(route), "no unbounded guard wait is left");
});

test("route: every graph read carries the abort signal and runs in a single flight", () => {
  assert.match(route, /graph_rag_law_article_links[\s\S]{0,200}\.abortSignal\(signal\)/);
  assert.match(route, /graph_rag_explore_neighborhood[\s\S]{0,250}\.abortSignal\(signal\)/);
  assert.match(route, /bulkFlight\.run\(key, \(\) => loadLawLinks\(/);
  assert.match(route, /articleFlight\.run\(key, \(\) => loadArticleLinks\(/);
  assert.ok(!/await getFeatureFlags\(\)/.test(route), "the switch read is bounded");
});

test("route: the viewer read is bounded, starts beside the graph read and fails closed", () => {
  const bulkAt = route.indexOf("if (url.searchParams.get('bulk') === '1') {");
  const viewerAt = route.indexOf("const viewerRead = boundedViewer(serverOnly, slug);", bulkAt);
  const graphAt = route.indexOf("bulkFlight.run(", bulkAt);
  assert.ok(bulkAt > -1 && viewerAt > bulkAt && graphAt > viewerAt, "the viewer read must start before the graph read is awaited");
  assert.match(route, /orFallback\(\s*viewerLinksAccess\(db, slug\)\.catch\(\(\) => closedViewer\(\)\),\s*VIEWER_BUDGET_MS,\s*closedViewer\(\),\s*\)/);
  // the article box: a lock read over budget keeps the box locked
  assert.match(route, /if \(lockRun\.timedOut \|\| lockRun\.value\) \{\s*return tierJson\(\{ available: true, \.\.\.lockedArticleRefs\(\) \}/);
});

test("route: a busy answer is never cached", () => {
  const at = route.indexOf("function linksBusy(");
  assert.ok(at > -1);
  const body = route.slice(at, at + 400);
  assert.match(body, /status: 503/);
  assert.match(body, /'Cache-Control': 'no-store'/);
});

test("reader: both links requests have a deadline (no bare fetch of citations)", () => {
  assert.match(refBox, /fetchJsonWithin<.+?>\(`\/api\/library\/laws\/\$\{apiSlug\(lawSlug\)\}\/citations\?bulk=1`\)/);
  assert.match(refBox, /fetchJsonWithin<Refs>\(`\/api\/library\/laws\/\$\{apiSlug\(lawSlug\)\}\/citations\?article=/);
  assert.ok(!/\bfetch\(`\/api\/library\/laws\/\$\{apiSlug\(lawSlug\)\}\/citations\?(bulk|article)/.test(refBox));
  // a failed bulk read still ends in a state the box can draw
  assert.match(refBox, /bulkStore\.set\(lawSlug, \{ status: "failed" \}\)/);
});
