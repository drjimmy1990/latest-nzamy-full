/**
 * fulfillCore.test.ts — behaviour of fulfillOrderWith against a fake service
 * client and a fake Moyasar client (fix round 1 of B1 Task 5): the order of
 * the steps, the exactly-once stamp and notification, the 23505 paths, the
 * paid_unmatched trace, and the deploy-order fallbacks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { findPaidPaymentWith, fulfillOrderWith, type FulfilDeps, type GatewayClient } from "./fulfillCore.ts";
import type { MoyasarPayment } from "./moyasarClient.ts";
import type { GrantLibraryFn } from "./grantPurchase.ts";
import { fakeDb, has, RANKS, type FakeHandler, type FakeQuery } from "./fakeDb.test-helper.ts";

const NOW = new Date("2026-10-22T08:00:00.000Z");
const USER = "00000000-0000-0000-0000-00000000u001";
const ORDER = "00000000-0000-0000-0000-0000000a0001";

function orderRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ORDER,
    user_id: USER,
    merchant: "platform",
    kind: "topup",
    item_id: "topup-100",
    billing: "once",
    total_halalas: 11500,
    currency: "SAR",
    status: "initiated",
    moyasar_payment_id: null,
    live: null,
    receipt_number: null,
    paid_at: null,
    fulfilled_at: null,
    failure_message: null,
    metadata: { user_email: "u@example.test" },
    ...over,
  };
}

function paymentOf(over: Partial<MoyasarPayment> = {}): MoyasarPayment {
  return {
    id: "pay_1",
    status: "paid",
    amount: 11500,
    currency: "SAR",
    metadata: { order_id: ORDER },
    source: { type: "creditcard" },
    invoice_id: null,
    refunded: 0,
    captured: 11500,
    createdAt: "2026-10-22T07:59:00.000Z",
    ...over,
  };
}

function gateway(payment: MoyasarPayment | null, listed: MoyasarPayment[] = []): GatewayClient {
  return {
    mode: "test",
    fetchPayment: async () =>
      payment ? { ok: true, data: payment } : { ok: false, status: 404, type: "not_found", message: "no" },
    fetchToken: async (id: string) => ({
      ok: true,
      data: { id, status: "active", brand: "visa", funding: null, country: null, month: "12", year: "2030", name: null, lastFour: "1111" },
    }),
    listPaymentsByOrder: async () => ({ ok: true, data: listed }),
  } as unknown as GatewayClient;
}

/** The happy path of a top-up; `over` answers a query first when it wants to. */
function happyDb(order: Record<string, unknown> = orderRow(), over?: FakeHandler) {
  return fakeDb((q) => {
    const r = over?.(q);
    if (r) return r;
    if (q.table === "payment_orders" && q.op === "select") return { data: order };
    if (q.table === "claim_payment_order") {
      return { data: [{ ...order, status: "paid", moyasar_payment_id: "pay_1", receipt_number: "NZ-2026-000001", paid_at: NOW.toISOString() }] };
    }
    if (q.table === "credit_points") return { data: "lot-1" };
    if (q.table === "payment_orders" && q.op === "update") return { data: [{ id: ORDER }] };
    return { data: null };
  });
}

function deps(client: FulfilDeps["admin"], gw: GatewayClient | null, extra: Partial<FulfilDeps> = {}) {
  const notices: Array<{ userId: string; title: string; body: string; href: string }> = [];
  const d: FulfilDeps = {
    admin: client,
    gateway: async () => gw,
    grantLibrary: (async () => ({ ok: true, endsAt: NOW.toISOString() })) as GrantLibraryFn,
    ranks: RANKS,
    notify: async (n) => {
      notices.push(n);
    },
    now: () => NOW,
    ...extra,
  };
  return { d, notices };
}

const INPUT = { orderId: ORDER, paymentId: "pay_1", merchant: "platform" as const };
const idx = (log: FakeQuery[], pred: (q: FakeQuery) => boolean) => log.findIndex(pred);
const stamps = (log: FakeQuery[]) =>
  log.filter((q) => q.table === "payment_orders" && q.op === "update" && "fulfilled_at" in (q.payload as object));
const unmatched = (log: FakeQuery[]) => log.filter((q) => q.table === "merge_payment_order_metadata");

test("grant: claim, then the points, then fulfilled_at stamped once (while null), then one notification", async () => {
  const { client, log } = happyDb();
  const { d, notices } = deps(client, gateway(paymentOf()));
  const r = await fulfillOrderWith(d, INPUT);
  assert.deepEqual(r, { outcome: "granted", receiptNumber: "NZ-2026-000001" });

  const claimAt = idx(log, (q) => q.table === "claim_payment_order");
  const lotAt = idx(log, (q) => q.table === "credit_points");
  const stampAt = idx(log, (q) => stamps([q]).length === 1);
  assert.ok(claimAt > -1 && lotAt > claimAt && stampAt > lotAt, "claim → grant → stamp");
  assert.deepEqual(log[claimAt].payload, { p_order: ORDER, p_payment_id: "pay_1", p_live: false });
  assert.equal(stamps(log).length, 1);
  assert.ok(has(log[stampAt], "is", "fulfilled_at", null), "the stamp only lands while fulfilled_at is null");
  assert.equal(notices.length, 1);
  assert.ok(notices[0].body.includes("NZ-2026-000001") && notices[0].body.trim().length > 0);
  assert.equal(unmatched(log).length, 0);
});

