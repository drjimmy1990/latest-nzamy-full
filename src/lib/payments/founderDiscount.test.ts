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
  addMonthsUtc,
  founderDiscountEndsAt,
  founderDiscountExpiresIssue,
  founderDiscountWindowFromSetting,
} from "./founderDiscount.ts";
import { applyDiscount } from "./couponRules.ts";
import { quote } from "./catalog.ts";
import { FOUNDER_CAMPAIGN_ID } from "../membership/founderPlan.ts";
import { fakeDb } from "./fakeDb.test-helper.ts";

test("the campaign id is founderPlan's", () => {
  assert.equal(FOUNDER_DISCOUNT_CAMPAIGN_ID, FOUNDER_CAMPAIGN_ID);
});

test("l9 (register 14 items 29 / 32 / 55): top-ups AND any plan or library subscription are eligible; the founder membership never", () => {
  for (const k of ["topup", "plan", "library"]) assert.equal(founderDiscountApplies(k), true, k);
  for (const k of ["membership", "service"]) assert.equal(founderDiscountApplies(k), false, k);
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

test("isActiveFounder (l8 reverts l7's lifetime rule): an active seat inside its membership year; a missing table is false; another error is null", async () => {
  const now = new Date("2026-11-20T10:00:00.000Z");
  const seat = (activated_at: string | null, ends_at: string | null = null) =>
    fakeDb((q) => (q.table === "founder_seats" ? { data: [{ id: "s1", activated_at, ends_at }] } : undefined));
  const yes = seat("2026-01-20T10:00:00.000Z"); // 10 months ago
  assert.equal(await isActiveFounder(yes.client, "u1", now), true);
  const q = yes.log[0];
  // a revoked (refunded) or pending_verification seat is not 'active'
  assert.deepEqual(
    q.filters.map(([op, c, v]) => `${op}:${c}:${String(v)}`),
    ["eq:user_id:u1", "eq:campaign_id:founder-2026", "eq:status:active"],
  );
  assert.equal(yes.log[1].table, "platform_settings", "the length is read from the setting");
  assert.deepEqual(yes.log[1].filters.map(([op, c, v]) => `${op}:${c}:${String(v)}`), ["eq:key:founder_topup_discount_expires"]);
  // 11 months → still inside; 13 months → the year ended: no discount (never lifetime)
  assert.equal(await isActiveFounder(seat("2025-12-20T10:00:00.000Z").client, "u1", now), true);
  assert.equal(await isActiveFounder(seat("2025-10-20T10:00:00.000Z").client, "u1", now), false);
  // the boundary: activation + 12 months exactly is outside
  assert.equal(await isActiveFounder(seat("2025-11-20T10:00:00.000Z").client, "u1", now), false);
  assert.equal(await isActiveFounder(seat("2025-11-20T10:00:01.000Z").client, "u1", now), true);
  // no activation date: the membership end stands for the default year; neither → no discount
  assert.equal(await isActiveFounder(seat(null, "2027-01-01T00:00:00.000Z").client, "u1", now), true);
  assert.equal(await isActiveFounder(seat(null, "2026-11-01T00:00:00.000Z").client, "u1", now), false);
  assert.equal(await isActiveFounder(seat(null, null).client, "u1", now), false);
  const no = fakeDb(() => ({ data: [] }));
  assert.equal(await isActiveFounder(no.client, "u1", now), false);
  const missing = fakeDb(() => ({ error: { code: "42P01" } }));
  assert.equal(await isActiveFounder(missing.client, "u1", now), false);
  const broken = fakeDb(() => ({ error: { code: "XX000" } }));
  assert.equal(await isActiveFounder(broken.client, "u1", now), null);
});

test("l8: founder_topup_discount_expires — months after activation (default 12, 0 = off) or a fixed Riyadh day; a bad value is the year, never lifetime", async () => {
  const now = new Date("2026-11-20T10:00:00.000Z");
  const with_ = (value: unknown, activated_at = "2026-05-20T10:00:00.000Z") =>
    fakeDb((q) =>
      q.table === "founder_seats"
        ? { data: [{ id: "s1", activated_at, ends_at: null }] }
        : q.table === "platform_settings"
          ? { data: { value } }
          : undefined,
    );
  // 6 months after activation
  assert.equal(await isActiveFounder(with_({ months_after_activation: 6 }).client, "u1", now), false);
  assert.equal(await isActiveFounder(with_({ months_after_activation: 7 }).client, "u1", now), true);
  assert.equal(await isActiveFounder(with_({ months_after_activation: 0 }).client, "u1", now), false, "0 switches it off");
  // a fixed last day (Riyadh), the same for every founder
  assert.equal(await isActiveFounder(with_({ until: "2026-11-20" }).client, "u1", now), true);
  assert.equal(await isActiveFounder(with_({ until: "2026-11-19" }).client, "u1", now), false);
  // malformed → the membership year
  for (const bad of [null, 12, "lifetime", { months_after_activation: -1 }, { months_after_activation: 1.5 }, { until: "2026-02-30" }, { until: "x", months_after_activation: 3 }]) {
    assert.equal(await isActiveFounder(with_(bad, "2025-10-01T00:00:00.000Z").client, "u1", now), false, JSON.stringify(bad));
    assert.equal(await isActiveFounder(with_(bad, "2026-01-01T00:00:00.000Z").client, "u1", now), true, JSON.stringify(bad));
  }
  // a failed setting read is the default year, never an error for the buyer
  const failed = fakeDb((q) =>
    q.table === "founder_seats" ? { data: [{ id: "s1", activated_at: "2026-01-01T00:00:00.000Z" }] } : { error: { code: "XX000" } },
  );
  assert.equal(await isActiveFounder(failed.client, "u1", now), true);
});

test("l8: the expires validator and the pure helpers", () => {
  assert.equal(founderDiscountExpiresIssue({ months_after_activation: 12 }), null);
  assert.equal(founderDiscountExpiresIssue({ months_after_activation: 0 }), null);
  assert.equal(founderDiscountExpiresIssue({ until: "2027-11-18" }), null);
  for (const bad of [null, 12, "2027-01-01", {}, { months_after_activation: 121 }, { until: "2027-13-01" }, { lifetime: true }]) {
    assert.match(founderDiscountExpiresIssue(bad) ?? "", /founder_topup_discount_expires/, JSON.stringify(bad));
  }
  assert.deepEqual(founderDiscountWindowFromSetting(undefined), { kind: "months_after_activation", months: 12 });
  assert.equal(addMonthsUtc(new Date("2026-01-31T12:00:00.000Z"), 1).toISOString(), "2026-02-28T12:00:00.000Z");
  assert.equal(addMonthsUtc(new Date("2026-11-18T09:30:00.000Z"), 12).toISOString(), "2027-11-18T09:30:00.000Z");
  assert.equal(
    founderDiscountEndsAt({ activated_at: null }, { kind: "until", day: "2027-01-31" })?.toISOString(),
    "2027-01-31T21:00:00.000Z",
  );
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
