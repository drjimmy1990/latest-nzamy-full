/**
 * founderDiscount.test.ts — F12: 15 % off top-ups for an active founder,
 * the better of coupon vs founder discount (never both), exact halalas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bestDiscount,
  FOUNDER_DISCOUNT_CAMPAIGN_ID,
  founderDiscountApplies,
  founderDiscountHalalas,
  founderDiscountBps,
  founderDiscountLabelAr,
  founderDiscountMetadata,
  FOUNDER_DISCOUNT_LABEL_AR,
  isActiveFounder,
} from "./founderDiscount.ts";
import { applyDiscount } from "./couponRules.ts";
import { quote } from "./catalog.ts";
import { FOUNDER_CAMPAIGN_ID } from "../membership/founderPlan.ts";
import { fakeDb } from "./fakeDb.test-helper.ts";

test("the campaign id is founderPlan's", () => {
  assert.equal(FOUNDER_DISCOUNT_CAMPAIGN_ID, FOUNDER_CAMPAIGN_ID);
});

test("only top-ups are eligible (plans, library, membership are not)", () => {
  assert.equal(founderDiscountApplies("topup"), true);
  for (const k of ["plan", "library", "membership", "service"]) assert.equal(founderDiscountApplies(k), false, k);
});

test("15 % in exact halalas on every professional top-up the book sells, VAT on the rest, points untouched", () => {
  const cases: Array<[string, number, number, number, number]> = [
    // id, list net, discount, net, total (VAT 15 % of net)
    ["topup-500", 50000, 7500, 42500, 48875],
    ["topup-1000", 100000, 15000, 85000, 97750],
    ["topup-2500", 250000, 37500, 212500, 244375],
    ["topup-5000", 500000, 75000, 425000, 488750],
    ["topup-10000", 1000000, 150000, 850000, 977500],
  ];
  for (const [id, listNet, discount, net, total] of cases) {
    const q = quote(id, "once");
    assert.ok(q.ok, id);
    if (!q.ok) continue;
    assert.equal(q.netHalalas, listNet, id);
    const d = founderDiscountHalalas(q.netHalalas);
    assert.equal(d, discount, id);
    const after = applyDiscount(q.netHalalas, d);
    assert.equal(after.netHalalas, net, id);
    assert.equal(after.totalHalalas, total, id);
    assert.equal(after.vatHalalas, Math.round((net * 15) / 100), id);
  }
});

test("founderDiscountHalalas floors to a halala and rejects bad nets", () => {
  assert.equal(founderDiscountHalalas(333), 49); // 49.95 → 49
  assert.equal(founderDiscountHalalas(1), 0);
  assert.equal(founderDiscountHalalas(0), 0);
  assert.equal(founderDiscountHalalas(-100), 0);
  assert.equal(founderDiscountHalalas(10.5), 0);
});

test("bestDiscount: the larger wins, never the sum; a tie keeps the coupon unused", () => {
  assert.deepEqual(bestDiscount(5000, 7500), { source: "founder", discountHalalas: 7500 });
  assert.deepEqual(bestDiscount(9000, 7500), { source: "coupon", discountHalalas: 9000 });
  assert.deepEqual(bestDiscount(7500, 7500), { source: "founder", discountHalalas: 7500 });
  assert.deepEqual(bestDiscount(null, 7500), { source: "founder", discountHalalas: 7500 });
  assert.deepEqual(bestDiscount(5000, 0), { source: "coupon", discountHalalas: 5000 });
  assert.deepEqual(bestDiscount(undefined, null), { source: null, discountHalalas: 0 });
});

test("the metadata the order stores", () => {
  assert.deepEqual(founderDiscountMetadata(50000, 7500), { pct: 15, discount_halalas: 7500, list_net_halalas: 50000 });
});

test("isActiveFounder (l7, decision 4: lifetime): an active seat at any date; a missing table is false; another error is null", async () => {
  const now = new Date("2026-11-20T10:00:00.000Z");
  const yes = fakeDb((q) => (q.table === "founder_seats" ? { data: [{ id: "s1" }] } : undefined));
  assert.equal(await isActiveFounder(yes.client, "u1", now), true);
  const q = yes.log[0];
  // no ends_at filter: the year ending does not end the discount; a revoked
  // (refunded) or pending_verification seat is not 'active'
  assert.deepEqual(
    q.filters.map(([op, c, v]) => `${op}:${c}:${String(v)}`),
    ["eq:user_id:u1", "eq:campaign_id:founder-2026", "eq:status:active"],
  );
  const no = fakeDb(() => ({ data: [] }));
  assert.equal(await isActiveFounder(no.client, "u1", now), false);
  const missing = fakeDb(() => ({ error: { code: "42P01" } }));
  assert.equal(await isActiveFounder(missing.client, "u1", now), false);
  const broken = fakeDb(() => ({ error: { code: "XX000" } }));
  assert.equal(await isActiveFounder(broken.client, "u1", now), null);
});

test("l7 decision 4: the rate comes from founder_topup_discount_bps, 1500 by default", async () => {
  // the rate applies on the pre-VAT price
  assert.equal(founderDiscountHalalas(50000, 1500), 7500);
  assert.equal(founderDiscountHalalas(50000, 1000), 5000);
  assert.equal(founderDiscountHalalas(50000, 0), 0);
  assert.equal(founderDiscountHalalas(333, 1250), 41); // 41.625 → 41
  assert.equal(founderDiscountHalalas(50000, 10001), 0, "a rate past 100 % is refused");
  assert.equal(founderDiscountHalalas(50000, 12.5), 0, "a fractional bps is refused");
  assert.deepEqual(founderDiscountMetadata(50000, 5000, 1000), { pct: 10, discount_halalas: 5000, list_net_halalas: 50000 });

  const set = fakeDb((q) => (q.table === "platform_settings" ? { data: { value: 1200 } } : undefined));
  assert.equal(await founderDiscountBps(set.client), 1200);
  assert.deepEqual(
    set.log[0].filters.map(([op, c, v]) => `${op}:${c}:${String(v)}`),
    ["eq:key:founder_topup_discount_bps"],
  );
  for (const value of [null, "1500", -1, 10001, 15.5, { bps: 1500 }]) {
    const odd = fakeDb(() => ({ data: { value } }));
    assert.equal(await founderDiscountBps(odd.client), 1500, JSON.stringify(value));
  }
  assert.equal(await founderDiscountBps(fakeDb(() => ({ data: null })).client), 1500, "no row → 1500");
  assert.equal(await founderDiscountBps(fakeDb(() => ({ error: { code: "42P01" } })).client), 1500);
  assert.equal(await founderDiscountBps(fakeDb(() => ({ error: { code: "XX000" } })).client), 1500, "never the full price");
});

test("the label: the browser's has no percent (the server's amount stands); the page's names the setting's rate", () => {
  assert.equal(FOUNDER_DISCOUNT_LABEL_AR, "خصم العضو المؤسس");
  assert.equal(founderDiscountLabelAr(1500), "خصم العضو المؤسس (١٥٪)");
  assert.equal(founderDiscountLabelAr(1250), "خصم العضو المؤسس (١٢٫٥٪)");
  assert.equal(founderDiscountLabelAr(), "خصم العضو المؤسس (١٥٪)");
});