test("a second call that loses the stamp answers already_done and sends no notification", async () => {
  const { client } = happyDb(orderRow(), (q) =>
    q.table === "payment_orders" && q.op === "update" ? { data: [] } : undefined,
  );
  const { d, notices } = deps(client, gateway(paymentOf()));
  const r = await fulfillOrderWith(d, INPUT);
  assert.equal(r.outcome, "already_done");
  assert.equal(notices.length, 0);
});

test("the claim returns zero rows → already_done (claimed_elsewhere), nothing granted", async () => {
  const { client, log } = happyDb(orderRow(), (q) => (q.table === "claim_payment_order" ? { data: [] } : undefined));
  const { d, notices } = deps(client, gateway(paymentOf()));
  const r = await fulfillOrderWith(d, INPUT);
  assert.deepEqual(r, { outcome: "already_done", reason: "claimed_elsewhere" });
  assert.equal(idx(log, (q) => q.table === "credit_points"), -1);
  assert.equal(notices.length, 0);
});

test("a points 23505 after the claim is already credited → granted and stamped", async () => {
  const { client, log } = happyDb(orderRow(), (q) =>
    q.table === "credit_points" ? { error: { code: "23505", message: "points_lots_order_source_key" } } : undefined,
  );
  const { d } = deps(client, gateway(paymentOf()));
  const r = await fulfillOrderWith(d, INPUT);
  assert.equal(r.outcome, "granted");
  assert.equal(stamps(log).length, 1);
});

test("a library 23505 after the claim is already granted → granted and stamped", async () => {
  const lib = orderRow({ kind: "library", item_id: "lib-q1", total_halalas: 150000 });
  const { client, log } = happyDb(lib);
  const { d } = deps(client, gateway(paymentOf({ amount: 150000 })), {
    grantLibrary: (async () => ({ ok: false, error: "duplicate key", code: "23505" })) as GrantLibraryFn,
  });
  const r = await fulfillOrderWith(d, INPUT);
  assert.equal(r.outcome, "granted");
  assert.equal(stamps(log).length, 1);
});

test("a grant failure after the claim leaves fulfilled_at null (pending) for the sweep", async () => {
  const { client, log } = happyDb(orderRow(), (q) =>
    q.table === "credit_points" ? { error: { code: "XX000", message: "boom" } } : undefined,
  );
  const { d, notices } = deps(client, gateway(paymentOf()));
  const r = await fulfillOrderWith(d, INPUT);
  assert.equal(r.outcome, "pending");
  assert.equal(r.reason, "grant_failed");
  assert.equal(stamps(log).length, 0);
  assert.equal(notices.length, 0);
});

test("a PAID payment of the wrong amount: rejected, never claimed, paid_unmatched merged on the order", async () => {
  const { client, log } = happyDb();
  const { d } = deps(client, gateway(paymentOf({ amount: 11499 })));
  const r = await fulfillOrderWith(d, INPUT);
  assert.deepEqual(r, { outcome: "rejected", reason: "amount_mismatch" });
  assert.equal(idx(log, (q) => q.table === "claim_payment_order"), -1);
  const m = unmatched(log);
  assert.equal(m.length, 1);
  assert.deepEqual(m[0].payload, {
    p_order: ORDER,
    p_patch: { paid_unmatched: { payment_id: "pay_1", reason: "amount_mismatch", at: NOW.toISOString() } },
  });
});

test("a FAILED payment of the wrong amount leaves no paid_unmatched trace", async () => {
  const { client, log } = happyDb();
  const { d } = deps(client, gateway(paymentOf({ amount: 11499, status: "failed" })));
  const r = await fulfillOrderWith(d, INPUT);
  assert.equal(r.outcome, "rejected");
  assert.equal(unmatched(log).length, 0);
});

test("a PAID payment for a cancelled order: already_done, paid_unmatched order_cancelled", async () => {
  const { client, log } = happyDb(orderRow({ status: "cancelled" }));
  const { d } = deps(client, gateway(paymentOf()));
  const r = await fulfillOrderWith(d, INPUT);
  assert.equal(r.outcome, "already_done");
  assert.equal((unmatched(log)[0].payload as { p_patch: { paid_unmatched: { reason: string } } }).p_patch.paid_unmatched.reason, "order_cancelled");
});

test("a PAID payment when another payment is stamped on the order: order_mismatch + paid_unmatched", async () => {
  const { client, log } = happyDb(orderRow({ moyasar_payment_id: "pay_0" }));
  const { d } = deps(client, gateway(paymentOf()));
  const r = await fulfillOrderWith(d, INPUT);
  assert.deepEqual(r, { outcome: "rejected", reason: "order_mismatch" });
  assert.equal(unmatched(log).length, 1);
});

