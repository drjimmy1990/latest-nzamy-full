import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mergeActivityPage, timestampMicros } from "./activityPage.ts";

interface Row { id: string; createdAt: string }

/** A stream as the routes read it: created_at < before, newest first, limit. */
function readStream(rows: readonly Row[], before: string | null, limit: number): Row[] {
  const cut = before === null ? Infinity : timestampMicros(before);
  return rows
    .filter((r) => timestampMicros(r.createdAt) < cut)
    .sort((a, b) => timestampMicros(b.createdAt) - timestampMicros(a.createdAt))
    .slice(0, limit);
}

/** Pages the feed to exhaustion the way the client does; returns every id served, in order. */
function walk(streams: readonly (readonly Row[])[], pageSize: number): string[] {
  const served: string[] = [];
  let before: string | null = null;
  for (let guard = 0; guard < 1000; guard += 1) {
    const read = streams.map((rows) => readStream(rows, before, pageSize));
    const { page, nextCursor } = mergeActivityPage(
      read.map((items) => ({ items, full: items.length === pageSize })),
      pageSize,
    );
    served.push(...page.map((r) => r.id));
    if (nextCursor === null) return served;
    assert.notEqual(nextCursor, before, "the cursor made no progress");
    before = nextCursor;
  }
  throw new Error("did not finish");
}

const at = (minute: number, micros = 0) =>
  `2026-11-08T10:${String(minute).padStart(2, "0")}:00.${String(micros).padStart(6, "0")}+00:00`;

function assertAllOnce(streams: readonly (readonly Row[])[], pageSize: number) {
  const served = walk(streams, pageSize);
  const all = streams.flat().map((r) => r.id).sort();
  assert.equal(new Set(served).size, served.length, "a row was served twice");
  assert.deepEqual([...served].sort(), all, "a row was never served");
}

test("timestampMicros keeps the microseconds a JS Date drops", () => {
  assert.equal(timestampMicros("2026-11-08T10:00:00.123456+00:00") - timestampMicros("2026-11-08T10:00:00.123+00:00"), 456);
  assert.equal(timestampMicros("2026-11-08T10:00:00+00:00"), Date.parse("2026-11-08T10:00:00Z") * 1000);
  assert.equal(timestampMicros("2026-11-08T10:00:00.5+00:00") - timestampMicros("2026-11-08T10:00:00+00:00"), 500_000);
});

test("the review's case: two half-full streams merge past the page size — the cursor is set and nothing is lost", () => {
  const a = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, createdAt: at(i * 2) }));
  const b = Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, createdAt: at(i * 2 + 1) }));
  const first = mergeActivityPage([{ items: a, full: false }, { items: b, full: false }], 30);
  assert.equal(first.page.length, 30);
  assert.notEqual(first.nextCursor, null, "40 rows, 30 shown: the old rule answered null here");
  assertAllOnce([a, b], 30);
});

test("everything fits: no cursor", () => {
  const a = [{ id: "a", createdAt: at(1) }];
  assert.deepEqual(mergeActivityPage([{ items: a, full: false }, { items: [], full: false }], 30), { page: a, nextCursor: null });
  assert.deepEqual(mergeActivityPage([], 30), { page: [], nextCursor: null });
});

test("one full stream and one short one: every row once, whatever the interleaving", () => {
  const a = Array.from({ length: 95 }, (_, i) => ({ id: `a${i}`, createdAt: at(i % 60, i) }));
  const b = Array.from({ length: 7 }, (_, i) => ({ id: `b${i}`, createdAt: at(i * 8, 500) }));
  assertAllOnce([a, b], 30);
});

test("ties at the cut — across streams and inside a full stream — are carried to the next page, not skipped", () => {
  // Ten rows of each stream share one microsecond, straddling the page boundary.
  const tie = at(5, 42);
  const a = [
    ...Array.from({ length: 25 }, (_, i) => ({ id: `a-new${i}`, createdAt: at(30 + i) })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `a-tie${i}`, createdAt: tie })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `a-old${i}`, createdAt: at(1, i) })),
  ];
  const b = [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `b-tie${i}`, createdAt: tie })),
    { id: "b-old", createdAt: at(0) },
  ];
  assertAllOnce([a, b], 30);
});

test("two rows in one millisecond but different microseconds are ordered, not tied", () => {
  const a = Array.from({ length: 31 }, (_, i) => ({ id: `a${i}`, createdAt: at(10, 100 + i) }));
  const b = [{ id: "b", createdAt: at(10, 115) }];
  assertAllOnce([a, b], 30);
});

test("a page made entirely of one timestamp still moves on (the documented limit)", () => {
  const a = Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, createdAt: at(3) }));
  const { page, nextCursor } = mergeActivityPage([{ items: a, full: true }], 30);
  assert.equal(page.length, 30);
  assert.equal(nextCursor, at(3));
});

test("both activity routes page through the helper, not their own stream-full rule", () => {
  for (const rel of [["lawyer", "activity"], ["firm", "activity"]]) {
    const route = readFileSync(join(process.cwd(), "src", "app", "api", "v1", ...rel, "route.ts"), "utf8");
    assert.match(route, /import \{ mergeActivityPage \} from "@\/lib\/activity\/activityPage";/, rel.join("/"));
    assert.match(route, /mergeActivityPage\(/, rel.join("/"));
    assert.doesNotMatch(route, /items\.slice\(0, PAGE_SIZE\)/, `${rel.join("/")}: a page is still cut by hand`);
  }
});
