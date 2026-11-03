/**
 * couponAdminDiff.test.ts — S6-T12: saving an edited coupon sends only what
 * changed, so an untouched audience ([] = everyone) and untouched dates are
 * never rewritten; plus source pins on the coupons page.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/payments/couponAdminDiff.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { couponPatchDiff } from "./couponAdminDiff.ts";
import type { AdminCoupon } from "../../types/adminBackendReady.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const PAGE = readFileSync(join(ROOT, "src", "app", "dashboard", "admin", "subscriptions", "coupons", "page.tsx"), "utf8");

const base: AdminCoupon = {
  code: "NZAMY50",
  couponType: "discount",
  discountType: "fixed",
  value: 50,
  minOrderAmount: 200,
  pointsGranted: 0,
  usageLimit: 0,
  usedCount: 3,
  startsAt: "2026-06-01",
  expiresAt: "2027-12-31",
  status: "active",
  eligibleRoles: [],
  maxDiscountPct: 25,
  excludedKinds: ["topup", "plan"],
  firstPaidOrderOnly: false,
  excludedItems: [],
};

test("S6: saving an edited coupon sends only what changed", () => {
  assert.deepEqual(couponPatchDiff(base, base), {});
  assert.deepEqual(couponPatchDiff(base, { ...base, value: 40 }), { value: 40 });
  assert.deepEqual(couponPatchDiff(base, { ...base, eligibleRoles: ["lawyer"] }), { eligibleRoles: ["lawyer"] });
  assert.deepEqual(couponPatchDiff(base, { ...base, firstPaidOrderOnly: true }), { firstPaidOrderOnly: true });
  assert.deepEqual(couponPatchDiff(base, { ...base, excludedKinds: ["plan", "topup"] }), {});
});

test("S6: arrays are sets; back to «الجميع» is sent as []; a field the editor never showed is not sent", () => {
  const forLawyers = { ...base, eligibleRoles: ["lawyer", "firm"] as AdminCoupon["eligibleRoles"] };
  assert.deepEqual(couponPatchDiff(forLawyers, { ...forLawyers, eligibleRoles: ["firm", "lawyer", "firm"] }), {});
  assert.deepEqual(couponPatchDiff(forLawyers, { ...forLawyers, eligibleRoles: [] }), { eligibleRoles: [] });
  assert.deepEqual(couponPatchDiff(base, { ...base, excludedItems: ["ind-ai", "ind-ai"] }), { excludedItems: ["ind-ai"] });
  assert.deepEqual(couponPatchDiff(base, { ...base, maxDiscountPct: undefined }), {});
  const legacy: AdminCoupon = { ...base, excludedItems: undefined };
  assert.deepEqual(couponPatchDiff(legacy, { ...legacy, excludedItems: [] }), {});
  // the code and the usage counter are never sent
  assert.deepEqual(couponPatchDiff(base, { ...base, code: "OTHER", usedCount: 9 }), {});
  assert.deepEqual(couponPatchDiff(base, { ...base, expiresAt: "2028-01-31", status: "disabled" }), {
    expiresAt: "2028-01-31",
    status: "disabled",
  });
});

test("S6: the coupons page saves the diff, keeps an empty audience, maps corporate, and has no wrong badge", () => {
  assert.match(PAGE, /couponPatchDiff\(original, normalized\)/);
  assert.match(PAGE, /لا تغييرات للحفظ/);
  assert.doesNotMatch(PAGE, /eligibleRoles\.length \? eligibleRoles : \["client"\]/);
  assert.doesNotMatch(PAGE, /Backend-ready/);
  assert.match(PAGE, /COUPON_USER_TYPE_TO_ROLE/);
  assert.match(PAGE, /الجميع/);
  assert.match(PAGE, /للطلب المدفوع الأول فقط/);
  assert.match(PAGE, /الشحن مستثنى دائماً/);
  assert.match(PAGE, /سقف الخصم ٪/);
  // the code of an existing coupon cannot be edited (a changed code used to POST a duplicate)
  assert.match(PAGE, /readOnly=\{editingId !== null\}/);
  // a 409 (changed meanwhile) reloads the list
  assert.match(PAGE, /res\.status === 409/);
  assert.doesNotMatch(PAGE, /text-gray-(100|200)\b/);
});
