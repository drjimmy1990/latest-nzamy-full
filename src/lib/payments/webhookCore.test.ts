/**
 * webhookCore.test.ts — behaviour of handleWebhookWith (B1 Task 6, fix
 * round 1) against the fake service client, with fulfilment injected: a
 * stub for the routing cases, and the real fulfillOrderWith (Task 5's
 * injection, fake Moyasar gateway) for the end-to-end grant.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { fakeDb, has, RANKS, type FakeHandler, type FakeQuery } from "./fakeDb.test-helper.ts";
import { handleWebhookWith, type WebhookDeps } from "./webhookCore.ts";
import { fulfillOrderWith, type FulfilDeps, type FulfillOrderInput, type FulfillResult, type GatewayClient } from "./fulfillCore.ts";
import type { GrantLibraryFn } from "./grantPurchase.ts";
import type { MoyasarPayment } from "./moyasarClient.ts";

const SECRET = "whsec-test-0123456789";
const ORDER = "00000000-0000-0000-0000-0000000a0001";
const USER = "00000000-0000-0000-0000-00000000u001";

function event(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "evt-1",
    type: "payment_paid",
    created_at: "2026-10-22T10:00:00Z",
    secret_token: SECRET,
    account_name: "NEZAMY",
    live: false,
    data: { id: "pay_1", status: "paid", amount: 11500, currency: "SAR", metadata: { order_id: ORDER } },
    ...over,
  };
}

/** Events insert fine, the order is found by payment id, updates succeed. */
function db(over?: FakeHandler) {
  return fakeDb((q) => {
    const r = over?.(q);
    if (r) return r;
    if (q.table === "payment_orders" && q.op === "select") return { data: { id: ORDER } };
    return { data: null };
  });
}

function wire(client: Awaited<ReturnType<WebhookDeps["admin"]>>, result: FulfillResult = { outcome: "granted" }) {
  const calls: FulfillOrderInput[] = [];
  let adminCalls = 0;
  const deps: WebhookDeps = {
    admin: async () => {
      adminCalls++;
      return client;
    },
    fulfill: async (input) => {
      calls.push(input);
      return result;
    },
    webhookSecret: SECRET,
    secretKey: "sk_test_abc",
  };
  return { deps, calls, adminCalls: () => adminCalls };
}

const eventInserts = (log: FakeQuery[]) => log.filter((q) => q.table === "payment_webhook_events" && q.op === "insert");
const outcomeUpdates = (log: FakeQuery[]) => log.filter((q) => q.table === "payment_webhook_events" && q.op === "update");

test("a bad secret is 401 and touches no database at all", async () => {
  const { client, log } = db();
  const w = wire(client);
  for (const token of ["wrong", SECRET.slice(0, -1) + "x", "", undefined]) {
    const r = await handleWebhookWith(w.deps, event({ secret_token: token }));
    assert.equal(r.status, 401, String(token));
  }
  // an unset configured secret refuses even a matching-looking token
  const unset = await handleWebhookWith({ ...w.deps, webhookSecret: undefined }, event());
  assert.equal(unset.status, 401);
  assert.equal(w.adminCalls(), 0, "the service client is never built");
  assert.equal(log.length, 0);
  assert.equal(w.calls.length, 0);
});

test("a malformed event with the right secret is 400, no database", async () => {
  const { client, log } = db();
  const w = wire(client);
  const r = await handleWebhookWith(w.deps, event({ id: undefined }));
  assert.equal(r.status, 400);
  assert.equal(w.adminCalls(), 0);
  assert.equal(log.length, 0);
});

test("payment_paid: the event row first, then fulfilment for the order holding the payment, then the outcome", async () => {
  const { client, log } = db();
  const w = wire(client, { outcome: "granted", receiptNumber: "NZ-1" });
  const r = await handleWebhookWith(w.deps, event());
  assert.deepEqual(r, { status: 200, body: { received: true } });

  const [ins] = eventInserts(log);
  assert.deepEqual(ins.payload, { event_id: "evt-1", merchant: "platform", type: "payment_paid", payment_id: "pay_1", live: false });
  assert.ok(!JSON.stringify(ins.payload).includes(SECRET), "the secret is never stored");

  const lookup = log.find((q) => q.table === "payment_orders");
  assert.ok(lookup && has(lookup, "eq", "moyasar_payment_id", "pay_1"));
  assert.deepEqual(w.calls, [{ orderId: ORDER, paymentId: "pay_1", merchant: "platform", liveFlag: false }]);

  const [upd] = outcomeUpdates(log);
  assert.deepEqual(upd.payload, { outcome: "granted" });
  assert.ok(has(upd, "eq", "event_id", "evt-1"));
  assert.ok(log.indexOf(ins) < log.indexOf(lookup) && log.indexOf(lookup) < log.indexOf(upd), "insert → fulfil → outcome");
});

