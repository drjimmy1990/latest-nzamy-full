/**
 * couponAdminRules.test.ts — the admin coupons page cannot put a discount
 * coupon live without the owner's rules (P7 review, finding 2): a minimum
 * order net > 0, a cap ≤ 25 %, top-ups always excluded; and a PATCH cannot
 * switch on a discount coupon whose minimum is 0.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  adminDiscountFields,
  adminDiscountPatch,
  KINDS_AR,
  MAX_PCT_AR,
  MIN_ORDER_REQUIRED_AR,
  VALUE_REQUIRED_AR,
} from "./couponAdminRules.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const CREATE = readFileSync(join(ROOT, "src", "app", "api", "v1", "admin", "coupons", "route.ts"), "utf8");
const PATCH = readFileSync(join(ROOT, "src", "app", "api", "v1", "admin", "coupons", "[id]", "route.ts"), "utf8");
const PAGE = readFileSync(join(ROOT, "src", "app", "dashboard", "admin", "subscriptions", "coupons", "page.tsx"), "utf8");

const ON = { withNewColumns: true };

test("create: a discount coupon without a minimum (missing, 0, negative, text) is refused", () => {
  for (const minOrderAmount of [undefined, null, "", 0, -5, "abc"]) {
    assert.deepEqual(adminDiscountFields("fixed", { value: 50, minOrderAmount }, ON), { ok: false, error: MIN_ORDER_REQUIRED_AR }, String(minOrderAmount));
    assert.deepEqual(adminDiscountFields("percentage", { value: 10, minOrderAmount }, ON), { ok: false, error: MIN_ORDER_REQUIRED_AR });
  }
});

test("create: the cap — max_discount_pct ≤ 25 (default 25), a percentage value ≤ 25, a value > 0", () => {
  assert.deepEqual(adminDiscountFields("fixed", { value: 50, minOrderAmount: 200, maxDiscountPct: 30 }, ON), { ok: false, error: MAX_PCT_AR });
  assert.deepEqual(adminDiscountFields("fixed", { value: 50, minOrderAmount: 200, maxDiscountPct: 0 }, ON), { ok: false, error: MAX_PCT_AR });
  assert.deepEqual(adminDiscountFields("percentage", { value: 26, minOrderAmount: 200 }, ON), { ok: false, error: MAX_PCT_AR });
  assert.deepEqual(adminDiscountFields("fixed", { value: 0, minOrderAmount: 200 }, ON), { ok: false, error: VALUE_REQUIRED_AR });
  const r = adminDiscountFields("percentage", { value: 25, minOrderAmount: 300 }, ON);
  assert.deepEqual(r, { ok: true, fields: { discount_value: 25, min_order_amount: 300, max_discount_pct: 25, excluded_kinds: ["topup"] } });
  const lower = adminDiscountFields("fixed", { value: 50, minOrderAmount: 200, maxDiscountPct: 10 }, ON);
  assert.ok(lower.ok && lower.fields.max_discount_pct === 10);
});

test("create: excluded_kinds always holds topup; unknown kinds are refused", () => {
  const r = adminDiscountFields("fixed", { value: 75, minOrderAmount: 300, excludedKinds: ["plan", "library"] }, ON);
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.fields.excluded_kinds, ["topup", "plan", "library"]);
  assert.deepEqual(adminDiscountFields("fixed", { value: 75, minOrderAmount: 300, excludedKinds: ["gift"] }, ON), { ok: false, error: KINDS_AR });
  assert.deepEqual(adminDiscountFields("fixed", { value: 75, minOrderAmount: 300, excludedKinds: "plan" }, ON), { ok: false, error: KINDS_AR });
});

test("create: before 20261026_20 the new columns are not sent, the rules still hold; points / plan coupons need no minimum", () => {
  assert.deepEqual(adminDiscountFields("fixed", { value: 50, minOrderAmount: 200 }, { withNewColumns: false }), {
    ok: true,
    fields: { discount_value: 50, min_order_amount: 200 },
  });
  assert.deepEqual(adminDiscountFields("fixed", { value: 50 }, { withNewColumns: false }), { ok: false, error: MIN_ORDER_REQUIRED_AR });
  assert.deepEqual(adminDiscountFields("points_grant", {}, ON), { ok: true, fields: {} });
  assert.deepEqual(adminDiscountFields("plan_upgrade", {}, ON), { ok: true, fields: {} });
});

test("patch: no minimum of 0, no percentage above 25, and a discount coupon with minimum 0 cannot be switched on (LAUNCH2026)", () => {
  const launch = { discount_type: "percentage", min_order_amount: "0.00", active: false };
  assert.deepEqual(adminDiscountPatch(launch, { status: "active" }, true), { ok: false, error: MIN_ORDER_REQUIRED_AR });
  // with a minimum in the same save it may go on
  assert.deepEqual(adminDiscountPatch(launch, { minOrderAmount: 200 }, true), { ok: true, fields: { min_order_amount: 200 } });
  // switching it off is always allowed
  assert.deepEqual(adminDiscountPatch({ ...launch, active: true }, {}, false), { ok: true, fields: {} });
  // an active zero-minimum coupon cannot be saved still active
  assert.deepEqual(adminDiscountPatch({ ...launch, active: true }, { expiresAt: "2027-01-01" }, undefined), { ok: false, error: MIN_ORDER_REQUIRED_AR });
  const nz = { discount_type: "fixed", min_order_amount: "200.00", active: true };
  assert.deepEqual(adminDiscountPatch(nz, { minOrderAmount: 0 }, undefined), { ok: false, error: MIN_ORDER_REQUIRED_AR });
  assert.deepEqual(adminDiscountPatch(nz, { minOrderAmount: 250 }, undefined), { ok: true, fields: { min_order_amount: 250 } });
  assert.deepEqual(adminDiscountPatch({ discount_type: "percentage", min_order_amount: 100, active: true }, { value: 40 }, undefined), { ok: false, error: MAX_PCT_AR });
  assert.deepEqual(adminDiscountPatch({ discount_type: "points_grant", min_order_amount: 0, active: false }, {}, true), { ok: true, fields: {} });
});

test("the routes apply the rules (400 with the reason) and the page sends a minimum", () => {
  assert.match(CREATE, /adminDiscountFields\(dbDiscountType, body, \{\s*withNewColumns: await couponsAvailable\(adminClient\),?\s*\}\)/);
  assert.match(CREATE, /if \(!discount\.ok\) \{\s*return NextResponse\.json\(\{ error: discount\.error \}, \{ status: 400 \}\);/);
  assert.match(CREATE, /\.\.\.discount\.fields,/);
  assert.match(PATCH, /adminDiscountPatch\(existing as Record<string, unknown>, body, nextActive\)/);
  assert.match(PATCH, /Object\.assign\(updateData, discount\.fields\)/);
  assert.match(PAGE, /minOrderAmount: Number\(row\.min_order_amount \?\? 0\)/);
  assert.match(PAGE, /setDraft\(\{ \.\.\.draft, minOrderAmount: Number\(event\.target\.value\) \}\)/);
});
