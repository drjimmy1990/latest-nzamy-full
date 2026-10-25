/**
 * couponServer.test.ts — the database half of coupons (P7): the ledger row
 * fulfilment writes only for a PAID order (idempotent, never blocking the
 * grant), the preview behind POST /api/v1/coupons/validate (same numbers as
 * the charge), the availability probe, and a couponed order's refund (the
 * PAID total, nothing else).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { fakeDb, type FakeHandler, type FakeQuery } from "./fakeDb.test-helper.ts";
import { couponsAvailable, orderCoupon, recordCouponUsage, validateCouponWith } from "./couponServer.ts";
import { fulfillOrderWith, type FulfilDeps, type GatewayClient } from "./fulfillCore.ts";
import { refundOrderWith } from "./refundCore.ts";
import type { GrantLibraryFn } from "./grantPurchase.ts";
import type { MoyasarClient, MoyasarPayment } from "./moyasarClient.ts";
import { RANKS } from "./fakeDb.test-helper.ts";

const NOW = new Date("2026-10-26T08:00:00.000Z");
const USER = "00000000-0000-0000-0000-00000000u001";
const ORDER = "00000000-0000-0000-0000-0000000a0007";
const COUPON = "00000000-0000-0000-0000-0000000c0050";
const COUPON_META = { id: COUPON, code: "NZAMY50", discount_halalas: 5000, list_net_halalas: 149000 };

const ROW = {
  id: COUPON,
  code: "NZAMY50",
  discount_type: "fixed",
  discount_value: 50,
  min_order_amount: 200,
  eligible_user_types: [],
  max_uses: null,
  used_count: 0,
  valid_from: null,
  valid_until: null,
  active: true,
  max_discount_pct: 25,
  excluded_kinds: ["topup"],
};

const usageInserts = (log: FakeQuery[]) => log.filter((q) => q.table === "coupon_usage" && q.op === "insert");

// ── recordCouponUsage ───────────────────────────────────────────────────────

test("orderCoupon reads metadata.coupon; an order without one records nothing", async () => {
  assert.deepEqual(orderCoupon({ coupon: COUPON_META }), { id: COUPON, code: "NZAMY50", discountHalalas: 5000 });
  assert.equal(orderCoupon({ user_email: "x" }), null);
  assert.equal(orderCoupon(null), null);
  const { client, log } = fakeDb(() => ({}));
  assert.equal(await recordCouponUsage(client, { id: ORDER, user_id: USER, metadata: { user_email: "x" } }), "none");
  assert.equal(log.length, 0);
});

test("a paid couponed order writes one coupon_usage row (SAR amount); a retry for the same order is already_recorded", async () => {
  {
    const { client, log } = fakeDb(() => ({}));
    assert.equal(await recordCouponUsage(client, { id: ORDER, user_id: USER, metadata: { coupon: COUPON_META } }), "recorded");
    assert.deepEqual(usageInserts(log)[0].payload, { coupon_id: COUPON, user_id: USER, order_id: ORDER, discount_applied: 50 });
  }
  {
    const { client } = fakeDb((q) => {
      if (q.table === "coupon_usage" && q.op === "insert") return { error: { code: "23505", message: "coupon_usage_order_key" } };
      if (q.table === "coupon_usage" && q.op === "select") return { data: [{ id: 9 }] };
      return {};
    });
    assert.equal(await recordCouponUsage(client, { id: ORDER, user_id: USER, metadata: { coupon: COUPON_META } }), "already_recorded");
  }
});

test("a unique (coupon, user) conflict from ANOTHER order is 'reused'; any other failure is 'not_recorded' — neither throws", async () => {
  {
    const { client } = fakeDb((q) => {
      if (q.table === "coupon_usage" && q.op === "insert") return { error: { code: "23505", message: "coupon_usage_coupon_user_key" } };
      if (q.table === "coupon_usage" && q.op === "select") return { data: [] };
      return {};
    });
    assert.equal(await recordCouponUsage(client, { id: ORDER, user_id: USER, metadata: { coupon: COUPON_META } }), "reused");
  }
  {
    const { client } = fakeDb(() => ({ error: { code: "42P01", message: "relation coupon_usage does not exist" } }));
    assert.equal(await recordCouponUsage(client, { id: ORDER, user_id: USER, metadata: { coupon: COUPON_META } }), "not_recorded");
  }
});

// ── fulfilment ──────────────────────────────────────────────────────────────

function orderRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ORDER,
    user_id: USER,
    merchant: "platform",
    kind: "library",
    item_id: "lib-q1",
    billing: "once",
    total_halalas: 166750, // (1,500 − 50) + 15 % VAT
    currency: "SAR",
    status: "initiated",
    moyasar_payment_id: null,
    live: null,
    receipt_number: null,
    paid_at: null,
    fulfilled_at: null,
    failure_message: null,
    metadata: { user_email: "u@example.test", coupon: { ...COUPON_META, list_net_halalas: 150000 } },
    ...over,
  };
}

function paymentOf(over: Partial<MoyasarPayment> = {}): MoyasarPayment {
  return {
    id: "pay_7",
    status: "paid",
    amount: 166750,
    currency: "SAR",
    metadata: { order_id: ORDER },
    source: { type: "creditcard" },
    invoice_id: null,
    refunded: 0,
    captured: 166750,
    createdAt: "2026-10-26T07:59:00.000Z",
    ...over,
  };
}

function gateway(payment: MoyasarPayment): GatewayClient {
  return {
    mode: "test",
    fetchPayment: async () => ({ ok: true, data: payment }),
    fetchToken: async () => ({ ok: false, status: 404, type: "x", message: "x" }),
    listPaymentsByOrder: async () => ({ ok: true, data: [] }),
  } as unknown as GatewayClient;
}

function fulfilDb(over?: FakeHandler) {
  const order = orderRow();
  return fakeDb((q) => {
    const r = over?.(q);
    if (r) return r;
    if (q.table === "payment_orders" && q.op === "select") return { data: order };
    if (q.table === "claim_payment_order") {
      return { data: [{ ...order, status: "paid", moyasar_payment_id: "pay_7", receipt_number: "NZ-2026-000007", paid_at: NOW.toISOString() }] };
    }
    if (q.table === "payment_orders" && q.op === "update") return { data: [{ id: ORDER }] };
    return { data: null };
  });
}

function fulfilDeps(client: FulfilDeps["admin"], payment: MoyasarPayment): FulfilDeps {
  return {
    admin: client,
    gateway: async () => gateway(payment),
    grantLibrary: (async () => ({ ok: true, endsAt: NOW.toISOString() })) as GrantLibraryFn,
    ranks: RANKS,
    notify: async () => {},
    now: () => NOW,
  };
}

const INPUT = { orderId: ORDER, paymentId: "pay_7", merchant: "platform" as const };

test("fulfilment: the PAID couponed order is granted at the stored (discounted) total and records the coupon before the stamp", async () => {
  const { client, log } = fulfilDb();
  const r = await fulfillOrderWith(fulfilDeps(client, paymentOf()), INPUT);
  assert.equal(r.outcome, "granted");
  const ins = usageInserts(log);
  assert.equal(ins.length, 1);
  assert.deepEqual(ins[0].payload, { coupon_id: COUPON, user_id: USER, order_id: ORDER, discount_applied: 50 });
  const stamp = log.findIndex((q) => q.table === "payment_orders" && q.op === "update" && "fulfilled_at" in (q.payload as object));
  assert.ok(log.indexOf(ins[0]) < stamp, "recorded before fulfilled_at");
});

test("fulfilment: a FAILED payment records no coupon use (the coupon stays available)", async () => {
  const { client, log } = fulfilDb();
  const r = await fulfillOrderWith(fulfilDeps(client, paymentOf({ status: "failed", source: { type: "creditcard", message: "declined" } })), INPUT);
  assert.equal(r.outcome, "failed");
  assert.equal(usageInserts(log).length, 0);
});

test("fulfilment: a payment that does not match the stored total is rejected and records nothing (paid amount = stored total)", async () => {
  const { client, log } = fulfilDb();
  // the undiscounted total (1,725.00) does not settle a couponed order
  const r = await fulfillOrderWith(fulfilDeps(client, paymentOf({ amount: 172500, captured: 172500 })), INPUT);
  assert.equal(r.outcome, "rejected");
  assert.equal(usageInserts(log).length, 0);
  assert.equal(log.filter((q) => q.table === "claim_payment_order").length, 0);
});

test("fulfilment: a coupon paid twice by one buyer (two open checkouts) is still granted and marked coupon_reused", async () => {
  const { client, log } = fulfilDb((q) => {
    if (q.table === "coupon_usage" && q.op === "insert") return { error: { code: "23505", message: "coupon_usage_coupon_user_key" } };
    if (q.table === "coupon_usage" && q.op === "select") return { data: [] };
    return undefined;
  });
  const r = await fulfillOrderWith(fulfilDeps(client, paymentOf()), INPUT);
  assert.equal(r.outcome, "granted");
  const merge = log.find((q) => q.table === "merge_payment_order_metadata");
  assert.deepEqual(merge?.payload, { p_order: ORDER, p_patch: { coupon_reused: true } });
});

// ── refund ──────────────────────────────────────────────────────────────────

test("refund: a couponed order refunds exactly the PAID (discounted) total", async () => {
  const order = {
    id: "o",
    user_id: "u",
    merchant: "platform",
    kind: "library",
    status: "paid",
    total_halalas: 166750,
    paid_at: "2026-10-26T05:00:00Z",
    fulfilled_at: "2026-10-26T05:00:01Z",
    moyasar_payment_id: "p",
    live: false,
    metadata: { coupon: COUPON_META },
  };
  const paid: MoyasarPayment = { id: "p", status: "paid", amount: 166750, currency: "SAR", metadata: { order_id: "o" }, source: { type: "creditcard" }, invoice_id: null, refunded: 0, captured: 166750, createdAt: null };
  const refunds: number[] = [];
  const db = fakeDb((q) => {
    if (q.table === "payment_orders") return { data: order };
    if (q.table === "points_lots") return { data: [] };
    if (q.table === "claim_payment_refund") return { data: { token: "t", state: "processing", method: "refund", actor_id: "admin" } };
    if (q.table === "finish_payment_refund") return { data: { done: true, tier: "free" } };
    return {};
  });
  const r = await refundOrderWith(
    {
      admin: db.client,
      now: () => NOW,
      gateway: async (): Promise<Pick<MoyasarClient, "mode" | "fetchPayment" | "refund" | "void">> => ({
        mode: "test",
        fetchPayment: async () => ({ ok: true, data: paid }),
        refund: async (_id: string, amount?: number) => {
          refunds.push(amount ?? -1);
          return { ok: true, data: { ...paid, status: "refunded", refunded: amount ?? 0 } };
        },
        void: async () => {
          throw new Error("past the void window");
        },
      }),
      syncTier: async () => {},
      notify: async () => {},
    },
    "o",
    "admin",
    true,
  );
  assert.equal(r.status, 200);
  assert.deepEqual(refunds, [166750]);
});

// ── the preview ─────────────────────────────────────────────────────────────

function previewDb(row: Record<string, unknown> | null = ROW, userType = "individual") {
  return fakeDb((q) => {
    if (q.table === "profiles") return { data: { user_type: userType } };
    if (q.table === "coupons") return { data: row };
    if (q.table === "coupon_usage") return { data: [] };
    if (q.table === "payment_orders") return { data: [] };
    return {};
  });
}

test("validate: the preview has the checkout's numbers (VAT on the discounted net) and writes nothing", async () => {
  const { client, log } = previewDb();
  const r = await validateCouponWith({ admin: client, now: () => NOW }, { userId: USER, code: "NZAMY50", itemId: "ind-preventive", billing: "yearly" });
  assert.deepEqual(r, {
    status: 200,
    body: { code: "NZAMY50", quote: { listNet: 149000, discount: 5000, net: 144000, vat: 21600, total: 165600 } },
  });
  assert.equal(log.filter((q) => q.op !== "select").length, 0, "nothing written");
});

test("validate: unknown code, wrong audience item and top-up answer refusals; no profile is 503", async () => {
  {
    const { client } = previewDb(null);
    const r = await validateCouponWith({ admin: client, now: () => NOW }, { userId: USER, code: "NOPE1", itemId: "ind-preventive", billing: "yearly" });
    assert.deepEqual(r, { status: 400, body: { error: "كود الخصم غير صالح أو منتهي الصلاحية" } });
  }
  {
    const { client } = previewDb(ROW, "lawyer");
    const r = await validateCouponWith({ admin: client, now: () => NOW }, { userId: USER, code: "NZAMY50", itemId: "ind-preventive", billing: "yearly" });
    assert.equal(r.status, 400);
  }
  {
    const { client } = previewDb();
    const r = await validateCouponWith({ admin: client, now: () => NOW }, { userId: USER, code: "NZAMY50", itemId: "topup-1000", billing: "once" });
    assert.deepEqual(r, { status: 400, body: { error: "كود الخصم لا ينطبق على هذا المنتج" } });
  }
  {
    const { client } = fakeDb(() => ({ data: null }));
    const r = await validateCouponWith({ admin: client, now: () => NOW }, { userId: USER, code: "NZAMY50", itemId: "ind-preventive", billing: "yearly" });
    assert.equal(r.status, 503);
  }
});

test("couponsAvailable: true once the 20261026_20 columns answer; a missing column (or any error) is false", async () => {
  assert.equal(await couponsAvailable(fakeDb(() => ({ data: [] })).client), true);
  assert.equal(
    await couponsAvailable(fakeDb(() => ({ error: { code: "42703", message: "column coupons.max_discount_pct does not exist" } })).client),
    false,
  );
  assert.equal(await couponsAvailable(fakeDb(() => ({ error: { code: "42501", message: "permission denied" } })).client), false);
});
