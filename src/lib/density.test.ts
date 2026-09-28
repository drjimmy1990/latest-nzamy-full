import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DENSITY,
  DENSITY_MEDIA_QUERY,
  DENSITY_OPTIONS,
  DENSITY_STORAGE_KEY,
  DENSITY_VALUES,
  densityScale,
  isDensity,
  parseDensity,
} from "./density.ts";

test("the default is today's size until the owner answers Q153", () => {
  assert.equal(DEFAULT_DENSITY, 100);
});

test("parseDensity accepts exactly the three stored strings", () => {
  assert.equal(parseDensity("100"), 100);
  assert.equal(parseDensity("85"), 85);
  assert.equal(parseDensity("75"), 75);
});

test("parseDensity accepts the same three numbers", () => {
  assert.equal(parseDensity(100), 100);
  assert.equal(parseDensity(85), 85);
  assert.equal(parseDensity(75), 75);
});

test("parseDensity falls back to the default for anything else", () => {
  for (const raw of [null, undefined, "", " 85 ", "85 ", "90", 90, "85%", "0.85", 0.85, "٨٥", "compact", {}, [], NaN, true]) {
    assert.equal(parseDensity(raw), DEFAULT_DENSITY, `input ${JSON.stringify(raw)}`);
  }
});

test("isDensity is a strict number guard", () => {
  assert.equal(isDensity(85), true);
  assert.equal(isDensity("85"), false);
  assert.equal(isDensity(90), false);
});

test("densityScale maps each density to its zoom factor", () => {
  assert.equal(densityScale(100), 1);
  assert.equal(densityScale(85), 0.85);
  assert.equal(densityScale(75), 0.75);
});

test("every value has exactly one option, in the same order, with the owner's labels", () => {
  assert.deepEqual(
    DENSITY_OPTIONS.map((option) => option.value),
    [...DENSITY_VALUES],
  );
  assert.deepEqual(
    DENSITY_OPTIONS.map((option) => option.label),
    ["قياسي 100٪", "مكثّف 85٪", "مكثّف جداً 75٪"],
  );
});

test("the storage key and media query are the ones globals.css and layout.tsx rely on", () => {
  assert.equal(DENSITY_STORAGE_KEY, "nezamy-density");
  assert.match(DENSITY_MEDIA_QUERY, /^screen and \(min-width: 1024px\)/);
  assert.match(DENSITY_MEDIA_QUERY, /\(pointer: fine\)/);
});
