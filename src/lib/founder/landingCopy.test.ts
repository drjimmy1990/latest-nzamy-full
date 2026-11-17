import assert from "node:assert/strict";
import test from "node:test";
import { quote } from "../payments/catalog.ts";
import { FOUNDER_PLAN_ID } from "../membership/founderPlan.ts";
import {
  FOUNDER_FALLBACK_ENDS_AT_EXCLUSIVE,
  FOUNDER_FALLBACK_STARTS_AT,
  FOUNDER_WORK_KINDS,
  amountAr,
  founderLandingPrice,
} from "./landingCopy.ts";

// campaign.manifest.v2.json (17 Nov 2026): price_sar 2996.00, VAT 15 %,
// total_with_vat_sar 3445.40, regular_price_sar_pre_vat 9500.00.
test("the checkout's price book matches the owner's manifest", () => {
  const q = quote(FOUNDER_PLAN_ID, "once");
  assert.ok(q.ok);
  if (!q.ok) return;
  assert.equal(q.netHalalas, 299_600);
  assert.equal(q.vatHalalas, 44_940);
  assert.equal(q.totalHalalas, 344_540);
});

test("the join card's price block", () => {
  assert.deepEqual(founderLandingPrice(), { regular: "٩٬٥٠٠", net: "٢٬٩٩٦", vat: "٤٤٩٫٤٠", total: "٣٬٤٤٥٫٤٠" });
  assert.equal(founderLandingPrice({}), null, "no price when the item is not sold");
  assert.equal(amountAr(5), "٠٫٠٥");
});

test("fallback window = the manifest's (18 Nov 00:00 → 18 Dec 00:00 Riyadh, exclusive)", () => {
  assert.equal(FOUNDER_FALLBACK_STARTS_AT, "2026-11-18T00:00:00+03:00");
  assert.equal(FOUNDER_FALLBACK_ENDS_AT_EXCLUSIVE, "2026-12-18T00:00:00+03:00");
});

test("seven eligible kinds", () => {
  assert.equal(FOUNDER_WORK_KINDS.length, 7);
});
