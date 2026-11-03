import assert from "node:assert/strict";
import test from "node:test";
import { estimateLineAr } from "./estimateLine.ts";

test("S6: the queue's estimate line", () => {
  assert.equal(
    estimateLineAr({ originalPrice: 800, priceMode: "starting_from", priceAudience: "corporate" }),
    "السعر التقديري: يبدأ من ٨٠٠ ر.س (أعمال)",
  );
  assert.equal(
    estimateLineAr({ originalPrice: 600, priceMode: "starting_from", priceAudience: "individual" }),
    "السعر التقديري: يبدأ من ٦٠٠ ر.س (أفراد)",
  );
  assert.equal(estimateLineAr({ originalPrice: 500, priceMode: "fixed" }), "السعر التقديري: ٥٠٠ ر.س");
  assert.equal(estimateLineAr({ originalPrice: 0 }), null);
  assert.equal(estimateLineAr({ priceMode: "fixed" }), null);
  assert.equal(estimateLineAr("text"), null);
  assert.equal(estimateLineAr(null), null);
});

test("S6: odd stored values never print a wrong figure or label", () => {
  assert.equal(estimateLineAr({ originalPrice: "800", priceMode: "fixed" }), null, "only a number is a price");
  assert.equal(estimateLineAr({ originalPrice: -5 }), null);
  assert.equal(estimateLineAr({ originalPrice: Number.NaN }), null);
  assert.equal(estimateLineAr([800]), null);
  // An unknown audience or mode: the amount, no label, no «يبدأ من».
  assert.equal(estimateLineAr({ originalPrice: 1600, priceMode: "weird", priceAudience: "firm" }), "السعر التقديري: ١٬٦٠٠ ر.س");
  assert.equal(estimateLineAr({ originalPrice: 300, priceMode: "per_page" }), "السعر التقديري: يبدأ من ٣٠٠ ر.س");
});