test("no order holds the payment yet: the payment's metadata.order_id is used", async () => {
  const { client } = db((q) => (q.table === "payment_orders" ? { data: null } : undefined));
  const w = wire(client);
  await handleWebhookWith(w.deps, event());
  assert.equal(w.calls[0].orderId, ORDER);
});

test("neither a stored payment id nor metadata.order_id: no_order, 200, no fulfilment", async () => {
  const { client, log } = db((q) => (q.table === "payment_orders" ? { data: null } : undefined));
  const w = wire(client);
  const r = await handleWebhookWith(w.deps, event({ data: { id: "pay_x", status: "paid" } }));
  assert.equal(r.status, 200);
  assert.equal(w.calls.length, 0);
  assert.deepEqual(outcomeUpdates(log)[0].payload, { outcome: "no_order" });
});

test("both failed-event spellings settle; refunded and voided only record", async () => {
  for (const type of ["payment_failed", "payment_faild"]) {
    const { client } = db();
    const w = wire(client, { outcome: "failed", reason: "Insufficient Funds" });
    const r = await handleWebhookWith(w.deps, event({ type }));
    assert.equal(r.status, 200, type);
    assert.equal(w.calls.length, 1, type);
  }
  for (const type of ["payment_refunded", "payment_voided"]) {
    const { client, log } = db();
    const w = wire(client);
    const r = await handleWebhookWith(w.deps, event({ type }));
    assert.equal(r.status, 200, type);
    assert.equal(w.calls.length, 0, type);
    assert.equal(log.filter((q) => q.table === "payment_orders").length, 0, `${type}: no order is touched`);
    assert.deepEqual(outcomeUpdates(log)[0].payload, { outcome: "recorded" });
  }
});

test("a failed outcome stores no gateway message", async () => {
  const { client, log } = db();
  await handleWebhookWith(wire(client, { outcome: "failed", reason: "Insufficient Funds" }).deps, event({ type: "payment_failed" }));
  assert.deepEqual(outcomeUpdates(log)[0].payload, { outcome: "failed" });
});

test("pending → 503 so Moyasar retries, and the outcome says pending", async () => {
  const { client, log } = db();
  const r = await handleWebhookWith(wire(client, { outcome: "pending", reason: "payment_fetch_failed" }).deps, event());
  assert.equal(r.status, 503);
  assert.deepEqual(outcomeUpdates(log)[0].payload, { outcome: "pending:payment_fetch_failed" });
});

test("claimed_elsewhere is final on the webhook path: 200, no retry (the sweep recovers a crashed claimer)", async () => {
  const { client, log } = db();
  const r = await handleWebhookWith(wire(client, { outcome: "already_done", reason: "claimed_elsewhere" }).deps, event());
  assert.equal(r.status, 200);
  assert.deepEqual(outcomeUpdates(log)[0].payload, { outcome: "already_done:claimed_elsewhere" });
});

test("rejected → 200 (a retry cannot change a mismatch)", async () => {
  const { client } = db();
  const r = await handleWebhookWith(wire(client, { outcome: "rejected", reason: "amount_mismatch" }).deps, event());
  assert.equal(r.status, 200);
});

test("mode_mismatch: a live event on a test key is recorded and answered 200, no fulfilment", async () => {
  const { client, log } = db();
  const w = wire(client);
  const r = await handleWebhookWith(w.deps, event({ live: true }));
  assert.equal(r.status, 200);
  assert.equal(w.calls.length, 0);
  assert.equal(eventInserts(log).length, 1, "the event is still recorded");
  assert.deepEqual(outcomeUpdates(log)[0].payload, { outcome: "mode_mismatch" });
});

test("a repeat event id with a final outcome: 200 {duplicate: true}, nothing re-run", async () => {
  const { client, log } = db((q) => {
    if (q.table === "payment_webhook_events" && q.op === "insert") return { error: { code: "23505", message: "dup" } };
    if (q.table === "payment_webhook_events" && q.op === "select") return { data: { outcome: "granted" } };
    return undefined;
  });
  const w = wire(client);
  const r = await handleWebhookWith(w.deps, event());
  assert.deepEqual(r, { status: 200, body: { received: true, duplicate: true } });
  assert.equal(w.calls.length, 0);
  assert.equal(outcomeUpdates(log).length, 0);
});

