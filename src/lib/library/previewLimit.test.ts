import assert from "node:assert/strict";
import test from "node:test";
import { effectiveFreeLimit, previewLimit } from "./previewLimit.ts";

test("the owner's formula: 5% or 5 whichever is less, never below 3, never above the document", () => {
  assert.equal(previewLimit(400), 5);  // 5% = 20 → capped at 5
  assert.equal(previewLimit(100), 5);  // 5% = 5
  assert.equal(previewLimit(80), 4);   // 5% = 4
  assert.equal(previewLimit(60), 3);   // 5% = 3
  assert.equal(previewLimit(40), 3);   // 5% = 2 → floor of 3
  assert.equal(previewLimit(3), 3);
  assert.equal(previewLimit(2), 2);    // fewer than 3: what it has
  assert.equal(previewLimit(1), 1);
  assert.equal(previewLimit(0), 0);
});

test("the platform setting stays the upper bound; the floor of 3 still holds", () => {
  assert.equal(previewLimit(400, 10), 10);
  assert.equal(previewLimit(400, 2), 3);
  assert.equal(previewLimit(400, Number.NaN), 5);
});

test("unlimited and per-document overrides pass through; the default follows the formula", () => {
  assert.equal(effectiveFreeLimit({ freeLimit: -1 }, 400), -1);
  assert.equal(effectiveFreeLimit({ freeLimit: 12, freeLimitSource: "override" }, 400), 12);
  assert.equal(effectiveFreeLimit({ freeLimit: 5, freeLimitSource: "default" }, 40), 3);
  assert.equal(effectiveFreeLimit({ freeLimit: 5 }, 400), 5);
});