test("a 23505 on the claim (the payment settled another order): order_mismatch + paid_unmatched payment_on_other_order", async () => {
  const { client, log } = happyDb(orderRow(), (q) =>
    q.table === "claim_payment_order" ? { error: { code: "23505", message: "payment_orders_moyasar_payment_id_key" } } : undefined,
  );
  const { d } = deps(client, gateway(paymentOf()));
  const r = await fulfillOrderWith(d, INPUT);
  assert.deepEqual(r, { outcome: "rejected", reason: "order_mismatch" });
  assert.equal((unmatched(log)[0].payload as { p_patch: { paid_unmatched: { reason: string } } }).p_patch.paid_unmatched.reason, "payment_on_other_order");
});

test("deploy order: the claim function missing → pending schema_missing, never a throw", async () => {
  const { client } = happyDb(orderRow(), (q) =>
    q.table === "claim_payment_order" ? { error: { code: "PGRST202", message: "Could not find the function" } } : undefined,
  );
  const { d } = deps(client, gateway(paymentOf()));
  assert.deepEqual(await fulfillOrderWith(d, INPUT), { outcome: "pending", reason: "schema_missing" });
});

test("deploy order: the orders table missing → pending schema_missing", async () => {
  const { client } = fakeDb(() => ({ error: { code: "42P01", message: "relation does not exist" } }));
  const { d } = deps(client, gateway(paymentOf()));
  assert.deepEqual(await fulfillOrderWith(d, INPUT), { outcome: "pending", reason: "schema_missing" });
});

test("the gateway off → pending gateway_disabled, Moyasar never called", async () => {
  const { client, log } = happyDb();
  const { d } = deps(client, null);
  assert.deepEqual(await fulfillOrderWith(d, INPUT), { outcome: "pending", reason: "gateway_disabled" });
  assert.equal(idx(log, (q) => q.table === "claim_payment_order"), -1);
});

test("a paid order already fulfilled with already_entitled keeps its reason on a refresh", async () => {
  const { client } = happyDb(orderRow({ status: "paid", fulfilled_at: NOW.toISOString(), receipt_number: "NZ-2026-000009", metadata: { already_entitled: true } }));
  const { d } = deps(client, gateway(paymentOf()));
  assert.deepEqual(await fulfillOrderWith(d, INPUT), { outcome: "already_done", reason: "already_entitled", receiptNumber: "NZ-2026-000009" });
});

test("a paid unfulfilled order: the callback waits; the sweep resumes it only after RESUME_AFTER_MS", async () => {
  const fresh = orderRow({ status: "paid", moyasar_payment_id: "pay_1", receipt_number: "NZ-2026-000003", paid_at: new Date(NOW.getTime() - 60_000).toISOString() });
  const a = happyDb(fresh);
  const r1 = await fulfillOrderWith(deps(a.client, gateway(paymentOf())).d, { ...INPUT, resume: true });
  assert.equal(r1.reason, "fulfilment_in_progress");

  const old = { ...fresh, paid_at: new Date(NOW.getTime() - 11 * 60_000).toISOString() };
  const b = happyDb(old);
  const r2 = await fulfillOrderWith(deps(b.client, gateway(paymentOf())).d, INPUT);
  assert.equal(r2.reason, "fulfilment_in_progress", "the callback never resumes");
  const c = happyDb(old);
  const r3 = await fulfillOrderWith(deps(c.client, gateway(paymentOf())).d, { ...INPUT, resume: true });
  assert.equal(r3.outcome, "granted");
  assert.equal(idx(c.log, (q) => q.table === "claim_payment_order"), -1, "a resume never claims again");
});

test("findPaidPaymentWith: the newest paid payment of the order, or null; a list failure is reported", async () => {
  const listed = [
    paymentOf({ id: "p-failed", status: "failed", createdAt: "2026-10-22T07:00:00Z" }),
    paymentOf({ id: "p-paid", status: "paid", createdAt: "2026-10-22T07:30:00Z" }),
  ];
  assert.deepEqual(await findPaidPaymentWith({ gateway: async () => gateway(null, listed) }, ORDER), { ok: true, paymentId: "p-paid" });
  assert.deepEqual(await findPaidPaymentWith({ gateway: async () => gateway(null, [listed[0]]) }, ORDER), { ok: true, paymentId: null });
  assert.deepEqual(await findPaidPaymentWith({ gateway: async () => null }, ORDER), { ok: false, reason: "gateway_disabled" });
  const broken = { ...gateway(null), listPaymentsByOrder: async () => ({ ok: false, status: 500, type: "x", message: "y" }) } as unknown as GatewayClient;
  assert.deepEqual(await findPaidPaymentWith({ gateway: async () => broken }, ORDER), { ok: false, reason: "list_failed_500" });
});
