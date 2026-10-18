/**
 * Owner answers ٢١٤ and ٢١٥ (18 Oct): «الكل (N)» is the live number.
 *   ٢١٤ — the admin users screen labels the chip «الكل (N)» with the live
 *         count of accounts.
 *   ٢١٥ — the blog's «الكل» pill shows the exact number of published
 *         articles that /api/v1/blog counts, not the sum of the category
 *         pills, which leaves out every article with a blank category.
 * The pages are .tsx and cannot load under node --test, so they are
 * source-read (comments stripped); the rule itself is the pure function.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { allPillCount } from "./blogCounts.ts";

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");

test("allPillCount is the API's exact total, even when the categories add up to less", () => {
  // 616 published, 600 of them under a category: the pill says 616.
  assert.equal(allPillCount(616, [400, 150, 50]), 616);
  assert.equal(allPillCount(0, [3]), 0);
});

test("allPillCount falls back to the category sum only when there is no usable total", () => {
  for (const total of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    assert.equal(allPillCount(total, [400, 150, 50]), 600, String(total));
  }
  // A bad tally never turns into NaN.
  assert.equal(allPillCount(undefined, [4, Number.NaN, 2]), 6);
});

test("allPillCount has no number to show before anything is known", () => {
  assert.equal(allPillCount(undefined, []), undefined);
  assert.equal(allPillCount(null, []), undefined);
});

test("the blog's «الكل» pill reads the unfiltered total through allPillCount", () => {
  const code = stripComments(readFileSync(new URL("./page.tsx", import.meta.url), "utf8"));
  assert.match(code, /allPillCount\(\s*allTotal\s*,/);
  // The old sum of the category pills is gone.
  assert.doesNotMatch(code, /dbCategories\.reduce\(/);
});

test("the admin users chip reads «الكل (N)» with the live count, printed once", () => {
  const code = stripComments(
    readFileSync(new URL("../dashboard/admin/users/page.tsx", import.meta.url), "utf8"),
  );
  assert.ok(code.includes("`الكل (${countTileAr(n)})`"), "label «الكل (N)»");
  // The separate badge is for the type chips only, so «الكل» does not print N twice.
  assert.match(code, /f\.value !== "all" && n !== undefined && n !== null/);
});
