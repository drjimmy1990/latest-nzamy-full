/**
 * N02-3/4 (batch l11): the floating buttons and the reader's columns. At lg+
 * the article column is the middle 6 of 12 (max 1280px) and the floating
 * buttons sit over the side columns; both sticky side columns carry a bottom
 * padding taller than the buttons so their last rows scroll clear.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "src/app/laws/[slug]/_reader-fab-clearance.test.ts"
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAGE = readFileSync(new URL("./page.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("both sticky side columns are padded clear of the floating buttons", () => {
  assert.match(PAGE, /const READER_ASIDE_FAB_CLEARANCE = "pb-24";/);
  const asides = PAGE.match(/<aside className=\{`hidden lg:block lg:col-span-3 sticky[^`]*\$\{READER_ASIDE_FAB_CLEARANCE\}`\}/g) ?? [];
  assert.equal(asides.length, 2, "the right (identity + index) and the left (links box + tools) column");
});

test("the article column stays the middle of the 12-column grid, capped at 1280px", () => {
  assert.match(PAGE, /grid grid-cols-1 lg:grid-cols-12/);
  assert.match(PAGE, /"lg:col-span-6"/);
  assert.match(PAGE, /max-w-\[1280px\] mx-auto w-full px-3 py-8 pt-32 pb-24/);
  // The page's own scroll-to-top button sits 1.25rem from the bottom, on the start side.
  assert.match(PAGE, /style=\{\{ bottom: "calc\(1\.25rem \+ env\(safe-area-inset-bottom, 0px\)\)" \}\}\n\s*className=\{`fixed z-40 \$\{isRTL \? "right-6" : "left-6"\}/);
});
