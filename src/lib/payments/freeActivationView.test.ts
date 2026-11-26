import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FREE_ACTIVATION_TITLE_AR, freeActivationItemAr, freeActivationView, redeemDoneAr, type FreeActivationRow } from "./freeActivationView.ts";
import { readRequestCoupon, REQUEST_COUPON_KEY, saveRequestCoupon } from "./manualRequest.ts";

const ROW: FreeActivationRow = {
  id: "r1", coupon_code: "PROFREE", kind: "plan", item_id: "lawyer-pro", billing: "yearly", points: null,
  list_net_halalas: 399000, discount_halalas: 399000, net_halalas: 0, vat_halalas: 0, status: "granted",
  receipt_number: "NZ-2026-000099", created_at: "2026-11-26T10:00:00Z", granted_at: "2026-11-26T10:00:01Z",
};

test("س٢١٣ ب: the free-activation receipt is three lines — full price, 100 % discount, net 0 — and no VAT line", () => {
  const v = freeActivationView(ROW)!;
  assert.equal(v.title, FREE_ACTIVATION_TITLE_AR);
  assert.deepEqual(v.lines.map((l) => l[0]), ["السعر الكامل", "خصم ١٠٠٪ بكود المنحة", "الصافي المدفوع"]);
  assert.equal(v.lines[0][1], "٣٬٩٩٠ ر.س");
  assert.equal(v.lines[1][1], "− ٣٬٩٩٠ ر.س");
  assert.equal(v.lines[2][1], "٠ ر.س");
  assert.ok(!JSON.stringify(v).includes("ضريبة القيمة المضافة ١٥"), "no VAT line");
  assert.match(v.item, /سنوي/);
  // anything but a granted full discount is not a receipt
  for (const bad of [null, { ...ROW, status: "opened" }, { ...ROW, status: "void" }, { ...ROW, net_halalas: 100 }, { ...ROW, discount_halalas: 1 }, { ...ROW, vat_halalas: 5 }, { ...ROW, receipt_number: "" }]) {
    assert.equal(freeActivationView(bad as FreeActivationRow | null), null, JSON.stringify(bad)?.slice(0, 60));
  }
  assert.equal(freeActivationItemAr({ kind: "points", item_id: null, billing: null, points: 1500 }), "١٬٥٠٠ نقطة");
  assert.match(redeemDoneAr({ kind: "points", points: 500, receiptNumber: "NZ-1" }), /أُضيفت ٥٠٠ نقطة.*NZ-1/);
  assert.match(redeemDoneAr({ kind: "plan", labelAr: "إدارة المكتب", billing: "yearly" }), /فُعّلت باقة «إدارة المكتب» \(سنوي\) مجاناً/);
});

test("A-59: the recognised discount code is kept for the tab, shape-checked both ways; a throwing storage keeps nothing", () => {
  const store = new Map<string, string>();
  const s = { setItem: (k: string, v: string) => void store.set(k, v), getItem: (k: string) => store.get(k) ?? null };
  assert.equal(saveRequestCoupon(s, " nzamy50 "), true);
  assert.equal(store.get(REQUEST_COUPON_KEY), "NZAMY50");
  assert.equal(readRequestCoupon(s), "NZAMY50");
  store.set(REQUEST_COUPON_KEY, "bad code!");
  assert.equal(readRequestCoupon(s), null);
  const broken = { setItem: () => { throw new Error("blocked"); }, getItem: () => { throw new Error("blocked"); } };
  assert.equal(saveRequestCoupon(broken, "NZAMY50"), false);
  assert.equal(readRequestCoupon(broken), null);
  assert.equal(readRequestCoupon(null), null);
});

test("source contract: the box sits on the subscription tab and the billing page; a request carries the kept code", () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  assert.match(read("../../app/settings/components/tabs/SubscriptionTab.tsx"), /<RedeemCodeBox \/>/);
  const billing = read("../../app/dashboard/billing/page.tsx");
  assert.match(billing, /<RedeemCodeBox \/>/);
  assert.match(billing, /from\("coupon_redemptions"\)\.select\(FREE_ACTIVATION_COLUMNS\)/);
  assert.match(read("../../components/pricing/PricingCards.tsx"), /\.\.\.\(couponCode \? \{ coupon_code: couponCode \} : \{\}\)/);
  assert.match(read("../../components/payments/RedeemCodeBox.tsx"), /fetch\("\/api\/v1\/coupons\/redeem"/);
  const page = read("../../app/dashboard/billing/activation/[id]/page.tsx");
  assert.match(page, /supabase\.from\("coupon_redemptions"\)/, "the user's own RLS client, never the service client");
  assert.doesNotMatch(page, /createServiceClient/);
});
