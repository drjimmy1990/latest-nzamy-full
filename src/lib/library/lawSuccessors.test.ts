import assert from "node:assert/strict";
import test from "node:test";
import { readSuccessorRows, successorsBySupersededSlug, SUCCESSOR_READ_MAX_ROWS } from "./lawSuccessors.ts";

test("§2.4-1: the replaced slug maps to the newer law that names it", () => {
  const map = successorsBySupersededSlug([
    { slug: "civil-transactions-law", title: "نظام المعاملات المدنية", supersedes_law_slug: "old-civil-law" },
    { slug: "unrelated-law", title: "نظام آخر", supersedes_law_slug: null },
    { slug: "", title: "بلا معرف", supersedes_law_slug: "x" },
  ]);
  assert.deepEqual([...map.entries()], [["old-civil-law", { slug: "civil-transactions-law", title: "نظام المعاملات المدنية" }]]);
});

test("§2.4-1: a self-link is ignored; two successors resolve to the smaller slug", () => {
  const map = successorsBySupersededSlug([
    { slug: "law-b", title: "ب", supersedes_law_slug: "old" },
    { slug: "law-a", title: "أ", supersedes_law_slug: " old " },
    { slug: "self", title: "ذاته", supersedes_law_slug: "self" },
    null,
    "junk",
  ]);
  assert.deepEqual(map.get("old"), { slug: "law-a", title: "أ" });
  assert.equal(map.has("self"), false);
  assert.equal(map.size, 1);
  assert.equal(successorsBySupersededSlug(null).size, 0);
});

test("the one successor read has a runaway guard above the table's size", () => {
  assert.ok(SUCCESSOR_READ_MAX_ROWS >= 6_000);
});

test("readSuccessorRows: one request when the count is covered; the full walk otherwise", async () => {
  const run = async (firstResult: { data: string[] | null; error: { message: string } | null; count: number | null }) => {
    const calls = { first: 0, rest: 0 };
    const result = await readSuccessorRows<string>(
      async () => { calls.first++; return firstResult; },
      async () => { calls.rest++; return { data: ["walked"], error: null }; },
    );
    return { calls, result };
  };

  const covered = await run({ data: ["a", "b", "c"], error: null, count: 3 });
  assert.deepEqual(covered.calls, { first: 1, rest: 0 });
  assert.deepEqual(covered.result, { data: ["a", "b", "c"], error: null });

  const none = await run({ data: [], error: null, count: 0 });
  assert.deepEqual(none.calls, { first: 1, rest: 0 });
  assert.deepEqual(none.result, { data: [], error: null });

  const larger = await run({ data: new Array(1000).fill("x"), error: null, count: 1500 });
  assert.deepEqual(larger.calls, { first: 1, rest: 1 });
  assert.deepEqual(larger.result.data, ["walked"]);

  const unknown = await run({ data: ["a"], error: null, count: null });
  assert.deepEqual(unknown.calls, { first: 1, rest: 1 });

  const failed = await run({ data: null, error: { message: "boom" }, count: null });
  assert.deepEqual(failed.calls, { first: 1, rest: 0 });
  assert.deepEqual(failed.result, { data: [], error: { message: "boom" } });
});
