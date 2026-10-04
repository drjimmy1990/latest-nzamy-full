import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DENSITY,
  DENSITY_LEGACY_STORAGE_KEY,
  DENSITY_LEGACY_TRUSTED,
  DENSITY_MEDIA_QUERY,
  DENSITY_OPTIONS,
  DENSITY_STORAGE_KEY,
  DENSITY_VALUES,
  densityInitSnippet,
  densityScale,
  isDensity,
  parseDensity,
  readDensity,
  resolveStoredDensity,
} from "./density.ts";

test("the default is 75 — the owner's answer to Q153 (2026-10-03)", () => {
  assert.equal(DEFAULT_DENSITY, 75);
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

test("readDensity says null — not the default — for anything that is not a density", () => {
  for (const raw of [null, undefined, "", "90", "85%", 0.85, "٨٥"]) {
    assert.equal(readDensity(raw), null, `input ${JSON.stringify(raw)}`);
  }
  assert.equal(readDensity("100"), 100);
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

test("the storage keys and media query are the ones globals.css and layout.tsx rely on", () => {
  assert.equal(DENSITY_STORAGE_KEY, "nezamy-density-v2");
  assert.equal(DENSITY_LEGACY_STORAGE_KEY, "nezamy-density");
  assert.notEqual(DENSITY_STORAGE_KEY, DENSITY_LEGACY_STORAGE_KEY);
  assert.match(DENSITY_MEDIA_QUERY, /^screen and \(min-width: 1024px\)/);
  assert.match(DENSITY_MEDIA_QUERY, /\(pointer: fine\)/);
});

// ── resolveStoredDensity: the rule the pre-paint script mirrors ──────────────

test("nothing stored anywhere → the default (75)", () => {
  assert.equal(resolveStoredDensity(null, null), 75);
});

test("an explicit choice wins, including going back to 100", () => {
  assert.equal(resolveStoredDensity("100", null), 100);
  assert.equal(resolveStoredDensity("85", null), 85);
  assert.equal(resolveStoredDensity("75", "85"), 75);
  assert.equal(resolveStoredDensity("100", "75"), 100);
});

test("a legacy '100' is NOT a choice — the first version wrote it on every load", () => {
  assert.equal(resolveStoredDensity(null, "100"), DEFAULT_DENSITY);
});

test("a legacy '85' or '75' IS a choice — only a click could have written it", () => {
  assert.equal(resolveStoredDensity(null, "85"), 85);
  assert.equal(resolveStoredDensity(null, "75"), 75);
  assert.deepEqual([...DENSITY_LEGACY_TRUSTED], [85, 75]);
});

test("junk in the new key falls through to the legacy rule, junk in both → default", () => {
  assert.equal(resolveStoredDensity("90", "85"), 85);
  assert.equal(resolveStoredDensity("", "100"), DEFAULT_DENSITY);
  assert.equal(resolveStoredDensity("x", "y"), DEFAULT_DENSITY);
});

// ── The pre-paint script must agree with React, or the page jumps on mount ──

/** Runs densityInitSnippet() against a fake storage; returns the attribute it set. */
function runSnippet(store: Record<string, string> | "blocked"): string | undefined {
  let attribute: string | undefined;
  const localStorage = {
    getItem(key: string) {
      if (store === "blocked") throw new Error("SecurityError");
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
  };
  const document = {
    documentElement: {
      setAttribute(name: string, value: string) {
        assert.equal(name, "data-density");
        attribute = value;
      },
    },
  };
  new Function("localStorage", "document", densityInitSnippet())(localStorage, document);
  return attribute;
}

test("the pre-paint snippet returns what resolveStoredDensity returns, for every combination", () => {
  const samples = [undefined, "100", "85", "75", "90", "", "85%"];
  for (const current of samples) {
    for (const legacy of samples) {
      const store: Record<string, string> = {};
      if (current !== undefined) store[DENSITY_STORAGE_KEY] = current;
      if (legacy !== undefined) store[DENSITY_LEGACY_STORAGE_KEY] = legacy;
      assert.equal(
        runSnippet(store),
        String(resolveStoredDensity(current ?? null, legacy ?? null)),
        `current=${JSON.stringify(current)} legacy=${JSON.stringify(legacy)}`,
      );
    }
  }
});

test("blocked storage → the snippet applies the default, as ThemeProvider does", () => {
  assert.equal(runSnippet("blocked"), String(DEFAULT_DENSITY));
});
