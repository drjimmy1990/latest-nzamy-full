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
  BAD_BODY_AR,
  DATE_AR,
  EXPECTED_UPDATED_AT_AR,
  couponBodyObject,
  couponDateInput,
  couponDateIso,
  couponExpectedUpdatedAt,
  adminCouponMetadataPatch,
  adminDiscountFields,
  adminDiscountPatch,
  buildCouponPatchMetadata,
  COUPON_ROLES,
  COUPON_USER_TYPE_TO_ROLE,
  couponAudience,
  couponRoleToUserType,
  FIRST_ORDER_FLAG_AR,
  ITEMS_LIST_AR,
  KINDS_AR,
  ROLES_AR,
  UNKNOWN_ITEM_AR,
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

// ── S6-T11: every rule is editable; company coupons target corporate ─────────

test("S6: company coupons target corporate", () => {
  assert.equal(couponRoleToUserType("business"), "corporate");
  assert.equal(couponRoleToUserType("client"), "individual");
  assert.equal(couponRoleToUserType("lawyer"), "lawyer");
  assert.equal(COUPON_USER_TYPE_TO_ROLE.corporate, "business");
  assert.equal(COUPON_USER_TYPE_TO_ROLE.individual, "client");
  // a row saved before the fix (until 20261103_22) still shows as «الشركات»
  assert.equal(COUPON_USER_TYPE_TO_ROLE.business, "business");
  // 'business' maps to corporate and to nothing else; no other role lands on corporate
  for (const role of COUPON_ROLES) {
    if (role !== "business") assert.notEqual(couponRoleToUserType(role), "corporate", role);
  }
  assert.deepEqual(couponAudience(["business", "lawyer", "business"]), { ok: true, userTypes: ["corporate", "lawyer"] });
  assert.deepEqual(couponAudience([]), { ok: true, userTypes: [] });
  assert.deepEqual(couponAudience(["admin"]), { ok: false, error: ROLES_AR });
  assert.deepEqual(couponAudience("business"), { ok: false, error: ROLES_AR });
});

test("S6: PATCH may change the cap and the excluded kinds", () => {
  const existing = { discount_type: "fixed", min_order_amount: 200, active: true };
  assert.deepEqual(adminDiscountPatch(existing, { maxDiscountPct: 20, excludedKinds: ["plan"] }, undefined), {
    ok: true,
    fields: { max_discount_pct: 20, excluded_kinds: ["topup", "plan"] },
  });
  assert.deepEqual(adminDiscountPatch(existing, { maxDiscountPct: 30 }, undefined), { ok: false, error: MAX_PCT_AR });
  assert.deepEqual(adminDiscountPatch(existing, { maxDiscountPct: 0 }, undefined), { ok: false, error: MAX_PCT_AR });
  assert.deepEqual(adminDiscountPatch(existing, { maxDiscountPct: "abc" }, undefined), { ok: false, error: MAX_PCT_AR });
  assert.deepEqual(adminDiscountPatch(existing, { excludedKinds: ["x"] }, undefined), { ok: false, error: KINDS_AR });
  assert.deepEqual(adminDiscountPatch(existing, { excludedKinds: "plan" }, undefined), { ok: false, error: KINDS_AR });
  // topup can never be dropped
  assert.deepEqual(adminDiscountPatch(existing, { excludedKinds: [] }, undefined), { ok: true, fields: { excluded_kinds: ["topup"] } });
  // nothing sent → nothing written
  assert.deepEqual(adminDiscountPatch(existing, {}, undefined), { ok: true, fields: {} });
});

