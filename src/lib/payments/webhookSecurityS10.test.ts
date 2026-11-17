/**
 * webhookSecurityS10.test.ts — S10 (owner package 17 Nov, the required
 * security tests) for the founder membership's payment path. Each case drives
 * the REAL handleWebhookWith (webhookCore.ts) into the REAL fulfillOrderWith
 * (fulfillCore.ts), over one stateful fake database (an order row that the
 * claim really moves to 'paid', and an events table keyed by event id) and a
 * fake Moyasar gateway — so "one activation" is counted at the
 * founder_activate dependency itself, not assumed.
 *
 *   S10-b1 a forged webhook (wrong / missing secret_token, or no configured
 *          secret) is refused 401 before the service client is even built;
 *          nothing is read, written or activated.
 *   S10-b2 a replayed webhook for the same payment is idempotent: the same
 *          event id answers {duplicate: true}; a NEW event id for the same
 *          payment (Moyasar re-sending, or a copy) finds the order already
 *          paid → already_done. Exactly one founder_activate, one notice.
 *   S10-b3 an amount mismatch (the payment Moyasar returns charged less than
 *          the stored total) is refused: outcome rejected:amount_mismatch,
 *          the order stays unpaid, nothing is activated — and a forged body
 *          claiming the right amount changes nothing, because fulfilment
 *          re-fetches the payment with the secret key.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { fakeDb, RANKS, type FakeQuery } from "./fakeDb.test-helper.ts";
import { handleWebhookWith, type WebhookDeps } from "./webhookCore.ts";
import { fulfillOrderWith, type FulfilDeps, type GatewayClient } from "./fulfillCore.ts";
import type { GrantLibraryFn } from "./grantPurchase.ts";
import type { MoyasarPayment } from "./moyasarClient.ts";

const SECRET = "whsec-s10-0123456789";
const ORDER = "00000000-0000-0000-0000-0000000f0001";
const USER = "00000000-0000-0000-0000-0000000f00u1";
const TOTAL = 344540; // 2,996 + 15 % VAT, in halalas
const NOW = new Date("2026-11-18T08:00:00.000Z");

function world(paymentAmount = TOTAL) {
  const order: Record<string, unknown> = {
    id: ORDER,
    user_id: USER,
    merchant: "platform",
    kind: "membership",
    item_id: "lawyer-founder-2026",
    billing: "once",
    total_halalas: TOTAL,
    currency: "SAR",
    status: "initiated",
    moyasar_payment_id: null,
    live: null,
    receipt_number: null,
    paid_at: null,
    fulfilled_at: null,
    failure_message: null,
    metadata: {},
  };
  const events = new Map<string, string | null>();
  const eventId = (q: FakeQuery) => q.filters.find(([op, col]) => op === "eq" && col === "event_id")?.[2] as string;

  const { client, log } = fakeDb((q) => {
    if (q.table === "payment_webhook_events") {
      if (q.op === "insert") {
        const id = (q.payload as { event_id: string }).event_id;
        if (events.has(id)) return { error: { code: "23505", message: "duplicate key" } };
        events.set(id, null);
        return { data: null };
      }
      if (q.op === "select") return { data: { outcome: events.get(eventId(q)) ?? null } };
      if (q.op === "update") {
        events.set(eventId(q), (q.payload as { outcome: string }).outcome);
        return { data: null };
      }
    }
    if (q.table === "payment_orders" && q.op === "select") {
      const byPayment = q.filters.find(([op, col]) => op === "eq" && col === "moyasar_payment_id");
      if (byPayment) return { data: order.moyasar_payment_id === byPayment[2] ? { id: ORDER } : null };
      return { data: { ...order } };
    }
    if (q.table === "claim_payment_order") {
      // claim_payment_order (20261022_30): only an open order is claimed, once
      const p = q.payload as { p_payment_id: string; p_live: boolean };
      if (order.status !== "created" && order.status !== "initiated") return { data: [] };
      Object.assign(order, { status: "paid", moyasar_payment_id: p.p_payment_id, live: p.p_live, receipt_number: "NZ-2026-000042", paid_at: NOW.toISOString() });
      return { data: [{ ...order }] };
    }
    if (q.table === "payment_orders" && q.op === "update") {
      Object.assign(order, q.payload as object);
      return { data: [{ id: ORDER }] };
    }
    return { data: null };
  });

  const payment: MoyasarPayment = {
    id: "pay_s10",
    status: "paid",
    amount: paymentAmount,
    currency: "SAR",
    metadata: { order_id: ORDER },
    source: { type: "creditcard" },
    invoice_id: null,
    refunded: 0,
    captured: paymentAmount,
    createdAt: "2026-11-18T07:59:00.000Z",
  };
  let fetches = 0;
  const gw = {
    mode: "test",
    fetchPayment: async () => {
      fetches += 1;
      return { ok: true, data: payment };
    },
    fetchToken: async () => ({ ok: false, status: 404, type: "x", message: "x" }),
    listPaymentsByOrder: async () => ({ ok: true, data: [] }),
  } as unknown as GatewayClient;

  const activations: string[] = [];
  const notices: unknown[] = [];
  const releases: string[] = [];
  const fdeps: FulfilDeps = {
    admin: client,
    gateway: async () => gw,
    grantLibrary: (async () => ({ ok: true, endsAt: NOW.toISOString() })) as GrantLibraryFn,
    ranks: RANKS,
    notify: async (n) => {
      notices.push(n);
    },
    now: () => NOW,
    activateFounder: async (orderId) => {
      activations.push(orderId);
      return { data: "activated", error: null };
    },
    releaseFounderSeat: async (orderId) => {
      releases.push(orderId);
    },
    notifyAdmins: async () => {},
  };
  let adminBuilt = 0;
  const deps: WebhookDeps = {
    admin: async () => {
      adminBuilt += 1;
      return client;
    },
    fulfill: (input) => fulfillOrderWith(fdeps, input),
    webhookSecret: SECRET,
    secretKey: "sk_test_s10",
  };
  return { deps, order, events, log, activations, notices, releases, adminBuilt: () => adminBuilt, fetches: () => fetches };
}

function paidEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "evt-s10-1",
    type: "payment_paid",
    created_at: "2026-11-18T08:00:00Z",
    secret_token: SECRET,
    account_name: "NEZAMY",
    live: false,
    data: { id: "pay_s10", status: "paid", amount: TOTAL, currency: "SAR", metadata: { order_id: ORDER } },
    ...over,
  };
}

test("S10-b1: a forged webhook (bad, truncated, empty or missing secret; no configured secret) is 401 — no client built, nothing read, nothing activated", async () => {
  const w = world();
  for (const token of ["forged", SECRET + "x", SECRET.slice(0, -1), "", undefined, null, 12345]) {
    const r = await handleWebhookWith(w.deps, paidEvent({ secret_token: token }));
    assert.equal(r.status, 401, String(token));
    assert.deepEqual(r.body, { error: "unauthorized" });
  }
  for (const configured of [undefined, "", "   "]) {
    const r = await handleWebhookWith({ ...w.deps, webhookSecret: configured }, paidEvent());
    assert.equal(r.status, 401, `configured secret ${JSON.stringify(configured)}`);
  }
  assert.equal(w.adminBuilt(), 0, "the service client is never built");
  assert.equal(w.log.length, 0, "no query at all");
  assert.equal(w.fetches(), 0, "Moyasar is never asked");
  assert.deepEqual(w.activations, []);
  assert.equal(w.order.status, "initiated");
});

test("S10-b2: the same delivery replayed is a duplicate; a new event id for the same payment is already_done — ONE activation, one notice", async () => {
  const w = world();
  assert.deepEqual(await handleWebhookWith(w.deps, paidEvent()), { status: 200, body: { received: true } });
  assert.equal(w.order.status, "paid");
  assert.deepEqual(w.activations, [ORDER]);
  assert.equal(w.events.get("evt-s10-1"), "granted");

  // the identical delivery again (Moyasar retry, or an attacker replaying a captured body)
  assert.deepEqual(await handleWebhookWith(w.deps, paidEvent()), { status: 200, body: { received: true, duplicate: true } });
  // a different event id naming the same payment
  assert.deepEqual(await handleWebhookWith(w.deps, paidEvent({ id: "evt-s10-2" })), { status: 200, body: { received: true } });
  assert.match(String(w.events.get("evt-s10-2")), /^already_done/);
  // and five more in parallel
  const burst = await Promise.all([3, 4, 5, 6, 7].map((i) => handleWebhookWith(w.deps, paidEvent({ id: `evt-s10-${i}` }))));
  for (const r of burst) assert.equal(r.status, 200);

  assert.deepEqual(w.activations, [ORDER], "founder_activate ran exactly once");
  assert.equal(w.notices.length, 1, "one «تم تفعيل عضويتك المؤسِّسة» notice");
  assert.equal(w.log.filter((q) => q.table === "claim_payment_order").length, 1, "the claim ran once; later calls saw the order paid");
  assert.deepEqual(w.releases, [], "a paid seat is never released");
});

test("S10-b2: two first deliveries racing for the same payment still activate once (the claim is the lock)", async () => {
  const w = world();
  const [a, b] = await Promise.all([
    handleWebhookWith(w.deps, paidEvent({ id: "evt-race-a" })),
    handleWebhookWith(w.deps, paidEvent({ id: "evt-race-b" })),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.deepEqual(w.activations, [ORDER]);
});

test("S10-b3: an amount mismatch is refused — rejected:amount_mismatch, the order stays unpaid, nothing activated", async () => {
  for (const charged of [TOTAL - 1, 100, TOTAL + 100]) {
    const w = world(charged);
    // the body even claims the right amount: it is only a trigger, the fetched payment decides
    const r = await handleWebhookWith(w.deps, paidEvent());
    assert.deepEqual(r, { status: 200, body: { received: true } }, "200: a retry cannot change a mismatch");
    assert.equal(w.events.get("evt-s10-1"), "rejected:amount_mismatch", String(charged));
    assert.equal(w.fetches(), 1, "the payment was re-fetched with the secret key");
    assert.equal(w.order.status, "initiated");
    assert.equal(w.log.filter((q) => q.table === "claim_payment_order").length, 0, "never claimed");
    assert.deepEqual(w.activations, []);
    assert.equal(w.notices.length, 0);
    // the money is flagged for a human: paid_unmatched on the order's metadata
    const flagged = w.log.filter((q) => q.table === "merge_payment_order_metadata");
    assert.ok(flagged.some((q) => JSON.stringify(q.payload).includes("paid_unmatched")), "flagged paid_unmatched");
  }
});
