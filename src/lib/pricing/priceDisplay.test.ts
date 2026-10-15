import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseDisplayedAmount, referencePriceFor } from "./priceDisplay.ts";

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

// ── The catalogue invariant the yearly «بدلاً من» line relies on ───────────
//
// pricing.individuals.ts imports phosphor icons at runtime, so it is read as
// text: each plan object is cut at `id: "…"` and its three price fields read.

const individuals = readFileSync(
  new URL("../../constants/pricing/pricing.individuals.ts", import.meta.url),
  "utf8",
);

function planBlocks(source: string): string[] {
  const plansPart = source.split("export const comparisonIndividuals")[0];
  return plansPart.split(/\n\s*\{\s*\r?\n\s*id: "/).slice(1);
}

function field(block: string, name: string): string | null {
  const m = block.match(new RegExp(`\\b${name}: "([^"]*)"`));
  return m ? m[1] : null;
}

test("every individuals reference price is exactly 12 × the monthly price, above the annual one", () => {
  const blocks = planBlocks(individuals);
  assert.ok(blocks.length >= 10, `expected the ar + en plan lists, found ${blocks.length} plans`);
  let checked = 0;
  for (const block of blocks) {
    const original = field(block, "priceOriginal");
    if (original === null) continue;
    const id = block.slice(0, block.indexOf('"'));
    const monthly = parseDisplayedAmount(field(block, "priceMonthly") ?? "");
    const yearly = parseDisplayedAmount(field(block, "priceYearly") ?? "");
    const reference = parseDisplayedAmount(original);
    assert.ok(monthly && yearly && reference, `${id}: unreadable price fields`);
    assert.equal(reference, monthly! * 12, `${id}: «بدلاً من ${original}» is not 12 × the monthly price`);
    assert.ok(yearly! < reference!, `${id}: the annual price is not below the reference price`);
    checked++;
  }
  assert.equal(checked, 8, "four paid plans × two languages carry a reference price");
});
