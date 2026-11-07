/**
 * couponRules.test.ts — the owner's coupon rules (P7, pricing doc §13أ,
 * answer ٢٧٩), pure: minimum order, the 25 % cap, once per user, excluded
 * kinds, already-discounted items, VAT after the discount, and the one
 * refusal sentence for every unknown / used code.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyDiscount,
  COUPON_INVALID_AR,
  COUPON_NOT_FOR_ITEM_AR,
  couponRefusalAr,
  evaluateCoupon,
  excludedItemsOf,
  isFirstOrderCoupon,
  normalizeCouponCode,
  type CouponContext,
  type CouponRow,
} from "./couponRules.ts";
import { formatHalalas } from "./catalog.ts";

const NOW = new Date("2026-10-26T08:00:00.000Z");

// A fixed-50 coupon OPEN to plans (min 200, top-ups excluded) — NZAMY50's
// shape until owner ٤٣٦; the plan-side mechanics below are tested on it.
const PLAN50: CouponRow = {
  id: "c-p50",
  code: "PLAN50",
  discount_type: "fixed",
  discount_value: "50.00",
  min_order_amount: "200.00",
  eligible_user_types: [],
  max_uses: null,
  used_count: 0,
  valid_from: "2026-06-01T00:00:00Z",
  valid_until: "2027-12-31T23:59:59Z",
  active: true,
  max_discount_pct: "25.00",
  excluded_kinds: ["topup"],
};

const NEWCLIENT: CouponRow = { ...PLAN50, id: "c-nc", code: "NEWCLIENT", discount_value: 75, min_order_amount: 300, excluded_kinds: ["plan", "library", "topup"] };

// Owner ٤٣٦ (3 Nov 2026): NZAMY50 is for single services only — 20261107_50
// sets its excluded_kinds to {topup, plan, library}; min 200 stays.
const NZAMY50: CouponRow = { ...PLAN50, id: "c-nz", code: "NZAMY50", excluded_kinds: ["topup", "plan", "library"] };

const ctx = (over: Partial<CouponContext> = {}): CouponContext => ({
  netHalalas: 39000,
  kind: "plan",
  userType: "individual",
  alreadyUsed: false,
  itemDiscounted: false,
  hasEarlierPaidOrder: false,
  itemId: "lawyer-pro",
  now: NOW,
  ...over,
});

test("٤٣٦: NZAMY50 never on a plan, the library or a top-up; a single service of 200 or more takes 50 off", () => {
  for (const kind of ["plan", "library", "topup"] as const) {
    assert.deepEqual(evaluateCoupon(NZAMY50, ctx({ kind, netHalalas: 149000 })), { ok: false, reason: "not_for_item" }, kind);
  }
  assert.deepEqual(evaluateCoupon(NZAMY50, ctx({ kind: "service", netHalalas: 20000 })), { ok: true, discountHalalas: 5000 });
  assert.equal(evaluateCoupon(NZAMY50, ctx({ kind: "service", netHalalas: 19999 })).ok, false, "min 200 stays (question ٤٥٢)");
});

test("PLAN50 takes 50 SAR off a 390 SAR plan; VAT is 15 % of the discounted net", () => {
  const d = evaluateCoupon(PLAN50, ctx());
  assert.deepEqual(d, { ok: true, discountHalalas: 5000 });
  const q = applyDiscount(39000, 5000);
  assert.deepEqual(q, { listNetHalalas: 39000, discountHalalas: 5000, netHalalas: 34000, vatHalalas: 5100, totalHalalas: 39100 });
});

test("below the minimum is refused with the minimum named; exactly the minimum is accepted", () => {
  const below = evaluateCoupon(PLAN50, ctx({ netHalalas: 19999 }));
  assert.deepEqual(below, { ok: false, reason: "below_minimum", minHalalas: 20000 });
  if (below.ok) throw new Error("unreachable");
  assert.equal(couponRefusalAr(below, formatHalalas), "يتطلب هذا الكود طلباً بقيمة ٢٠٠ ر.س على الأقل قبل الضريبة");
  // a 39 SAR monthly plan never reaches PLAN50's minimum
  assert.equal(evaluateCoupon(PLAN50, ctx({ netHalalas: 3900 })).ok, false);
  assert.deepEqual(evaluateCoupon(PLAN50, ctx({ netHalalas: 20000 })), { ok: true, discountHalalas: 5000 });
});

test("the 25 % cap binds every coupon: a fixed value above it and a percentage above it are both cut to 25 %", () => {
  // 50 SAR on a 200 SAR net is exactly 25 %
  assert.deepEqual(evaluateCoupon(PLAN50, ctx({ netHalalas: 20000 })), { ok: true, discountHalalas: 5000 });
  // a fixed 500 SAR coupon on a 390 SAR plan → 97.50 SAR
  const big = { ...PLAN50, discount_value: 500, min_order_amount: 0 };
  assert.deepEqual(evaluateCoupon(big, ctx()), { ok: true, discountHalalas: 9750 });
  // a 50 % coupon → 25 %; a row claiming a 60 % cap is still held at 25 %
  const pct = { ...PLAN50, discount_type: "percentage", discount_value: 50, min_order_amount: 0, max_discount_pct: 60 };
  assert.deepEqual(evaluateCoupon(pct, ctx({ netHalalas: 149000 })), { ok: true, discountHalalas: 37250 });
  // floor, never above the cap: 25 % of 39,001 halalas is 9,750.25 → 9,750
  assert.deepEqual(evaluateCoupon(big, ctx({ netHalalas: 39001 })), { ok: true, discountHalalas: 9750 });
  // LAUNCH2026-shaped: 25 % of 1,490 SAR
  const launch = { ...PLAN50, discount_type: "percentage", discount_value: 25, min_order_amount: 0 };
  assert.deepEqual(evaluateCoupon(launch, ctx({ netHalalas: 149000 })), { ok: true, discountHalalas: 37250 });
});

test("once per user: an earlier PAID use refuses it, with the same sentence as an unknown code", () => {
  const used = evaluateCoupon(PLAN50, ctx({ alreadyUsed: true }));
  assert.deepEqual(used, { ok: false, reason: "invalid" });
  if (used.ok) throw new Error("unreachable");
  assert.equal(couponRefusalAr(used, formatHalalas), COUPON_INVALID_AR);
});

test("never on a point top-up — even when a row forgot to exclude it — nor on an excluded kind or a discounted item", () => {
  assert.deepEqual(evaluateCoupon(PLAN50, ctx({ kind: "topup", netHalalas: 100000 })), { ok: false, reason: "not_for_item" });
  assert.deepEqual(evaluateCoupon({ ...PLAN50, excluded_kinds: [] }, ctx({ kind: "topup", netHalalas: 100000 })), {
    ok: false,
    reason: "not_for_item",
  });
  // NEWCLIENT is for single services: refused on a plan and on the library
  assert.deepEqual(evaluateCoupon(NEWCLIENT, ctx({ netHalalas: 399000 })), { ok: false, reason: "not_for_item" });
  assert.deepEqual(evaluateCoupon(NEWCLIENT, ctx({ kind: "library", netHalalas: 150000 })), { ok: false, reason: "not_for_item" });
  assert.deepEqual(evaluateCoupon(NEWCLIENT, ctx({ kind: "service", netHalalas: 30000 })), { ok: true, discountHalalas: 7500 });
  // ٢٧٩: an item already at a launch / campaign price takes no second discount
  const d = evaluateCoupon(PLAN50, ctx({ itemDiscounted: true }));
  assert.deepEqual(d, { ok: false, reason: "not_for_item" });
  if (d.ok) throw new Error("unreachable");
  assert.equal(couponRefusalAr(d, formatHalalas), COUPON_NOT_FOR_ITEM_AR);
});

test("P3: never on the founder membership — its first-year price is already the discount, whatever a row excludes", () => {
  for (const row of [PLAN50, { ...PLAN50, excluded_kinds: [] }, { ...PLAN50, excluded_kinds: null }]) {
    const d = evaluateCoupon(row, ctx({ kind: "membership", userType: "lawyer", netHalalas: 299600 }));
    assert.deepEqual(d, { ok: false, reason: "not_for_item" });
    if (d.ok) throw new Error("unreachable");
    assert.equal(couponRefusalAr(d, formatHalalas), COUPON_NOT_FOR_ITEM_AR);
  }
});

test("inactive, not started, expired, used up, wrong audience, points / plan coupons: all the generic refusal", () => {
  const cases: Array<[CouponRow | null, Partial<CouponContext>]> = [
    [null, {}],
    [{ ...PLAN50, active: false }, {}],
    [{ ...PLAN50, valid_from: "2026-11-01T00:00:00Z" }, {}],
    [{ ...PLAN50, valid_until: "2026-10-01T00:00:00Z" }, {}],
    [{ ...PLAN50, max_uses: 500, used_count: 500 }, {}],
    [{ ...PLAN50, eligible_user_types: ["lawyer"] }, {}],
    [{ ...PLAN50, eligible_user_types: ["lawyer"] }, { userType: null }],
    [{ ...PLAN50, discount_type: "points_grant" }, {}],
    [{ ...PLAN50, discount_type: "plan_upgrade" }, {}],
    [{ ...PLAN50, discount_value: 0 }, {}],
  ];
  for (const [row, over] of cases) {
    assert.deepEqual(evaluateCoupon(row, ctx(over)), { ok: false, reason: "invalid" }, JSON.stringify(row));
  }
  assert.equal(evaluateCoupon({ ...PLAN50, eligible_user_types: ["individual"] }, ctx()).ok, true);
  assert.equal(evaluateCoupon({ ...PLAN50, max_uses: 500, used_count: 499 }, ctx()).ok, true);
});

test("normalizeCouponCode: trimmed and upper-cased; anything not a short code is null", () => {
  assert.equal(normalizeCouponCode("  nzamy50 "), "NZAMY50");
  assert.equal(normalizeCouponCode("new-client_1"), "NEW-CLIENT_1");
  for (const bad of [undefined, null, 5, "", " ", "a", "x".repeat(33), "NZ AMY", "nzamy50'--", "ن٥٠"]) {
    assert.equal(normalizeCouponCode(bad), null, String(bad));
  }
});

test("applyDiscount never lets the net go below zero and keeps total = net + VAT", () => {
  const q = applyDiscount(10000, 50000);
  assert.equal(q.netHalalas, 0);
  assert.equal(q.totalHalalas, q.netHalalas + q.vatHalalas);
  const r = applyDiscount(149000, 37250);
  assert.equal(r.netHalalas, 111750);
  assert.equal(r.vatHalalas, Math.round(111750 * 0.15));
  assert.equal(r.totalHalalas, r.netHalalas + r.vatHalalas);
});

// ── owner ٣٠٥ (30 Oct 2026): NEWCLIENT = the buyer's first paid order on the platform ──

test("S6: only the row makes a first-order coupon", () => {
  // the name is never read (S6-T10): NEWCLIENT's rule lives in its row (20261030_16, 20261103_21)
  assert.equal(isFirstOrderCoupon(NEWCLIENT), false);
  const lowerCase: CouponRow = { ...NEWCLIENT, code: "newclient" };
  assert.equal(isFirstOrderCoupon(lowerCase), false);
  assert.equal(isFirstOrderCoupon({ ...NEWCLIENT, metadata: { first_paid_order_only: true } }), true);
  assert.equal(isFirstOrderCoupon({ ...NEWCLIENT, metadata: { first_paid_order_only: false, first_order_rule: "20261103_21" } }), false);
  assert.equal(isFirstOrderCoupon(PLAN50), false);
  assert.equal(isFirstOrderCoupon({ ...PLAN50, metadata: { first_paid_order_only: true } }), true);
  assert.equal(isFirstOrderCoupon({ ...PLAN50, metadata: { first_paid_order_only: "true" } }), false);
  assert.equal(isFirstOrderCoupon({ ...PLAN50, metadata: null }), false);
});

test("S6: an admin's un-tick makes NEWCLIENT an ordinary coupon — an earlier paid order no longer refuses it", () => {
  const unticked = { ...NEWCLIENT, excluded_kinds: ["topup"], metadata: { first_paid_order_only: false, first_order_rule: "20261103_21" } };
  assert.deepEqual(evaluateCoupon(unticked, ctx({ netHalalas: 30000, hasEarlierPaidOrder: true })), { ok: true, discountHalalas: 7500 });
});

test("S6: metadata.excluded_items refuses that item only", () => {
  const row: CouponRow = { ...PLAN50, metadata: { excluded_items: ["ind-ai"] } };
  assert.deepEqual(evaluateCoupon(row, ctx({ itemId: "ind-ai", netHalalas: 24900 })), { ok: false, reason: "not_for_item" });
  assert.deepEqual(evaluateCoupon(row, ctx({ itemId: "lawyer-pro" })), { ok: true, discountHalalas: 5000 });
  // a malformed list is ignored
  assert.deepEqual(evaluateCoupon({ ...PLAN50, metadata: { excluded_items: "ind-ai" } }, ctx({ itemId: "ind-ai", netHalalas: 24900 })), {
    ok: true,
    discountHalalas: 5000,
  });
  // a list holding a non-string still excludes the strings it names
  assert.deepEqual(evaluateCoupon({ ...PLAN50, metadata: { excluded_items: [7, "ind-ai"] } }, ctx({ itemId: "ind-ai", netHalalas: 24900 })), {
    ok: false,
    reason: "not_for_item",
  });
  // the whole id only (no prefix match) ...
  assert.equal(evaluateCoupon(row, ctx({ itemId: "ind-ai-x", netHalalas: 24900 })).ok, true);
  assert.equal(evaluateCoupon({ ...PLAN50, metadata: { excluded_items: ["ind"] } }, ctx({ itemId: "ind-ai", netHalalas: 24900 })).ok, true);
  // ... but a hand-edited case or padding still excludes it (review M2: fails closed)
  for (const stored of ["IND-AI", " ind-ai ", "Ind-Ai	"]) {
    assert.deepEqual(evaluateCoupon({ ...PLAN50, metadata: { excluded_items: [stored] } }, ctx({ itemId: "ind-ai", netHalalas: 24900 })), {
      ok: false,
      reason: "not_for_item",
    }, stored);
  }
  assert.equal(couponRefusalAr({ ok: false, reason: "not_for_item" }, formatHalalas), COUPON_NOT_FOR_ITEM_AR);
});

test("S6: excludedItemsOf reads strings from an array only", () => {
  assert.deepEqual(excludedItemsOf({ metadata: { excluded_items: ["a", 1, null, "b"] } }), ["a", "b"]);
  assert.deepEqual(excludedItemsOf({ metadata: { excluded_items: "a" } }), []);
  assert.deepEqual(excludedItemsOf({ metadata: null }), []);
  assert.deepEqual(excludedItemsOf({}), []);
});

test("٣٠٥: any earlier paid order of the buyer — whatever it bought — refuses NEWCLIENT, with the generic sentence", () => {
  const firstOrder = { ...NEWCLIENT, excluded_kinds: ["topup"], metadata: { first_paid_order_only: true } };
  assert.deepEqual(evaluateCoupon(firstOrder, ctx({ netHalalas: 30000 })), { ok: true, discountHalalas: 7500 });
  const later = evaluateCoupon(firstOrder, ctx({ netHalalas: 30000, hasEarlierPaidOrder: true }));
  assert.deepEqual(later, { ok: false, reason: "invalid" });
  assert.equal(couponRefusalAr(later as Extract<typeof later, { ok: false }>, formatHalalas), COUPON_INVALID_AR);
  // PLAN50 is not a first-order coupon: an earlier order does not matter to it
  assert.deepEqual(evaluateCoupon(PLAN50, ctx({ hasEarlierPaidOrder: true })), { ok: true, discountHalalas: 5000 });
});
