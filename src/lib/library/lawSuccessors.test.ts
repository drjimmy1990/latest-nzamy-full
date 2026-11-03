import assert from "node:assert/strict";
import test from "node:test";
import { successorsBySupersededSlug, SUCCESSOR_READ_MAX_ROWS } from "./lawSuccessors.ts";

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