test("S6: metadata flags keep the owner's stamps", () => {
  assert.deepEqual(adminCouponMetadataPatch({ owner_rules: "r", first_order_rule: "20261103_21" }, { firstPaidOrderOnly: false }), {
    ok: true,
    metadata: { owner_rules: "r", first_order_rule: "20261103_21", first_paid_order_only: false },
  });
  const items = adminCouponMetadataPatch({}, { excludedItems: ["ind-ai"] });
  assert.ok(items.ok);
  assert.deepEqual(items.ok && items.metadata?.excluded_items, ["ind-ai"]);
  assert.deepEqual(adminCouponMetadataPatch({}, { excludedItems: ["nope"] }), { ok: false, error: "منتج مستثنى غير معروف" });
  assert.deepEqual(adminCouponMetadataPatch({}, { excludedItems: ["toString"] }), { ok: false, error: UNKNOWN_ITEM_AR });
  assert.deepEqual(adminCouponMetadataPatch({}, {}), { ok: true, metadata: null });
  // only a real boolean: a string "false" would be silently ignored by the rules, so it is refused
  assert.deepEqual(adminCouponMetadataPatch({}, { firstPaidOrderOnly: "false" }), { ok: false, error: FIRST_ORDER_FLAG_AR });
  assert.deepEqual(adminCouponMetadataPatch({}, { firstPaidOrderOnly: null }), { ok: false, error: FIRST_ORDER_FLAG_AR });
  assert.deepEqual(adminCouponMetadataPatch({}, { excludedItems: "ind-ai" }), { ok: false, error: ITEMS_LIST_AR });
  const deduped = adminCouponMetadataPatch(null, { excludedItems: ["ind-ai", "ind-ai"] });
  assert.deepEqual(deduped, { ok: true, metadata: { excluded_items: ["ind-ai"] } });
  // the input is not mutated
  const before = { owner_rules: "r" };
  adminCouponMetadataPatch(before, { firstPaidOrderOnly: true });
  assert.deepEqual(before, { owner_rules: "r" });
});

test("S6: a status change and a flag in one PATCH both survive", () => {
  assert.deepEqual(buildCouponPatchMetadata({ owner_rules: "r", status: "active" }, { first_paid_order_only: false }, "disabled"), {
    owner_rules: "r",
    status: "disabled",
    first_paid_order_only: false,
  });
  assert.equal(buildCouponPatchMetadata({ a: 1 }, null, null), null);
  // a status equal to the stored one, and no flag, changes nothing
  assert.equal(buildCouponPatchMetadata({ status: "active" }, null, "active"), null);
  assert.deepEqual(buildCouponPatchMetadata(null, null, "disabled"), { status: "disabled" });
});

