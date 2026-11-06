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

import { couponPatchDiff, couponPatchRequest, otherFirstOrderCodes } from "./couponAdminDiff.ts";
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
  assert.match(PAGE, /couponPatchRequest\(original, normalized\)/);
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

test("review M1: an edit sends the updated_at the page loaded; nothing changed sends nothing", () => {
  const loaded: AdminCoupon = { ...base, updatedAt: "2026-11-03T08:15:00.123456+00:00" };
  assert.equal(couponPatchRequest(loaded, loaded), null);
  assert.deepEqual(couponPatchRequest(loaded, { ...loaded, value: 40 }), {
    value: 40,
    expectedUpdatedAt: "2026-11-03T08:15:00.123456+00:00",
  });
  // a draft cannot move the guard: it is always the ORIGINAL's updated_at
  assert.equal(couponPatchRequest(loaded, { ...loaded, value: 40, updatedAt: "2099-01-01T00:00:00Z" })?.expectedUpdatedAt, loaded.updatedAt);
  // a row read without updated_at sends the plain diff (the route then guards its own read)
  assert.deepEqual(couponPatchRequest(base, { ...base, value: 40 }), { value: 40 });
  // the page sends it on the edit AND on the on/off toggle, and reloads on a 409
  assert.match(PAGE, /updatedAt: typeof row\.updated_at === "string" \? row\.updated_at : undefined/);
  assert.match(PAGE, /expectedUpdatedAt: current\.updatedAt/);
  assert.match(PAGE, /if \(res\.status === 409\) await loadCoupons\(\);/);
});

test("review M4: the editor warns when another live coupon is already first-order-only", () => {
  const coupons: AdminCoupon[] = [
    { ...base, code: "NEWCLIENT", firstPaidOrderOnly: true },
    { ...base, code: "WELCOME", firstPaidOrderOnly: true, status: "disabled" },
    { ...base, code: "OLDFIRST", firstPaidOrderOnly: true, status: "expired" },
    { ...base, code: "SOON", firstPaidOrderOnly: true, status: "scheduled" },
    { ...base, code: "NZAMY50", firstPaidOrderOnly: false },
  ];
  assert.deepEqual(otherFirstOrderCodes(coupons, "WELCOME2"), ["NEWCLIENT", "SOON"]);
  // the coupon being edited is never its own warning
  assert.deepEqual(otherFirstOrderCodes(coupons, " newclient "), ["SOON"]);
  assert.deepEqual(otherFirstOrderCodes([], "X"), []);
  assert.match(PAGE, /draft\.firstPaidOrderOnly === true && otherFirstOrderCodes\(coupons, draft\.code\)\.length > 0/);
});

test("review M7: the page shows the Riyadh calendar date, not a UTC slice", () => {
  assert.match(PAGE, /return couponDateInput\(value\);/);
  assert.doesNotMatch(PAGE, /value\.slice\(0, 10\)/);
});
