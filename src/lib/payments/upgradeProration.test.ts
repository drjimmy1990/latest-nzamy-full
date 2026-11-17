/**
 * upgradeProration.test.ts — Q511: the pro-rata credit of an upgrade, in
 * exact halalas, and the refusals (downgrade, open-ended same tier).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DAY_MS,
  MIN_CHARGE_HALALAS,
  netAfterCredit,
  orderCreditable,
  prorationMetadata,
  readUpgrade,
  rowCredit,
  upgradeCreditLineAr,
  upgradeDecision,
  UPGRADE_ALREADY_AR,
  UPGRADE_DOWNGRADE_AR,
  type HeldPlanRow,
  type SourceOrderRow,
} from "./upgradeProration.ts";
import { applyDiscount } from "./couponRules.ts";
import { fakeDb } from "./fakeDb.test-helper.ts";

// the server ranking (src/lib/access-control.ts TIER_RANK)
const RANKS = { free: 0, shield: 1, ai: 2, pro: 3, max: 4, corp: 5, enterprise: 6 } as const;
const USER = "00000000-0000-0000-0000-00000000u001";

const START = Date.parse("2026-01-01T00:00:00.000Z");
const END = Date.parse("2027-01-01T00:00:00.000Z"); // 365 days

function row(over: Partial<HeldPlanRow> = {}): HeldPlanRow {
  return {
    id: "sub-1",
    plan_id: "firm-basic",
    tier: "corp",
    status: "active",
    current_period_start: new Date(START).toISOString(),
    current_period_end: new Date(END).toISOString(),
    metadata: { order_id: "ord-1" },
    ...over,
  };
}

function order(over: Partial<SourceOrderRow> = {}): SourceOrderRow {
  return {
    id: "ord-1",
    user_id: USER,
    kind: "plan",
    item_id: "firm-basic",
    status: "paid",
    live: true,
    net_halalas: 990000, // firm-basic yearly 9,900 SAR
    metadata: {},
    ...over,
  };
}

const decide = (rows: HeldPlanRow[], orders: SourceOrderRow[], now: number, tier = "enterprise") =>
  upgradeDecision({ userId: USER, tier, now: new Date(now), ranks: RANKS, rows, orders: new Map(orders.map((o) => [o.id, o])) });

test("rowCredit: exact halalas — half way through a 365-day year", () => {
  // 182.5 days left → ceil 183 days; 990000 × 183 / 365 = 496356.16… → 496356
  const now = START + 182.5 * DAY_MS;
  assert.deepEqual(rowCredit(990000, START, END, now), { periodDays: 365, remainingDays: 183, creditHalalas: 496356 });
});

test("rowCredit edge: the same day as the purchase credits the whole period", () => {
  assert.deepEqual(rowCredit(990000, START, END, START), { periodDays: 365, remainingDays: 365, creditHalalas: 990000 });
  assert.deepEqual(rowCredit(990000, START, END, START + 3 * 3600_000), { periodDays: 365, remainingDays: 365, creditHalalas: 990000 });
});

test("rowCredit edge: the last day credits one day; after the end nothing", () => {
  // one hour left → 1 day: floor(990000 / 365) = 2712
  assert.deepEqual(rowCredit(990000, START, END, END - 3600_000), { periodDays: 365, remainingDays: 1, creditHalalas: 2712 });
  assert.deepEqual(rowCredit(990000, START, END, END), { periodDays: 365, remainingDays: 0, creditHalalas: 0 });
  assert.deepEqual(rowCredit(990000, START, END, END + DAY_MS), { periodDays: 365, remainingDays: 0, creditHalalas: 0 });
});

test("rowCredit: a row stacked to start in the future is credited in full; bad inputs credit nothing", () => {
  assert.equal(rowCredit(990000, START, END, START - 10 * DAY_MS).creditHalalas, 990000);
  assert.equal(rowCredit(0, START, END, START).creditHalalas, 0);
  assert.equal(rowCredit(-5, START, END, START).creditHalalas, 0);
  assert.equal(rowCredit(1.5, START, END, START).creditHalalas, 0);
  assert.equal(rowCredit(990000, Number.NaN, END, START).creditHalalas, 0);
  assert.equal(rowCredit(990000, END, START, START).creditHalalas, 0);
});

test("rowCredit: a quarter (92 days) with 30 days left — 299000 × 30 / 92 = 97500 exactly", () => {
  const qs = Date.parse("2026-10-01T00:00:00.000Z");
  const qe = Date.parse("2027-01-01T00:00:00.000Z");
  assert.deepEqual(rowCredit(299000, qs, qe, qe - 30 * DAY_MS), { periodDays: 92, remainingDays: 30, creditHalalas: 97500 });
});

test("upgradeDecision: firm-basic → firm-enterprise mid-year credits what was paid, and the VAT is on the rest", () => {
  const now = START + 182.5 * DAY_MS;
  const d = decide([row()], [order()], now);
  assert.equal(d.kind, "credit");
  if (d.kind !== "credit") return;
  assert.equal(d.creditHalalas, 496356);
  assert.equal(d.key, "sub-1");
  assert.deepEqual(d.parts, [
    { subscriptionId: "sub-1", orderId: "ord-1", paidNetHalalas: 990000, periodDays: 365, remainingDays: 183, creditHalalas: 496356 },
  ]);
  // firm-enterprise yearly 14,900 → 1490000 − 496356 = 993644 net; VAT 149046.6 → 149047
  const net = netAfterCredit(1490000, d.creditHalalas);
  assert.equal(net, 993644);
  const q = applyDiscount(1490000, d.creditHalalas);
  assert.deepEqual(q, { listNetHalalas: 1490000, discountHalalas: 496356, netHalalas: 993644, vatHalalas: 149047, totalHalalas: 1142691 });
  assert.equal(upgradeCreditLineAr(496356), "يُخصم المتبقي من باقتك الحالية: ٤٬٩٦٣٫٥٦ ر.س");
});

test("upgradeDecision: the launch price actually paid (8,415) is the base, not the listed 9,900", () => {
  const d = decide([row()], [order({ net_halalas: 841500 })], START);
  assert.ok(d.kind === "credit" && d.creditHalalas === 841500);
});

test("upgradeDecision edge: downgrade (a running higher tier) is refused; so is an open-ended row of the same tier", () => {
  const ent = row({ tier: "enterprise", plan_id: "firm-enterprise" });
  assert.deepEqual(decide([ent], [order()], START + DAY_MS, "corp"), { kind: "refused", reason: "downgrade", error: UPGRADE_DOWNGRADE_AR });
  // a higher row that has ENDED does not refuse (it is lapsed)
  assert.deepEqual(decide([ent], [order()], END + DAY_MS, "corp"), { kind: "none" });
  // an admin's open-ended higher row refuses too
  assert.equal(decide([row({ tier: "max", current_period_end: null })], [], START, "pro").kind, "refused");
  // same tier open-ended → «already»
  assert.deepEqual(decide([row({ current_period_end: null })], [order()], START, "corp"), {
    kind: "refused",
    reason: "already",
    error: UPGRADE_ALREADY_AR,
  });
});

test("upgradeDecision: a same-tier row with an end is a renewal (stacked), never a credit", () => {
  assert.deepEqual(decide([row()], [order()], START + 10 * DAY_MS, "corp"), { kind: "none" });
});

test("upgradeDecision: no credit without a live PAID plan order of this user", () => {
  const now = START + DAY_MS;
  for (const o of [
    order({ status: "refunded" }),
    order({ status: "voided" }),
    order({ status: "initiated" }),
    order({ live: false }),
    order({ live: null }),
    order({ user_id: "someone-else" }),
    order({ kind: "membership" }),
    order({ item_id: "lawyer-founder-2026" }),
    order({ metadata: { already_entitled: true } }),
    order({ net_halalas: 0 }),
  ]) {
    assert.deepEqual(decide([row()], [o], now), { kind: "none" }, JSON.stringify(o));
    assert.equal(orderCreditable(o, USER), false);
  }
  // an admin grant / trial: no order id at all
  assert.deepEqual(decide([row({ metadata: {} })], [order()], now), { kind: "none" });
  // the founder plan id on the row itself
  assert.deepEqual(decide([row({ plan_id: "lawyer-founder-2026" })], [order()], now), { kind: "none" });
});

test("upgradeDecision: several lower rows are summed (a stacked future row in full) and keyed by sorted ids", () => {
  const now = START + 182.5 * DAY_MS;
  const stacked = row({
    id: "sub-0",
    current_period_start: new Date(END).toISOString(),
    current_period_end: new Date(END + 365 * DAY_MS).toISOString(),
    metadata: { order_id: "ord-2" },
  });
  const d = decide([row(), stacked], [order(), order({ id: "ord-2", net_halalas: 841500 })], now);
  assert.ok(d.kind === "credit");
  if (d.kind !== "credit") return;
  assert.equal(d.creditHalalas, 496356 + 841500);
  assert.equal(d.key, "sub-0,sub-1");
  const meta = prorationMetadata(d, 1490000);
  assert.equal(meta.credit_halalas, 1337856);
  assert.equal(meta.from.length, 2);
});

test("netAfterCredit: less than 1 SAR left is refused (null), never a zero charge", () => {
  assert.equal(netAfterCredit(299000, 299000), null);
  assert.equal(netAfterCredit(299000, 298901), null);
  assert.equal(netAfterCredit(299000, 298900), MIN_CHARGE_HALALAS);
  assert.equal(netAfterCredit(299000, 0), 299000);
});

test("readUpgrade: reads the user's active rows and only the orders behind them; a read error is null (503)", async () => {
  const now = START + 182.5 * DAY_MS;
  const { client, log } = fakeDb((q) => {
    if (q.table === "subscriptions") return { data: [row()] };
    if (q.table === "payment_orders") return { data: [order()] };
    return undefined;
  });
  const d = await readUpgrade(client, { userId: USER, tier: "enterprise", now: new Date(now), ranks: RANKS });
  assert.ok(d && d.kind === "credit" && d.creditHalalas === 496356);
  const subs = log.find((q) => q.table === "subscriptions");
  assert.ok(subs?.filters.some(([op, c, v]) => op === "eq" && c === "user_id" && v === USER));
  const po = log.find((q) => q.table === "payment_orders");
  assert.ok(po?.filters.some(([op, c, v]) => op === "in" && c === "id" && JSON.stringify(v) === '["ord-1"]'));
  assert.ok(po?.filters.some(([op, c, v]) => op === "eq" && c === "user_id" && v === USER));

  const broken = fakeDb((q) => (q.table === "subscriptions" ? { error: { code: "XX000" } } : undefined));
  assert.equal(await readUpgrade(broken.client, { userId: USER, tier: "enterprise", now: new Date(now), ranks: RANKS }), null);

  const none = fakeDb(() => undefined);
  assert.deepEqual(await readUpgrade(none.client, { userId: USER, tier: "enterprise", now: new Date(now), ranks: RANKS }), { kind: "none" });
  assert.equal(none.log.filter((q) => q.table === "payment_orders").length, 0, "no rows → no order read");
});
