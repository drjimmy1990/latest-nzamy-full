/**
 * q390 (S1 Task 6): the book reader reads the database only, in batches of 50.
 * Source contract — the reader needs a live library to render.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAGE = readFileSync(new URL("./page.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("no bundled book: no JSON import, no inline demo book", () => {
  assert.doesNotMatch(PAGE, /sources-of-right-1\.json/);
  assert.doesNotMatch(PAGE, /import\(\s*["'][^"']*\.json["']\s*\)/);
  assert.doesNotMatch(PAGE, /const DEMO_RAWD/);
  assert.doesNotMatch(PAGE, /fromNestedBook/);
  assert.doesNotMatch(PAGE, /isDemoMode/);
});

test("batches of 50; the rendered-DOM cap stays", () => {
  assert.match(PAGE, /const STREAM_BATCH = 50;/);
  assert.match(PAGE, /const STREAM_MAX_BLOCKS = 800;/);
});

test("legacy slugs redirect or show an honest notice; never a blank page", () => {
  assert.match(PAGE, /legacyTarget\("book", slug\)/);
  assert.match(PAGE, /router\.replace\(`\/book\/\$\{apiSlug\(/);
  assert.match(PAGE, /bookNotice\(/);
  assert.match(PAGE, /العودة للمكتبة/);
});