test("a repeat event id whose earlier delivery ended pending (or never finished) runs again", async () => {
  for (const stored of ["pending:payment_fetch_failed", null]) {
    const { client, log } = db((q) => {
      if (q.table === "payment_webhook_events" && q.op === "insert") return { error: { code: "23505", message: "dup" } };
      if (q.table === "payment_webhook_events" && q.op === "select") return { data: { outcome: stored } };
      return undefined;
    });
    const w = wire(client, { outcome: "granted" });
    const r = await handleWebhookWith(w.deps, event());
    assert.deepEqual(r, { status: 200, body: { received: true } }, String(stored));
    assert.equal(w.calls.length, 1, String(stored));
    assert.deepEqual(outcomeUpdates(log)[0].payload, { outcome: "granted" });
  }
});

test("deploy order: a missing events table → 503 (retry), no fulfilment; never 500", async () => {
  const { client } = db((q) =>
    q.table === "payment_webhook_events" ? { error: { code: "42P01", message: "relation does not exist" } } : undefined,
  );
  const w = wire(client);
  const r = await handleWebhookWith(w.deps, event());
  assert.equal(r.status, 503);
  assert.equal(w.calls.length, 0);
});

test("any other insert error → 503, no fulfilment", async () => {
  const { client } = db((q) =>
    q.table === "payment_webhook_events" && q.op === "insert" ? { error: { code: "57014", message: "timeout" } } : undefined,
  );
  const w = wire(client);
  assert.equal((await handleWebhookWith(w.deps, event())).status, 503);
  assert.equal(w.calls.length, 0);
});

test("a throwing fulfilment is recorded pending and answered 503", async () => {
  const { client, log } = db();
  const w = wire(client);
  w.deps.fulfill = async () => {
    throw new Error("boom");
  };
  const r = await handleWebhookWith(w.deps, event());
  assert.equal(r.status, 503);
  assert.deepEqual(outcomeUpdates(log)[0].payload, { outcome: "pending:error" });
});

// ── end to end with the real fulfilment (Task 5's injection) ────────────────

function paymentOf(): MoyasarPayment {
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
  };
}

test("end to end: a payment_paid delivery grants a top-up once through fulfillOrderWith", async () => {
  const NOW = new Date("2026-10-22T08:00:00.000Z");
  const order = {
    id: ORDER, user_id: USER, merchant: "platform", kind: "topup", item_id: "topup-100", billing: "once",
    total_halalas: 11500, currency: "SAR", status: "initiated", moyasar_payment_id: null, live: null,
    receipt_number: null, paid_at: null, fulfilled_at: null, failure_message: null, metadata: {},
  };
  const { client, log } = fakeDb((q) => {
    if (q.table === "payment_orders" && q.op === "select" && has(q, "eq", "moyasar_payment_id", "pay_1")) return { data: null };
    if (q.table === "payment_orders" && q.op === "select") return { data: order };
    if (q.table === "claim_payment_order") {
      return { data: [{ ...order, status: "paid", moyasar_payment_id: "pay_1", receipt_number: "NZ-2026-000001", paid_at: NOW.toISOString() }] };
    }
    if (q.table === "credit_points") return { data: "lot-1" };
    if (q.table === "payment_orders" && q.op === "update") return { data: [{ id: ORDER }] };
    return { data: null };
  });
  const gw = {
    mode: "test",
    fetchPayment: async () => ({ ok: true, data: paymentOf() }),
    fetchToken: async () => ({ ok: false, status: 404, type: "x", message: "x" }),
    listPaymentsByOrder: async () => ({ ok: true, data: [] }),
  } as unknown as GatewayClient;
  const notices: unknown[] = [];
  const fdeps: FulfilDeps = {
    admin: client,
    gateway: async () => gw,
    grantLibrary: (async () => ({ ok: true, endsAt: NOW.toISOString() })) as GrantLibraryFn,
    ranks: RANKS,
    notify: async (n) => {
      notices.push(n);
    },
    now: () => NOW,
  };
  const deps: WebhookDeps = {
    admin: async () => client,
    fulfill: (input) => fulfillOrderWith(fdeps, input),
    webhookSecret: SECRET,
    secretKey: "sk_test_abc",
  };
  const r = await handleWebhookWith(deps, event());
  assert.deepEqual(r, { status: 200, body: { received: true } });
  assert.equal(log.filter((q) => q.table === "claim_payment_order").length, 1);
  assert.deepEqual((log.find((q) => q.table === "claim_payment_order")?.payload), { p_order: ORDER, p_payment_id: "pay_1", p_live: false });
  assert.equal(notices.length, 1);
  assert.deepEqual(outcomeUpdates(log).at(-1)?.payload, { outcome: "granted" });
});
