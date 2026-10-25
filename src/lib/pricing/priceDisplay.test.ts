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

// ── The invariant the yearly «بدلاً من» line relies on ───────────────────────
//
// The individuals' reference price is derived from the price book —
// pricing.individuals.ts writes `priceOriginal: twelveMonths("<id>", lang)` —
// so it is always exactly 12 × the monthly price; the book must keep the
// yearly price below it for the struck-through line to be true.

const individuals = readFileSync(
  new URL("../../constants/pricing/pricing.individuals.ts", import.meta.url),
  "utf8",
);

test("every individuals reference price is 12 × the book's monthly price, above the book's yearly one", () => {
  const ids = ["ind-ai", "ind-preventive", "ind-litigation"];
  for (const id of ids) {
    for (const lang of ["ar", "en"]) {
      assert.ok(individuals.includes(`priceOriginal: twelveMonths("${id}", "${lang}")`), `${id} ${lang}: the reference is derived from the book`);
    }
    assert.ok(bookSar(id, "yearly") < bookSar(id, "monthly") * 12, `${id}: the yearly price is not below 12 × monthly`);
  }
  assert.match(individuals, /const twelveMonths = \(id: string, lang: "ar" \| "en"\) => formatSarAmount\(bookSar\(id, "monthly"\) \* 12, lang\);/);
  assert.equal((individuals.match(/priceOriginal:/g) ?? []).length, 6, "three paid plans × two languages carry a reference price");
  assert.doesNotMatch(individuals, /priceOriginal: "/, "no literal reference price");
});
