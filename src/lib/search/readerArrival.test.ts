import { test } from "node:test";
import assert from "node:assert/strict";

import { readerArrival, withoutSearchQuery } from "./readerArrival.ts";
import { withSearchQuery } from "./multiColorSearch.ts";

test("?q= and the #hash come back as the highlight and the target", () => {
  const href = withSearchQuery("/precedents/col-1#p-17", '"عزل الوكيل" + 1436');
  const url = new URL(href, "https://nezamy.sa");
  assert.deepEqual(readerArrival(url.search, url.hash), { query: '"عزل الوكيل" + 1436', target: "p-17" });
});

test("?target= is the fallback when there is no hash; the hash wins", () => {
  assert.deepEqual(readerArrival("?q=x&target=p-9", ""), { query: "x", target: "p-9" });
  assert.deepEqual(readerArrival("?target=p-9", "#p-1"), { query: "", target: "p-1" });
  assert.deepEqual(readerArrival("", `#${encodeURIComponent("مبدأ/1")}`), { query: "", target: "مبدأ/1" });
  assert.deepEqual(readerArrival(null, "#%E0%A4%A"), { query: "", target: "%E0%A4%A" });
});

test("a long ?q= is capped; blank values are empty", () => {
  assert.equal(readerArrival(`?q=${"ع".repeat(400)}`, "").query.length, 300);
  assert.deepEqual(readerArrival("?q=%20%20", "#"), { query: "", target: "" });
});

test("withoutSearchQuery drops ?q= and keeps the rest and the hash", () => {
  assert.equal(withoutSearchQuery("/precedents/a?q=x#p1"), "/precedents/a#p1");
  assert.equal(withoutSearchQuery("/precedents/a?x=1&q=y"), "/precedents/a?x=1");
  assert.equal(withoutSearchQuery("/precedents/a#p1"), "/precedents/a#p1");
});
