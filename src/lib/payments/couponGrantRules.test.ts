import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HIGH_NEEDS_EXPIRY_AR,
  HIGH_NEEDS_LIMIT_AR,
  HIGH_NEEDS_PURPOSE_AR,
  HIGH_NEEDS_SUPER_ADMIN_AR,
  couponPoints,
  grantablePlan,
  grantablePlans,
  highCouponIssue,
  isHighCoupon,
  newCouponDates,
  riyadhDateInput,
  withPlatformOnlyKinds,
} from "./couponGrantRules.ts";

const OK_HIGH = {
  discount_type: "percentage",
  max_discount_pct: 50,
  purpose: "تعويض عميل عن خلل",
  valid_until: "2027-01-31T20:59:59.000Z",
  max_uses: 10,
  active: true,
};

test("س٢١٣ أ: a code up to 25 % is a marketing code — no extra rule, any writer", () => {
  assert.equal(isHighCoupon({ discount_type: "percentage", max_discount_pct: 25 }), false);
  assert.equal(highCouponIssue({ discount_type: "fixed", max_discount_pct: 25, purpose: null, valid_until: null, max_uses: null }, "operations"), null);
  assert.equal(highCouponIssue({ discount_type: "percentage" }, "auditor"), null, "no cap read = the default 25");
});

test("س٢١٣ أ: above 25 %, and every free-plan / points code, is super admin + purpose + end date + use limit", () => {
  assert.equal(highCouponIssue(OK_HIGH, "super_admin"), null);
  assert.equal(highCouponIssue(OK_HIGH, "operations"), HIGH_NEEDS_SUPER_ADMIN_AR);
  assert.equal(highCouponIssue({ ...OK_HIGH, purpose: " " }, "super_admin"), HIGH_NEEDS_PURPOSE_AR);
  assert.equal(highCouponIssue({ ...OK_HIGH, valid_until: null }, "super_admin"), HIGH_NEEDS_EXPIRY_AR);
  assert.equal(highCouponIssue({ ...OK_HIGH, valid_until: "nope" }, "super_admin"), HIGH_NEEDS_EXPIRY_AR);
  assert.equal(highCouponIssue({ ...OK_HIGH, max_uses: null }, "super_admin"), HIGH_NEEDS_LIMIT_AR);
  assert.equal(highCouponIssue({ ...OK_HIGH, max_uses: 0 }, "super_admin"), HIGH_NEEDS_LIMIT_AR);
  for (const t of ["plan_upgrade", "points_grant"]) {
    assert.equal(isHighCoupon({ discount_type: t, max_discount_pct: 25 }), true, t);
    assert.equal(highCouponIssue({ ...OK_HIGH, discount_type: t, max_discount_pct: 25, max_uses: null }, "super_admin"), HIGH_NEEDS_LIMIT_AR, t);
  }
  // switching an old code off is never refused
  assert.equal(highCouponIssue({ ...OK_HIGH, max_uses: null, active: false }, "operations"), null);
});

test("س٢١٣ ب: a 100 % cap always excludes services (and top-ups); below 100 the kinds stay", () => {
  assert.deepEqual(withPlatformOnlyKinds(100, ["topup"]), ["topup", "service"]);
  assert.deepEqual(withPlatformOnlyKinds("100", ["plan"]), ["topup", "plan", "service"]);
  assert.deepEqual(withPlatformOnlyKinds(100, ["service", "topup"]), ["topup", "service"]);
  assert.deepEqual(withPlatformOnlyKinds(99, ["topup"]), ["topup"]);
  assert.deepEqual(withPlatformOnlyKinds(25, []), ["topup"]);
});

test("A-07: a free-plan code grants a plan on sale in one of its billings; never the bundle, a retired plan or a library pass", () => {
  const ids = grantablePlans().map((p) => p.id);
  assert.ok(ids.includes("lawyer-pro"));
  assert.ok(!ids.includes("lawyer-bundle"), "the bundle's library pass is keyed on a paid order");
  assert.ok(!ids.includes("ind-preventive"), "retired");
  assert.ok(!ids.some((id) => id.startsWith("lib-") || id.startsWith("topup-")));
  assert.ok(grantablePlan("lawyer-pro", "yearly"));
  assert.equal(grantablePlan("lawyer-pro", "monthly"), null, "a retired cycle");
  assert.equal(grantablePlan("lawyer-pro", "once"), null);
  assert.equal(grantablePlan("pro", "yearly"), null, "the old select's value names nothing");
  assert.equal(grantablePlan("__proto__", "yearly"), null);
  assert.equal(grantablePlan(undefined, "yearly"), null);
});

test("points: an integer 1..100,000", () => {
  assert.equal(couponPoints(500), 500);
  assert.equal(couponPoints("250"), 250);
  for (const bad of [0, -1, 1.5, "", " ", "abc", 100001, null, undefined, Number.NaN]) assert.equal(couponPoints(bad), null, String(bad));
});

test("A-06: a new code starts today in Riyadh and ends 30 days on", () => {
  // 22:30 UTC on 25 Nov is already 26 Nov in Riyadh
  assert.equal(riyadhDateInput(new Date("2026-11-25T22:30:00Z")), "2026-11-26");
  assert.deepEqual(newCouponDates(new Date("2026-11-25T22:30:00Z")), { startsAt: "2026-11-26", expiresAt: "2026-12-26" });
});

test("source contract: the coupons page and both admin routes use the rules", () => {
  const read = (rel: string) => readFileSync(join(import.meta.dirname, rel), "utf8");
  const page = read("../../app/dashboard/admin/subscriptions/coupons/page.tsx");
  assert.match(page, /minOrderAmount: NEW_COUPON_MIN_ORDER_SAR/);
  assert.match(page, /status: "active",/);
  assert.match(page, /\.\.\.newCouponDates\(new Date\(\)\)/);
  assert.doesNotMatch(page, /"2026-05-20"|"2026-06-20"/);
  assert.match(page, /value=\{draft\.planGranted \?\? ""\}/);
  assert.match(page, /value=\{draft\.planBilling \?\? ""\}/);
  const create = read("../../app/api/v1/admin/coupons/route.ts");
  assert.match(create, /const high = highCouponIssue\(insertRow, gate\.role\)/);
  assert.match(create, /grantablePlan\(body\.planGranted, body\.planBilling\)/);
  assert.match(create, /withPlatformOnlyKinds\(/);
  const patch = read("../../app/api/v1/admin/coupons/[id]/route.ts");
  assert.match(patch, /const high = highCouponIssue\(\{ \.\.\.prior, \.\.\.updateData \}, gate\.role\)/);
  assert.match(patch, /withPlatformOnlyKinds\(cap, kinds\)/);
});
