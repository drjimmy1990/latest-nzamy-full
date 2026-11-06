import test from "node:test";
import assert from "node:assert/strict";
import { nextRadioIndex } from "./radioGroupKeys.ts";

test("S5-B9: arrow keys move through the group and wrap", () => {
  assert.equal(nextRadioIndex("ArrowDown", 0, 3), 1);
  assert.equal(nextRadioIndex("ArrowDown", 2, 3), 0);
  assert.equal(nextRadioIndex("ArrowUp", 0, 3), 2);
  assert.equal(nextRadioIndex("ArrowUp", 2, 3), 1);
});

test("S5-B9: Home and End go to the ends", () => {
  assert.equal(nextRadioIndex("Home", 2, 3), 0);
  assert.equal(nextRadioIndex("End", 0, 3), 2);
});

test("S5-B9: left and right follow the reading direction", () => {
  assert.equal(nextRadioIndex("ArrowLeft", 0, 3, true), 1);
  assert.equal(nextRadioIndex("ArrowRight", 0, 3, true), 2);
  assert.equal(nextRadioIndex("ArrowLeft", 0, 3), 1, "RTL is the default");
  assert.equal(nextRadioIndex("ArrowLeft", 0, 3, false), 2);
  assert.equal(nextRadioIndex("ArrowRight", 0, 3, false), 1);
});

test("S5-B9: any other key, or an empty group, moves nothing", () => {
  assert.equal(nextRadioIndex("Tab", 0, 3), null);
  assert.equal(nextRadioIndex("a", 0, 3), null);
  assert.equal(nextRadioIndex("ArrowDown", 0, 0), null);
});
