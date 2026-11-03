import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseDisplayedAmount, referencePriceFor } from "./priceDisplay.ts";
import { bookSar } from "./priceBook.ts";

test("referencePriceFor: never on the monthly view", () => {
  assert.equal(referencePriceFor({ priceOriginal: "٤٦٨" }, "monthly"), null);
});

test("referencePriceFor: the yearly view shows the plan's reference price", () => {
  assert.equal(referencePriceFor({ priceOriginal: "٤٦٨" }, "yearly"), "٤٦٨");
  assert.equal(referencePriceFor({ priceOriginal: " 1,788 " }, "yearly"), "1,788");
});

test("referencePriceFor: no reference price, nothing to strike through", () => {
  assert.equal(referencePriceFor({}, "yearly"), null);
  assert.equal(referencePriceFor({ priceOriginal: "" }, "yearly"), null);
  assert.equal(referencePriceFor({ priceOriginal: null }, "yearly"), null);
});

test("parseDisplayedAmount reads Arabic-Indic and Latin amounts with separators", () => {
  assert.equal(parseDisplayedAmount("٣٩"), 39);
  assert.equal(parseDisplayedAmount("١٬٤٩٠"), 1490);
  assert.equal(parseDisplayedAmount("٥,٩٨٨"), 5988);
  assert.equal(parseDisplayedAmount("8,388"), 8388);
  assert.equal(parseDisplayedAmount("۱۲"), 12); // extended (Persian) digits
});

test("parseDisplayedAmount refuses text, open-ended and mixed-digit amounts", () => {
  assert.equal(parseDisplayedAmount("حسب الخدمة"), null);
  assert.equal(parseDisplayedAmount("179,988+"), null);
  assert.equal(parseDisplayedAmount("٥,٩٨8"), null);
  assert.equal(parseDisplayedAmount(""), null);
});

// ── The yearly «بدلاً من» line on the individuals' cards ──────────────────────
//
// It was 12 × the book's monthly price (`twelveMonths`). Since q329 (owner
// package of 1 Nov 2026) no individual plan is sold monthly, so there is no
// monthly price to multiply: no individuals card carries a reference price,
// and the helper that would have read a retired monthly price at module scope
// is gone.

const individuals = readFileSync(
  new URL("../../constants/pricing/pricing.individuals.ts", import.meta.url),
  "utf8",
);

test("no individuals card carries a reference price: no individual plan is sold monthly (q329)", () => {
  assert.throws(() => bookSar("ind-ai", "monthly"), "ind-ai is sold yearly only");
  assert.doesNotMatch(individuals, /priceOriginal:/);
  assert.doesNotMatch(individuals, /twelveMonths/);
});
