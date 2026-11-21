/**
 * checkoutL6Pay.test.ts — batch l6-pay through startCheckoutWith: the Q511
 * upgrade credit and downgrade refusal (3a / 3d), the F12 founder top-up
 * discount (3c), the limited-coupon reservation (5c) — and that the founder
 * membership checkout reads none of it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { fakeDb, has, RANKS, type FakeHandler, type FakeQuery } from "./fakeDb.test-helper.ts";
import { startCheckoutWith, type CheckoutDeps, type CheckoutInput } from "./checkoutCore.ts";
import { createCouponAttemptBudget } from "./couponAttempts.ts";
import { COUPON_INVALID_AR, COUPONS_UNAVAILABLE_AR } from "./couponRules.ts";
import { validateCouponWith } from "./couponServer.ts";
import {
  UPGRADE_CREDIT_TOO_BIG_AR,
  UPGRADE_DOWNGRADE_AR,
  UPGRADE_FAILED_AR,
  UPGRADE_NO_COUPON_AR,
  UPGRADE_PENDING_AR,
} from "./upgradeProration.ts";
import { FOUNDER_DISCOUNT_FAILED_AR } from "./founderDiscount.ts";
import { FOUNDER_TERMS_VERSION } from "../founder/founderTerms.ts";
import { buildCatalog } from "./catalog.ts";
import { PRICE_BOOK, type BookEntry } from "../pricing/priceBook.ts";

const NOW = new Date("2026-10-22T08:00:00.000Z");
const USER = "00000000-0000-0000-0000-00000000u001";
const NEW_ORDER = "00000000-0000-0000-0000-0000000b0001";
const COUPON_ID = "00000000-0000-0000-0000-0000000c0050";

function moyasar() {
  const intents: Array<{ amountHalalas: number }> = [];
  const client = {
    async listPaymentsByOrder() {
      return { ok: true as const, data: [] };
    },
    async createIntent(i: { amountHalalas: number }) {
      intents.push(i);
      return { ok: true as const, data: { id: "pi_new", clientSecret: "cs", expiresAt: null } };
    },
    async cancelIntent(id: string) {
      return { ok: true as const, data: { id, status: "canceled" } };
    },
  } as unknown as CheckoutDeps["client"];
  return { client, intents };
}

// firm-basic quarterly (2,990 SAR) paid on 1 Oct, ends 1 Jan (92 days)
const HELD = {
  id: "sub-basic",
  plan_id: "firm-basic",
  tier: "corp",
  status: "active",
  started_at: "2026-10-01T00:00:00.000Z",
  current_period_start: "2026-10-01T00:00:00.000Z",
  current_period_end: "2027-01-01T00:00:00.000Z",
  metadata: { order_id: "ord-basic" },
};
const HELD_ORDER = {
  id: "ord-basic",
  user_id: USER,
  kind: "plan",
  item_id: "firm-basic",
  status: "paid",
  live: true,
  net_halalas: 299000,
  metadata: {},
};

function db(
  userType: string,
  opts: {
    subs?: unknown[];
    subsErr?: boolean;
    orders?: unknown[];
    founder?: boolean | "error";
    coupon?: Record<string, unknown>;
    reserve?: string | { code: string };
    insertErr?: { code: string; message: string };
  } = {},
  over?: FakeHandler,
) {
  return fakeDb((q) => {
    const r = over?.(q);
    if (r) return r;
    if (q.table === "profiles") return { data: { user_type: userType } };
    if (q.table === "subscriptions") return opts.subsErr ? { error: { code: "XX000" } } : { data: opts.subs ?? [] };
    if (q.table === "founder_seats") {
      if (opts.founder === "error") return { error: { code: "XX000" } };
      // l8: the discount runs for the membership year from activated_at (NOW is inside it)
      return { data: opts.founder ? [{ id: "seat", activated_at: "2026-10-01T00:00:00.000Z" }] : [] };
    }
    if (q.table === "coupons") return { data: opts.coupon ?? null };
    if (q.table === "coupon_usage") return { data: [] };
    if (q.table === "coupon_reserve") {
      if (typeof opts.reserve === "object") return { error: opts.reserve };
      return { data: opts.reserve ?? "reserved" };
    }
    if (q.table === "payment_orders" && q.op === "select" && has(q, "in", "id")) return { data: opts.orders ?? [] };
    if (q.table === "payment_orders" && q.op === "select") return { data: [] };
    if (q.table === "payment_orders" && q.op === "insert") return opts.insertErr ? { error: opts.insertErr } : { data: { id: NEW_ORDER } };
    if (q.table === "payment_orders" && q.op === "update") return { data: [{ id: NEW_ORDER }] };
    return { data: null };
  });
}

const input = (over: Partial<CheckoutInput> = {}): CheckoutInput => ({
  user: { id: USER, email: "buyer@example.test" },
  itemId: "firm-enterprise",
  billing: "quarterly",
  origin: "https://nezamy.sa",
  publishableKey: "pk_test_x",
  ...over,
});

const inserted = (log: FakeQuery[]) => log.find((q) => q.table === "payment_orders" && q.op === "insert");
const cancelled = (log: FakeQuery[]) =>
  log.filter((q) => q.table === "payment_orders" && q.op === "update" && (q.payload as { status?: string }).status === "cancelled");

// ── Q511 ────────────────────────────────────────────────────────────────────

test("Q511: firm-basic → firm-enterprise mid-quarter: the server credits 71/92 of what was paid, VAT on the rest", async () => {
  const { client: admin, log } = db("firm", { subs: [HELD], orders: [HELD_ORDER] });
  const m = moyasar();
  const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW, ranks: RANKS }, input());
  assert.equal(r.status, 200);
  if (r.status !== 200) return;
  // 1 Jan − 22 Oct 08:00 = 70 d 16 h → 71 days; 299000 × 71 / 92 = 230750
  assert.deepEqual(r.body.quote, {
    net: 218250,
    vat: 32738,
    total: 250988,
    vatMode: "exclusive",
    listNet: 449000,
    prorationCredit: 230750,
  });
  assert.equal(m.intents[0].amountHalalas, 250988);
  const ins = inserted(log)!;
  const p = ins.payload as { net_halalas: number; total_halalas: number; metadata: Record<string, unknown> };
  assert.equal(p.net_halalas, 218250);
  assert.equal(p.total_halalas, 250988);
  assert.deepEqual(p.metadata.proration, {
    credit_halalas: 230750,
    list_net_halalas: 449000,
    key: "sub-basic",
    from: [
      { subscription_id: "sub-basic", order_id: "ord-basic", paid_net_halalas: 299000, period_days: 92, remaining_days: 71, credit_halalas: 230750 },
    ],
  });
});

test("Q511: a downgrade is refused 409 before any order or intent", async () => {
  const held = { ...HELD, tier: "enterprise", plan_id: "firm-enterprise" };
  const { client: admin, log } = db("firm", { subs: [held], orders: [HELD_ORDER] });
  const m = moyasar();
  const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW, ranks: RANKS }, input({ itemId: "firm-basic" }));
  assert.deepEqual(r, { status: 409, body: { error: UPGRADE_DOWNGRADE_AR } });
  assert.equal(inserted(log), undefined);
  assert.equal(m.intents.length, 0);
});

test("Q511: a coupon is never combined with the credit — 400, nothing written, no try spent", async () => {
  const { client: admin, log } = db("firm", { subs: [HELD], orders: [HELD_ORDER] });
  const attempts = createCouponAttemptBudget();
  const r = await startCheckoutWith(
    { admin, client: moyasar().client, now: () => NOW, ranks: RANKS, attempts },
    input({ couponCode: "PLAN50" }),
  );
  assert.deepEqual(r, { status: 400, body: { error: UPGRADE_NO_COUPON_AR } });
  assert.equal(inserted(log), undefined);
  assert.equal(log.some((q) => q.table === "coupons"), false);
});

test("Q511: a credit leaving less than 1 SAR is refused 409 (choose a longer cycle)", async () => {
  // a paid yearly basic (9,900) bought today, upgrading to the quarterly enterprise (4,490)
  const held = { ...HELD, current_period_start: NOW.toISOString(), current_period_end: "2027-10-22T08:00:00.000Z" };
  const order = { ...HELD_ORDER, net_halalas: 990000 };
  const { client: admin, log } = db("firm", { subs: [held], orders: [order] });
  const r = await startCheckoutWith({ admin, client: moyasar().client, now: () => NOW, ranks: RANKS }, input());
  assert.deepEqual(r, { status: 409, body: { error: UPGRADE_CREDIT_TOO_BIG_AR } });
  assert.equal(inserted(log), undefined);
});

test("Q511: no paid order behind the held plan (admin grant / test mode) → the full price, no credit", async () => {
  for (const order of [null, { ...HELD_ORDER, live: false }, { ...HELD_ORDER, status: "refunded" }]) {
    const { client: admin, log } = db("firm", { subs: [HELD], orders: order ? [order] : [] });
    const r = await startCheckoutWith({ admin, client: moyasar().client, now: () => NOW, ranks: RANKS }, input());
    assert.equal(r.status, 200);
    if (r.status !== 200) continue;
    assert.deepEqual(r.body.quote, { net: 449000, vat: 67350, total: 516350, vatMode: "exclusive" });
    assert.equal("proration" in (inserted(log)!.payload as { metadata: Record<string, unknown> }).metadata, false);
  }
});

test("Q511: a failed read of the held plans is 503; a second prorated order of the same plans is 409", async () => {
  const broken = db("firm", { subsErr: true });
  const r1 = await startCheckoutWith({ admin: broken.client, client: moyasar().client, now: () => NOW, ranks: RANKS }, input());
  assert.deepEqual(r1, { status: 503, body: { error: UPGRADE_FAILED_AR } });

  const dup = db("firm", {
    subs: [HELD],
    orders: [HELD_ORDER],
    insertErr: { code: "23505", message: 'duplicate key value violates unique constraint "payment_orders_proration_once_key"' },
  });
  const r2 = await startCheckoutWith({ admin: dup.client, client: moyasar().client, now: () => NOW, ranks: RANKS }, input());
  assert.deepEqual(r2, { status: 409, body: { error: UPGRADE_PENDING_AR } });
});

test("Q511: without deps.ranks nothing is read (the old behaviour); a library pass or a top-up never reads plans", async () => {
  const a = db("firm", { subs: [HELD], orders: [HELD_ORDER] });
  const r = await startCheckoutWith({ admin: a.client, client: moyasar().client, now: () => NOW }, input());
  assert.equal(r.status, 200);
  assert.equal(a.log.some((q) => q.table === "subscriptions"), false);
  for (const itemId of ["lib-q1", "topup-500"]) {
    const b = db("lawyer", { subs: [HELD], orders: [HELD_ORDER] });
    await startCheckoutWith({ admin: b.client, client: moyasar().client, now: () => NOW, ranks: RANKS }, input({ itemId, billing: "once" }));
    assert.equal(b.log.some((q) => q.table === "subscriptions"), false, itemId);
  }
});

test("Q511: the coupon preview refuses exactly as checkout does (credit → no coupon; downgrade → refused)", async () => {
  const a = db("firm", { subs: [HELD], orders: [HELD_ORDER] });
  const r = await validateCouponWith(
    { admin: a.client, now: () => NOW, ranks: RANKS, attempts: createCouponAttemptBudget() },
    { userId: USER, code: "PLAN50", itemId: "firm-enterprise", billing: "quarterly" },
  );
  assert.deepEqual(r, { status: 400, body: { error: UPGRADE_NO_COUPON_AR } });
  const b = db("firm", { subs: [{ ...HELD, tier: "enterprise" }], orders: [HELD_ORDER] });
  const r2 = await validateCouponWith(
    { admin: b.client, now: () => NOW, ranks: RANKS, attempts: createCouponAttemptBudget() },
    { userId: USER, code: "PLAN50", itemId: "firm-basic", billing: "quarterly" },
  );
  assert.deepEqual(r2, { status: 400, body: { error: UPGRADE_DOWNGRADE_AR } });
});

// ── F12 ─────────────────────────────────────────────────────────────────────

test("F12: an active founder pays 15 % less for a top-up — 500 SAR → 425 + VAT = 488.75; the points are unchanged", async () => {
  const { client: admin, log } = db("lawyer", { founder: true });
  const m = moyasar();
  const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW, ranks: RANKS }, input({ itemId: "topup-500", billing: "once" }));
  assert.equal(r.status, 200);
  if (r.status !== 200) return;
  // l12 (Q88a): the quote also names the points the order froze (no bonus by default)
  assert.deepEqual(r.body.quote, { net: 42500, vat: 6375, total: 48875, vatMode: "exclusive", listNet: 50000, founderDiscount: 7500, topupPoints: 500, bonusPoints: 0 });
  assert.equal(m.intents[0].amountHalalas, 48875);
  const p = inserted(log)!.payload as { item_id: string; metadata: Record<string, unknown> };
  assert.equal(p.item_id, "topup-500");
  assert.deepEqual(p.metadata.founder_discount, { pct: 15, discount_halalas: 7500, list_net_halalas: 50000 });
  assert.deepEqual(p.metadata.topup, { base_points: 500, bonus_pct: 0, bonus_points: 0, points: 500 });
});

// ── l12 (owner Q88a / ١٥٢): the admin bonus, frozen in the order; founder discount vs bonus ──

const settingKey = (q: { filters: unknown[] }) =>
  (q.filters as Array<[string, string, unknown]>).find(([op, col]) => op === "eq" && col === "key")?.[2];
const withSettings = (values: Record<string, unknown>): FakeHandler => (q) =>
  q.table === "platform_settings" && typeof settingKey(q) === "string" && Object.hasOwn(values, settingKey(q) as string)
    ? { data: { value: values[settingKey(q) as string] } }
    : undefined;

test("l12 (Q88a): a bonus set by the admin is frozen in the order and named in the quote; a non-founder pays the list price", async () => {
  const a = db("lawyer", { founder: false }, withSettings({ topup_bonus_pct: { "topup-500": 8 } }));
  const r = await startCheckoutWith({ admin: a.client, client: moyasar().client, now: () => NOW }, input({ itemId: "topup-500", billing: "once" }));
  assert.equal(r.status, 200);
  if (r.status === 200) assert.deepEqual(r.body.quote, { net: 50000, vat: 7500, total: 57500, vatMode: "exclusive", topupPoints: 540, bonusPoints: 40 });
  const meta = (inserted(a.log)!.payload as { metadata: Record<string, unknown> }).metadata;
  assert.deepEqual(meta.topup, { base_points: 500, bonus_pct: 8, bonus_points: 40, points: 540 });
});

test("١٥٢ higher_only (default): a founder gets the LARGER of the 15 % discount and the bonus, never both", async () => {
  // 20 % of 500 = 100 points = 100 SAR > the 75 SAR discount → the bonus, list price
  const big = db("lawyer", { founder: true }, withSettings({ topup_bonus_pct: { "topup-500": 20 } }));
  const r1 = await startCheckoutWith({ admin: big.client, client: moyasar().client, now: () => NOW, ranks: RANKS }, input({ itemId: "topup-500", billing: "once" }));
  assert.equal(r1.status, 200);
  if (r1.status === 200) assert.deepEqual(r1.body.quote, { net: 50000, vat: 7500, total: 57500, vatMode: "exclusive", topupPoints: 600, bonusPoints: 100 });
  const m1 = (inserted(big.log)!.payload as { metadata: Record<string, unknown> }).metadata;
  assert.equal("founder_discount" in m1, false);
  assert.deepEqual(m1.topup, { base_points: 500, bonus_pct: 20, bonus_points: 100, points: 600 });

  // 10 % = 50 points = 50 SAR < 75 SAR → the discount, no bonus
  const small = db("lawyer", { founder: true }, withSettings({ topup_bonus_pct: { "topup-500": 10 } }));
  const r2 = await startCheckoutWith({ admin: small.client, client: moyasar().client, now: () => NOW, ranks: RANKS }, input({ itemId: "topup-500", billing: "once" }));
  if (r2.status === 200) assert.deepEqual(r2.body.quote, { net: 42500, vat: 6375, total: 48875, vatMode: "exclusive", listNet: 50000, founderDiscount: 7500, topupPoints: 500, bonusPoints: 0 });
  const m2 = (inserted(small.log)!.payload as { metadata: Record<string, unknown> }).metadata;
  assert.deepEqual(m2.topup, { base_points: 500, bonus_pct: 0, bonus_points: 0, points: 500 });

  // 15 % = 75 points = 75 SAR = the discount → a tie keeps the discount
  const tie = db("lawyer", { founder: true }, withSettings({ topup_bonus_pct: { "topup-500": 15 } }));
  const r3 = await startCheckoutWith({ admin: tie.client, client: moyasar().client, now: () => NOW, ranks: RANKS }, input({ itemId: "topup-500", billing: "once" }));
  if (r3.status === 200) assert.equal(r3.body.quote.founderDiscount, 7500);
  if (r3.status === 200) assert.equal(r3.body.quote.bonusPoints, 0);
});

test("١٥٢ both: with founder_bonus_rule {mode: both} a founder keeps the discount AND the bonus", async () => {
  const a = db("lawyer", { founder: true }, withSettings({ topup_bonus_pct: { "topup-500": 10 }, founder_bonus_rule: { mode: "both" } }));
  const r = await startCheckoutWith({ admin: a.client, client: moyasar().client, now: () => NOW, ranks: RANKS }, input({ itemId: "topup-500", billing: "once" }));
  assert.equal(r.status, 200);
  if (r.status === 200) assert.deepEqual(r.body.quote, { net: 42500, vat: 6375, total: 48875, vatMode: "exclusive", listNet: 50000, founderDiscount: 7500, topupPoints: 550, bonusPoints: 50 });
});

test("F12: a non-founder pays the list price; a failed founder read is 503, never the full price to a founder", async () => {
  const a = db("lawyer", { founder: false });
  const r = await startCheckoutWith({ admin: a.client, client: moyasar().client, now: () => NOW }, input({ itemId: "topup-500", billing: "once" }));
  assert.equal(r.status, 200);
  if (r.status === 200) assert.deepEqual(r.body.quote, { net: 50000, vat: 7500, total: 57500, vatMode: "exclusive", topupPoints: 500, bonusPoints: 0 });
  assert.equal("founder_discount" in (inserted(a.log)!.payload as { metadata: Record<string, unknown> }).metadata, false);

  const b = db("lawyer", { founder: "error" });
  const r2 = await startCheckoutWith({ admin: b.client, client: moyasar().client, now: () => NOW }, input({ itemId: "topup-500", billing: "once" }));
  assert.deepEqual(r2, { status: 503, body: { error: FOUNDER_DISCOUNT_FAILED_AR } });
  assert.equal(inserted(b.log), undefined);
});

test("l8 (owner 18 Nov, ك): the founder discount ends with the membership year — a seat activated 13 months ago pays the list price", async () => {
  const old = db("lawyer", { founder: true }, (q) =>
    q.table === "founder_seats" ? { data: [{ id: "seat", activated_at: "2025-09-22T08:00:00.000Z" }] } : undefined,
  );
  const r = await startCheckoutWith({ admin: old.client, client: moyasar().client, now: () => NOW }, input({ itemId: "topup-500", billing: "once" }));
  assert.equal(r.status, 200);
  assert.equal("founder_discount" in (inserted(old.log)!.payload as { metadata: Record<string, unknown> }).metadata, false);
});

test("l9 (register 14 items 29 / 32): an active founder pays 15 % less for a plan and a library pass too", async () => {
  const cases: Array<[string, "yearly" | "once", number, number]> = [
    // item, billing, list net, discount (15 %)
    ["lawyer-pro", "yearly", 399000, 59850],
    ["lib-q1", "once", 199000, 29850],
    ["lib-annual", "once", 699000, 104850],
  ];
  for (const [itemId, billing, listNet, discount] of cases) {
    const a = db("lawyer", { founder: true });
    const m = moyasar();
    const r = await startCheckoutWith({ admin: a.client, client: m.client, now: () => NOW }, input({ itemId, billing }));
    assert.equal(r.status, 200, itemId);
    if (r.status !== 200) continue;
    const net = listNet - discount;
    const vat = Math.round(net * 0.15);
    assert.deepEqual(r.body.quote, { net, vat, total: net + vat, vatMode: "exclusive", listNet, founderDiscount: discount }, itemId);
    assert.equal(m.intents[0].amountHalalas, net + vat, itemId);
    assert.deepEqual(
      (inserted(a.log)!.payload as { metadata: Record<string, unknown> }).metadata.founder_discount,
      { pct: 15, discount_halalas: discount, list_net_halalas: listNet },
      itemId,
    );
  }
});

test("l9: a non-founder, or a seat past its membership year, pays the list price for a plan", async () => {
  const a = db("lawyer", { founder: false });
  const r = await startCheckoutWith({ admin: a.client, client: moyasar().client, now: () => NOW }, input({ itemId: "lib-q1", billing: "once" }));
  assert.equal(r.status, 200);
  if (r.status === 200) assert.deepEqual(r.body.quote, { net: 199000, vat: 29850, total: 228850, vatMode: "exclusive" });
  const old = db("lawyer", { founder: true }, (q) =>
    q.table === "founder_seats" ? { data: [{ id: "seat", activated_at: "2025-09-22T08:00:00.000Z" }] } : undefined,
  );
  const r2 = await startCheckoutWith({ admin: old.client, client: moyasar().client, now: () => NOW }, input({ itemId: "lawyer-pro", billing: "yearly" }));
  assert.equal(r2.status, 200);
  assert.equal("founder_discount" in (inserted(old.log)!.payload as { metadata: Record<string, unknown> }).metadata, false);
});

test("l9: never combined — a smaller coupon is dropped for the founder discount; a larger one replaces it", async () => {
  // LIMITED10 = 50 SAR off lib-q1 (1,990); the founder's 15 % = 298.50 is larger → founder only
  const a = db("lawyer", { founder: true, coupon: LIMITED, reserve: "reserved" });
  const r = await startCheckoutWith({ admin: a.client, client: moyasar().client, now: () => NOW }, input({ itemId: "lib-q1", billing: "once", couponCode: "LIMITED10" }));
  assert.equal(r.status, 200);
  const meta = (inserted(a.log)!.payload as { metadata: Record<string, unknown> }).metadata;
  assert.deepEqual(meta.founder_discount, { pct: 15, discount_halalas: 29850, list_net_halalas: 199000 });
  assert.equal("coupon" in meta, false, "the smaller coupon is not used");
  assert.equal(a.log.some((q) => q.table === "coupon_reserve"), false, "nor reserved");
  // a 400 SAR coupon beats the founder's 298.50 → the coupon only
  const b = db("lawyer", { founder: true, coupon: { ...LIMITED, discount_value: "400.00" }, reserve: "reserved" });
  const r2 = await startCheckoutWith({ admin: b.client, client: moyasar().client, now: () => NOW }, input({ itemId: "lib-q1", billing: "once", couponCode: "LIMITED10" }));
  assert.equal(r2.status, 200);
  const meta2 = (inserted(b.log)!.payload as { metadata: Record<string, unknown> }).metadata;
  assert.equal("founder_discount" in meta2, false);
  assert.equal((meta2.coupon as { discount_halalas: number }).discount_halalas, 40000);
});

test("l9: a launch price and the founder discount are never stacked — the larger saving wins", async () => {
  const LAUNCH_NOW = new Date("2026-11-20T08:00:00.000Z"); // inside launch-2026 (25 Oct 2026 – 25 Jan 2027)
  const catalogWith = (launchSar: number) =>
    buildCatalog({
      ...PRICE_BOOK,
      "lib-q1": { ...PRICE_BOOK["lib-q1"], launchPrices: [{ campaignId: "launch-2026", prices: { once: launchSar } }] } as BookEntry,
    });
  // launch 1,900 saves 90 < the founder's 298.50 → the founder discount off the listed 1,990, no launch on the order
  const a = db("lawyer", { founder: true });
  const r = await startCheckoutWith(
    { admin: a.client, client: moyasar().client, now: () => LAUNCH_NOW, catalog: catalogWith(1900) },
    input({ itemId: "lib-q1", billing: "once" }),
  );
  assert.equal(r.status, 200);
  if (r.status === 200) assert.deepEqual(r.body.quote, { net: 169150, vat: 25373, total: 194523, vatMode: "exclusive", listNet: 199000, founderDiscount: 29850 });
  assert.equal("launch" in (inserted(a.log)!.payload as { metadata: Record<string, unknown> }).metadata, false);
  // launch 1,500 saves 490 > 298.50 → the launch price alone
  const b = db("lawyer", { founder: true });
  const r2 = await startCheckoutWith(
    { admin: b.client, client: moyasar().client, now: () => LAUNCH_NOW, catalog: catalogWith(1500) },
    input({ itemId: "lib-q1", billing: "once" }),
  );
  assert.equal(r2.status, 200);
  if (r2.status === 200) assert.equal(r2.body.quote.net, 150000);
  const meta2 = (inserted(b.log)!.payload as { metadata: Record<string, unknown> }).metadata;
  assert.equal("founder_discount" in meta2, false);
  assert.ok("launch" in meta2);
});

test("l9: the upgrade credit is not a discount — it comes off after the founder discount", async () => {
  // the Q511 fixture (firm-basic → firm-enterprise mid-quarter) for a buyer who also holds an active founder seat
  const { client: admin } = db("firm", { founder: true, subs: [HELD], orders: [HELD_ORDER] });
  const r = await startCheckoutWith({ admin, client: moyasar().client, now: () => NOW, ranks: RANKS }, input());
  assert.equal(r.status, 200);
  if (r.status !== 200) return;
  // 4,490 − 15 % (673.50) = 3,816.50, then − the 2,307.50 credit
  assert.equal(r.body.quote.founderDiscount, 67350);
  assert.equal(r.body.quote.prorationCredit, 230750);
  assert.equal(r.body.quote.net, 449000 - 67350 - 230750);
});

// ── founder membership untouched ───────────────────────────────────────────

test("founder membership: no plan read, no founder-discount read, no coupon reservation — same order as before", async () => {
  const { client: admin, log } = db("lawyer", { founder: true, subs: [HELD], orders: [HELD_ORDER] });
  const m = moyasar();
  const r = await startCheckoutWith(
    {
      admin,
      client: m.client,
      now: () => NOW,
      ranks: RANKS,
      onSale: true,
      reserveFounderSeat: async () => "reserved",
    },
    input({ itemId: "lawyer-founder-2026", billing: "once", founderConsent: { accepted: true, version: FOUNDER_TERMS_VERSION } }),
  );
  assert.equal(r.status, 200);
  if (r.status === 200) assert.deepEqual(r.body.quote, { net: 299600, vat: 44940, total: 344540, vatMode: "exclusive" });
  for (const t of ["subscriptions", "founder_seats", "coupon_reserve", "coupons"]) {
    assert.equal(log.some((q) => q.table === t), false, t);
  }
  const meta = (inserted(log)!.payload as { metadata: Record<string, unknown> }).metadata;
  for (const k of ["proration", "founder_discount", "coupon"]) assert.equal(k in meta, false, k);
});

// ── coupon lock (5c) ───────────────────────────────────────────────────────

const LIMITED = {
  id: COUPON_ID,
  code: "LIMITED10",
  discount_type: "fixed",
  discount_value: "50.00",
  min_order_amount: "200.00",
  eligible_user_types: [],
  max_uses: 10,
  used_count: 3,
  valid_from: "2026-06-01T00:00:00Z",
  valid_until: "2027-12-31T23:59:59Z",
  active: true,
  max_discount_pct: "25.00",
  excluded_kinds: ["topup"],
};

test("coupon lock: a limited code is reserved for the order after the insert and before the intent", async () => {
  const { client: admin, log } = db("lawyer", { coupon: LIMITED, reserve: "reserved" });
  const m = moyasar();
  const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input({ itemId: "lib-q1", billing: "once", couponCode: "LIMITED10" }));
  assert.equal(r.status, 200);
  const rpc = log.find((q) => q.table === "coupon_reserve");
  assert.ok(rpc);
  assert.deepEqual(rpc.payload, { p_coupon: COUPON_ID, p_order: NEW_ORDER, p_user: USER });
  assert.ok(log.indexOf(inserted(log)!) < log.indexOf(rpc));
  assert.equal(m.intents.length, 1);
});

test("coupon lock: exhausted → the generic 400, the order cancelled, no intent; an RPC error or a missing function → 503", async () => {
  const cases: Array<[string | { code: string }, number, string]> = [
    ["exhausted", 400, COUPON_INVALID_AR],
    [{ code: "PGRST202" }, 503, COUPONS_UNAVAILABLE_AR],
    [{ code: "XX000" }, 503, COUPONS_UNAVAILABLE_AR],
    ["something", 503, COUPONS_UNAVAILABLE_AR],
  ];
  for (const [reserve, status, error] of cases) {
    const { client: admin, log } = db("lawyer", { coupon: LIMITED, reserve });
    const m = moyasar();
    const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input({ itemId: "lib-q1", billing: "once", couponCode: "LIMITED10" }));
    assert.deepEqual(r, { status, body: { error } }, JSON.stringify(reserve));
    assert.equal(cancelled(log).length, 1);
    assert.equal(m.intents.length, 0);
  }
});

test("coupon lock: an unlimited code (max_uses null / 0) never calls coupon_reserve", async () => {
  for (const max_uses of [null, 0]) {
    const { client: admin, log } = db("lawyer", { coupon: { ...LIMITED, max_uses } });
    const r = await startCheckoutWith({ admin, client: moyasar().client, now: () => NOW }, input({ itemId: "lib-q1", billing: "once", couponCode: "LIMITED10" }));
    assert.equal(r.status, 200);
    assert.equal(log.some((q) => q.table === "coupon_reserve"), false);
  }
});

// ── Q511: an abandoned upgrade attempt never locks the upgrade for good ─────

const CONFLICT = { code: "23505", message: 'duplicate key value violates unique constraint "payment_orders_proration_once_key"' };

function staleDb(opts: { openRows: unknown[]; openErr?: boolean }) {
  let inserts = 0;
  const h = db("firm", { subs: [HELD], orders: [HELD_ORDER] }, (q) => {
    if (q.table === "payment_orders" && q.op === "insert") {
      inserts++;
      return inserts === 1 ? { error: CONFLICT } : { data: { id: NEW_ORDER } };
    }
    if (q.table === "payment_orders" && q.op === "select" && has(q, "eq", "metadata->proration->>key")) {
      return opts.openErr ? { error: { code: "XX000" } } : { data: opts.openRows };
    }
    return undefined;
  });
  return { ...h, inserts: () => inserts };
}

function listing(statuses: string[] | false) {
  const m = moyasar();
  const listed: string[] = [];
  (m.client as unknown as { listPaymentsByOrder: (id: string) => Promise<unknown> }).listPaymentsByOrder = async (id: string) => {
    listed.push(id);
    return statuses === false
      ? { ok: false as const, status: 502, type: "network", message: "x" }
      : { ok: true as const, data: statuses.map((status, i) => ({ id: `p${i}`, status })) };
  };
  return { ...m, listed };
}

const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const openUpgrade = (over: Record<string, unknown> = {}) => ({
  id: "ord-abandoned",
  item_id: "firm-enterprise",
  status: "initiated",
  created_at: hoursAgo(26),
  moyasar_intent_id: "pi_old",
  moyasar_payment_id: null,
  ...over,
});

test("Q511: an expired upgrade order no payment reached is closed and the new checkout goes on", async () => {
  const h = staleDb({ openRows: [openUpgrade()] });
  const m = listing(["failed"]);
  const r = await startCheckoutWith({ admin: h.client, client: m.client, now: () => NOW, ranks: RANKS }, input());
  assert.equal(r.status, 200);
  assert.deepEqual(m.listed, ["ord-abandoned"]);
  const close = h.log.find(
    (q) => q.table === "payment_orders" && q.op === "update" && has(q, "eq", "id", "ord-abandoned") && (q.payload as { status?: string }).status === "cancelled",
  );
  assert.ok(close, "the abandoned order is closed");
  assert.equal(h.inserts(), 2, "the insert is tried once more");
});

test("Q511: a FRESH open upgrade order, or one a payment reached, still answers 409 — nothing closed", async () => {
  for (const row of [openUpgrade({ created_at: hoursAgo(0.2) }), openUpgrade({ moyasar_payment_id: "pay_3ds", created_at: hoursAgo(5) })]) {
    const h = staleDb({ openRows: [row] });
    const m = listing([]);
    const r = await startCheckoutWith({ admin: h.client, client: m.client, now: () => NOW, ranks: RANKS }, input());
    assert.deepEqual(r, { status: 409, body: { error: UPGRADE_PENDING_AR } });
    assert.equal(cancelled(h.log).length, 0);
    assert.equal(h.inserts(), 1);
  }
  // a stale order Moyasar lists a PAID payment for is kept too
  const h = staleDb({ openRows: [openUpgrade()] });
  const r = await startCheckoutWith({ admin: h.client, client: listing(["paid"]).client, now: () => NOW, ranks: RANKS }, input());
  assert.deepEqual(r, { status: 409, body: { error: UPGRADE_PENDING_AR } });
  assert.equal(cancelled(h.log).length, 0);
});

test("Q511: a failed Moyasar listing or a failed read is 503 — never a guess", async () => {
  const a = staleDb({ openRows: [openUpgrade()] });
  const r1 = await startCheckoutWith({ admin: a.client, client: listing(false).client, now: () => NOW, ranks: RANKS }, input());
  assert.equal(r1.status, 503);
  assert.equal(cancelled(a.log).length, 0);
  const b = staleDb({ openRows: [], openErr: true });
  const r2 = await startCheckoutWith({ admin: b.client, client: listing([]).client, now: () => NOW, ranks: RANKS }, input());
  assert.equal(r2.status, 503);
});
