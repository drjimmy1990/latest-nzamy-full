/**
 * route.test.ts — GET /api/v1/admin/payments/orders hands the orders page
 * every review flag fulfilment writes, coupon_reused included (P7 review,
 * finding 1c), and the page shows it. The route imports next/server and the
 * Supabase server client, so this reads the two sources.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..", "..", "..");
const ROUTE = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");
const PAGE = readFileSync(join(ROOT, "src", "app", "dashboard", "admin", "subscriptions", "orders", "page.tsx"), "utf8");

test("every flag fulfilment merges into metadata reaches the page — coupon_reused included", () => {
  for (const flag of ["paid_unmatched", "already_entitled", "no_user", "coupon_reused"]) {
    assert.match(ROUTE, new RegExp(`${flag}: metadata\\?\\.${flag}`), flag);
  }
  assert.match(ROUTE, /coupon_reused: metadata\?\.coupon_reused === true/);
});

test("the orders page shows coupon_reused for review", () => {
  assert.match(PAGE, /coupon_reused\?: boolean/);
  assert.match(PAGE, /o\.flags\.coupon_reused \? <p>[^<]+<\/p> : null/);
});