test("S6: the routes use the shared rules — one metadata build, the 409 race check, corporate for «الشركات»", () => {
  for (const src of [CREATE, PATCH]) {
    assert.doesNotMatch(src, /function roleToUserType/);
    assert.match(src, /couponAudience\(/);
    assert.match(src, /adminCouponMetadataPatch\(/);
  }
  assert.match(PATCH, /buildCouponPatchMetadata\(/);
  // the old status-only metadata rewrite is gone
  assert.doesNotMatch(PATCH, /updateData\.metadata = \{ \.\.\.prevMeta, status: nextStatus \}/);
  assert.match(PATCH, /\.eq\("updated_at", expected\.value \?\? prior\.updated_at\)/);
  assert.match(PATCH, /status: 409/);
  assert.match(PATCH, /isCouponId\(id\)/);
});

test("review M1: expectedUpdatedAt — what the page loaded; absent is null, a bad value is a 400", () => {
  assert.deepEqual(couponExpectedUpdatedAt({}), { ok: true, value: null });
  assert.deepEqual(couponExpectedUpdatedAt({ expectedUpdatedAt: "2026-11-03T08:15:00.123456+00:00" }), {
    ok: true,
    value: "2026-11-03T08:15:00.123456+00:00", // passed through untouched: the DB compares it (microseconds kept)
  });
  for (const bad of [null, "", "  ", "yesterday", 1730000000, {}]) {
    assert.deepEqual(couponExpectedUpdatedAt({ expectedUpdatedAt: bad }), { ok: false, error: EXPECTED_UPDATED_AT_AR }, String(bad));
  }
  // PATCH reads it before the row, refuses a bad one, and writes only while the row still carries it
  assert.match(PATCH, /const expected = couponExpectedUpdatedAt\(body\);\s*if \(!expected\.ok\)/);
  assert.ok(PATCH.indexOf("couponExpectedUpdatedAt(body)") < PATCH.indexOf('.from("coupons")'));
  assert.doesNotMatch(PATCH, /\.eq\("updated_at", existing\.updated_at\)/);
});

test("review M6: a body that is not a JSON object is refused by both routes", () => {
  for (const bad of [null, [], [1], "x", 7, true]) assert.equal(couponBodyObject(bad), null, JSON.stringify(bad));
  assert.deepEqual(couponBodyObject({ code: "A" }), { code: "A" });
  for (const src of [CREATE, PATCH]) {
    assert.match(src, /couponBodyObject\(await request\.json\(\)\)/);
    assert.match(src, /error: BAD_BODY_AR \}, \{ status: 400 \}/);
  }
  assert.equal(BAD_BODY_AR, "بيانات غير صالحة");
});

test("review M6/M7: dates — a date-only value is that day in Riyadh; a bad date is a 400, never a 500", () => {
  // date-only: startsAt from 00:00 Riyadh, expiresAt until 23:59:59 Riyadh
  assert.deepEqual(couponDateIso("2027-12-31", "end"), { ok: true, value: "2027-12-31T20:59:59.000Z" });
  assert.deepEqual(couponDateIso("2027-12-31", "start"), { ok: true, value: "2027-12-30T21:00:00.000Z" });
  assert.deepEqual(couponDateIso(" 2026-06-01 ", "start"), { ok: true, value: "2026-05-31T21:00:00.000Z" });
  // a full timestamp is kept as given
  assert.deepEqual(couponDateIso("2027-12-31T23:59:59Z", "end"), { ok: true, value: "2027-12-31T23:59:59.000Z" });
  // empty → null (POST then starts now; PATCH clears)
  for (const empty of [undefined, null, ""]) assert.deepEqual(couponDateIso(empty, "end"), { ok: true, value: null });
  // refused: not a date, not a real day, not a string
  for (const bad of ["31/12/2027", "tomorrow", "2027-02-30", "2027-13-01", 20271231, {}, true]) {
    assert.deepEqual(couponDateIso(bad, "end"), { ok: false, error: DATE_AR }, String(bad));
    assert.deepEqual(couponDateIso(bad, "start"), { ok: false, error: DATE_AR }, String(bad));
  }
  // both routes use it, and the RangeError path is gone
  for (const src of [CREATE, PATCH]) {
    assert.match(src, /couponDateIso\(body\.startsAt, "start"\)/);
    assert.match(src, /couponDateIso\(body\.expiresAt, "end"\)/);
    assert.doesNotMatch(src, /new Date\(String\(body\./);
  }
});

test("review M7: the page's date round-trips through the stored value", () => {
  for (const day of ["2026-01-01", "2026-06-01", "2027-12-31", "2028-02-29"]) {
    for (const edge of ["start", "end"] as const) {
      const stored = couponDateIso(day, edge);
      assert.ok(stored.ok && stored.value);
      assert.equal(couponDateInput(stored.value), day, `${day} ${edge}`);
    }
  }
  // rows stored the old way (midnight UTC) still show their day
  assert.equal(couponDateInput("2027-12-31T00:00:00+00:00"), "2027-12-31");
  assert.equal(couponDateInput("2026-06-01T00:00:00Z"), "2026-06-01");
  // 23:59:59Z is 02:59 the next day in Riyadh — shown as that day, the true end
  assert.equal(couponDateInput("2027-12-31T23:59:59Z"), "2028-01-01");
  for (const bad of [undefined, null, "", "nope", 5]) assert.equal(couponDateInput(bad), "");
});
