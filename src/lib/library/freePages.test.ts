import assert from "node:assert/strict";
import test from "node:test";
import { FREE_PAGES, FREE_PAGES_SCAN, feqhLockFrom, freeDecreePages } from "./freePages.ts";

const blocks = (pages: Array<number | null>, start = 0) => pages.map((page_number, i) => ({ order_index: start + i, page_number }));

test("a book locks from the first block on its third printed page", () => {
  assert.equal(FREE_PAGES, 2);
  // Production's الإنصاف: blocks 0–2 on pages 2, 3, 3; page 5 starts block 3.
  assert.equal(feqhLockFrom(blocks([2, 3, 3, 5, 6, 7, 8, 8]), 8), 3);
  // One block per page.
  assert.equal(feqhLockFrom(blocks([1, 2, 3, 4]), 4), 2);
  // order_index need not start at 0.
  assert.equal(feqhLockFrom(blocks([10, 10, 11, 12], 100), 4), 103);
});

test("a block with no printed page counts as a page of its own", () => {
  assert.equal(feqhLockFrom(blocks([null, null, null]), 3), 2);
  assert.equal(feqhLockFrom(blocks([4, null, 4, 5]), 4), 3);
});

test("a book of two pages or fewer is free in full; a full scan still on page 2 locks the rest", () => {
  assert.equal(feqhLockFrom(blocks([1, 1, 2]), FREE_PAGES_SCAN), Number.POSITIVE_INFINITY);
  assert.equal(feqhLockFrom([], FREE_PAGES_SCAN), Number.POSITIVE_INFINITY);
  const longPage = blocks(Array.from({ length: FREE_PAGES_SCAN }, () => 1));
  assert.equal(feqhLockFrom(longPage, FREE_PAGES_SCAN), FREE_PAGES_SCAN);
});

test("a decree gives its first two pages; unlimited and overrides pass through", () => {
  assert.equal(freeDecreePages({ freeLimit: 5 }, 9), 2);
  assert.equal(freeDecreePages({ freeLimit: 5, freeLimitSource: "default" }, 1), 1);
  assert.equal(freeDecreePages({ freeLimit: 5 }, 0), 0);
  assert.equal(freeDecreePages({ freeLimit: -1 }, 9), -1);
  assert.equal(freeDecreePages({ freeLimit: 5, isWhitelisted: true }, 9), -1);
  assert.equal(freeDecreePages({ freeLimit: 4, freeLimitSource: "override" }, 9), 4);
});
