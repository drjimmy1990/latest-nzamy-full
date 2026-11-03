import assert from "node:assert/strict";
import test from "node:test";
import { estimateLineAr } from "./estimateLine.ts";

const S = { quoteSource: "server" } as const;

test("S6: the queue's estimate line", () => {
  assert.equal(
    estimateLineAr({ ...S, originalPrice: 800, priceMode: "starting_from", priceAudience: "corporate" }),
    "السعر التقديري: يبدأ من ٨٠٠ ر.س (أعمال)",
  );
  assert.equal(
    estimateLineAr({ ...S, originalPrice: 600, priceMode: "starting_from", priceAudience: "individual" }),
    "السعر التقديري: يبدأ من ٦٠٠ ر.س (أفراد)",
  );
  assert.equal(estimateLineAr({ ...S, originalPrice: 500, priceMode: "fixed" }), "السعر التقديري: ٥٠٠ ر.س");
  assert.equal(estimateLineAr({ ...S, originalPrice: 0 }), null);
  assert.equal(estimateLineAr({ ...S, priceMode: "fixed" }), null);
  assert.equal(estimateLineAr("text"), null);
  assert.equal(estimateLineAr(null), null);
});

test("fix round 1 (I-1/I-2): only the server's stamp prints — a browser-only price or the WhatsApp chat's figure prints nothing", () => {
  // A browser figure on a service the stamp does not price (a body-chosen label too).
  assert.equal(
    estimateLineAr({ service: "contract-review-business", originalPrice: 100, priceMode: "starting_from", priceAudience: "individual" }),
    null,
  );
  assert.equal(estimateLineAr({ originalPrice: 600, priceMode: "starting_from", quoteSource: "backend" }), null);
  // The WhatsApp widget's hardcoded lawyer figure, never re-priced by the server.
  assert.equal(estimateLineAr({ service: "whatsapp_widget", originalPrice: 700 }), null);
  assert.equal(estimateLineAr({ service: "whatsapp_widget", originalPrice: 50 }), null);
});

test("S6: odd stored values never print a wrong figure or label", () => {
  assert.equal(estimateLineAr({ ...S, originalPrice: "800", priceMode: "fixed" }), null, "only a number is a price");
  assert.equal(estimateLineAr({ ...S, originalPrice: -5 }), null);
  assert.equal(estimateLineAr({ ...S, originalPrice: Number.NaN }), null);
  assert.equal(estimateLineAr([800]), null);
  // An unknown audience or mode: the amount, no label, no «يبدأ من».
  assert.equal(estimateLineAr({ ...S, originalPrice: 1600, priceMode: "weird", priceAudience: "firm" }), "السعر التقديري: ١٬٦٠٠ ر.س");
  assert.equal(estimateLineAr({ ...S, originalPrice: 300, priceMode: "per_page" }), "السعر التقديري: يبدأ من ٣٠٠ ر.س");
});
