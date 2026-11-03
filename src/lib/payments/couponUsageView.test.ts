/**
 * couponUsageView.test.ts — S6-T13: the coupon's usage log reads coupon_usage
 * (mapping, the route's shape, and the modal's honest states).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/payments/couponUsageView.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { couponUsageDateAr, couponUsageUserIds, mapCouponUsageRows } from "./couponUsageView.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const ROUTE = readFileSync(join(ROOT, "src", "app", "api", "v1", "admin", "coupons", "[id]", "usage", "route.ts"), "utf8");
const PAGE = readFileSync(join(ROOT, "src", "app", "dashboard", "admin", "subscriptions", "coupons", "page.tsx"), "utf8");

test("S6: usage rows", () => {
  assert.deepEqual(
    mapCouponUsageRows(
      [{ id: 1, user_id: "u1", order_id: "o1", discount_applied: "50.00", created_at: "2026-11-01T10:00:00Z" }],
      [{ id: "u1", display_name: "سارة", user_type: "corporate" }],
    ),
    [{ usedBy: "سارة", usedByRole: "business", orderId: "o1", discountApplied: 50, createdAt: "2026-11-01T10:00:00Z" }],
  );
  const [gone] = mapCouponUsageRows(
    [{ id: 2, user_id: "u9", order_id: null, discount_applied: 75, created_at: "2026-11-02T10:00:00Z" }],
    [],
  );
  assert.equal(gone.usedBy, "حساب محذوف");
  assert.equal(gone.usedByRole, "client");
  assert.equal(gone.orderId, null);
  const [unnamed] = mapCouponUsageRows(
    [{ id: 3, user_id: "u2", order_id: "o2", discount_applied: null, created_at: "2026-11-02T10:00:00Z" }],
    [{ id: "u2", display_name: "  ", user_type: "individual" }],
  );
  assert.deepEqual([unnamed.usedBy, unnamed.usedByRole, unnamed.discountApplied], ["حساب بلا اسم", "client", 0]);
});

test("S6: the profiles read gets distinct ids and no null", () => {
  assert.deepEqual(
    couponUsageUserIds([
      { id: 1, user_id: "a", order_id: null, discount_applied: 1, created_at: "x" },
      { id: 2, user_id: "a", order_id: null, discount_applied: 1, created_at: "x" },
      { id: 3, user_id: null, order_id: null, discount_applied: 1, created_at: "x" },
      { id: 4, user_id: "b", order_id: null, discount_applied: 1, created_at: "x" },
    ]),
    ["a", "b"],
  );
});

test("S6: usage dates are Gregorian in Riyadh time; a bad date is «—»", () => {
  // 21:30Z on 1 Nov is 00:30 on 2 Nov in Riyadh (UTC+3): day ٠٢, month ١١, year ٢٠٢٦, 12:30 a.m.
  const text = couponUsageDateAr("2026-11-01T21:30:00Z");
  assert.match(text, /^٠٢\D+١١\D+٢٠٢٦/, text);
  assert.match(text, /١٢:٣٠/, text);
  // not UTC (that would print ٠١ … ٩:٣٠ م) and Gregorian, not the Hijri default of ar-SA
  assert.doesNotMatch(text, /^٠١/);
  assert.doesNotMatch(text, /هـ/);
  assert.equal(couponUsageDateAr("nope"), "—");
});

test("S6: the usage route — admin gate first, service role, coupon_usage newest first, ≤ 200 rows, 500 on an error, never []", () => {
  const code = ROUTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /export async function GET/);
  assert.doesNotMatch(code, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.ok(code.indexOf("requireAdmin()") > -1 && code.indexOf("requireAdmin()") < code.indexOf(".from("), "the gate comes before any query");
  assert.match(code, /isCouponId\(id\)/);
  assert.match(code, /createServiceClient\(\)/);
  assert.match(code, /\.from\("coupon_usage"\)\s*\.select\("id, user_id, order_id, discount_applied, created_at"\)\s*\.eq\("coupon_id", id\)\s*\.order\("created_at", \{ ascending: false \}\)\s*\.limit\(COUPON_USAGE_LIMIT\)/);
  assert.match(code, /\.from\("profiles"\)\s*\.select\("id, display_name, user_type"\)\s*\.in\("id", userIds\)/);
  assert.match(code, /status: 500/);
  assert.doesNotMatch(code, /data: \[\]/);
});

test("S6: the modal reads the log on open — loading, unreadable and empty are three states; no dead CSV button", () => {
  assert.match(PAGE, /\/api\/v1\/admin\/coupons\/\$\{id\}\/usage/);
  assert.match(PAGE, /تعذّرت قراءة السجل/);
  assert.match(PAGE, /لم يُسجَّل استخدام بعد/);
  assert.doesNotMatch(PAGE, /لم يتم استخدام الكوبون بعد/);
  assert.doesNotMatch(PAGE, />\s*CSV\s*</);
  assert.doesNotMatch(PAGE, /DownloadSimple/);
  assert.match(PAGE, /couponUsageDateAr\(/);
});
