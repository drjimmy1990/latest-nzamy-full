/**
 * firmSeats.test.ts — owner ٥٣ (18 Nov 2026): the /pricing firm cards show the
 * seats the database enforces (5 / 15), and the extra-seat price is a setting
 * that is never sold or shown publicly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FIRM_EXTRA_SEAT_PRICE_KEY, FIRM_PLAN_SEATS, firmExtraSeatPriceIssue, firmExtraSeatPriceSar } from "./firmSeats.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

test("5 for firm-basic, 15 for firm-enterprise — the same numbers as public.firm_plan_seat_cap", () => {
  assert.deepEqual({ ...FIRM_PLAN_SEATS }, { "firm-basic": 5, "firm-enterprise": 15 });
  const sql = read("supabase/migrations/20261126_50_accounts_limits.sql");
  assert.match(sql, /when 'firm-enterprise' then 15\s+when 'firm-basic'\s+then 5/);
});

test("the /pricing firm cards and the comparison table say 5 / 15, and quote no seat price", () => {
  const src = read("src/constants/pricing/pricing.firms.ts");
  // the cards' seat counts come from FIRM_PLAN_SEATS
  assert.equal(src.split('includedSeats: FIRM_PLAN_SEATS["firm-basic"]').length - 1, 2);
  assert.equal(src.split('includedSeats: FIRM_PLAN_SEATS["firm-enterprise"]').length - 1, 2);
  assert.equal(src.match(/"٥ مقاعد مشمولة"/g)?.length, 2);
  assert.equal(src.match(/"١٥ مقعداً مشمولاً"/g)?.length, 2);
  assert.equal(src.match(/"5 seats included"/g)?.length, 2);
  assert.equal(src.match(/"15 seats included"/g)?.length, 2);
  assert.match(src, /"firm-basic": "٥", "firm-enterprise": "١٥"/);
  assert.match(src, /"firm-basic": "5", "firm-enterprise": "15"/);
  assert.equal(src.split('href: "/contact?type=firm-seats"').length - 1, 4, "extra seats stay with sales");
  assert.doesNotMatch(src, /٣ مقاعد|3 seats/);
  assert.doesNotMatch(src, new RegExp(FIRM_EXTRA_SEAT_PRICE_KEY), "the price is never read by a public page");
  for (const page of ["src/app/pro/page.tsx", "src/app/register/provider/data.ts"]) {
    assert.doesNotMatch(read(page), /٣ مقاعد|3 seats|بخمسة مقاعد|with 5 seats/, page);
  }
});

test("firm_extra_seat_price_sar: null (not set) or a whole SAR price; the admin route validates it", () => {
  assert.equal(firmExtraSeatPriceIssue({ sar: null }), null);
  assert.equal(firmExtraSeatPriceIssue({ sar: 450 }), null);
  assert.equal(firmExtraSeatPriceSar({ sar: 450 }), 450);
  assert.equal(firmExtraSeatPriceSar({ sar: null }), null);
  assert.equal(firmExtraSeatPriceSar("junk"), null);
  // a bare null cannot be stored (value is NOT NULL jsonb), nor anything malformed
  for (const bad of [null, 450, { sar: 0 }, { sar: -1 }, { sar: 12.5 }, { sar: "450" }, {}, { sar: 1, x: 1 }, undefined]) {
    assert.notEqual(firmExtraSeatPriceIssue(bad), null, JSON.stringify(bad));
  }
  const route = read("src/app/api/v1/admin/settings/route.ts");
  assert.match(route, /"firm_extra_seat_price_sar",/);
  assert.match(route, /firm_extra_seat_price_sar: firmExtraSeatPriceIssue,/);
});
