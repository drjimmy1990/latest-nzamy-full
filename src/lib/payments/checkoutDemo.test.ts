/**
 * checkoutDemo.test.ts — S3 (20261125_50): a demo account never pays and
 * never reserves a founder seat. The database is the truth (payment_orders
 * refuses the order, founder_reserve_seat answers 'demo_account'); the
 * checkout only turns those answers into one fixed Arabic 403.
 *
 * Kept apart from checkoutCore.test.ts on purpose (another batch edits it);
 * the fakes below are the same shape, trimmed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { fakeDb, type FakeHandler, type FakeQuery } from "./fakeDb.test-helper.ts";
import { startCheckoutWith, type CheckoutDeps, type CheckoutInput } from "./checkoutCore.ts";
import { DEMO_NO_PAYMENT_AR } from "../api/dbErrorCore.ts";
import { FOUNDER_TERMS_VERSION } from "../founder/founderTerms.ts";

const NOW = new Date("2026-11-20T08:00:00.000Z");
const USER = "00000000-0000-0000-0000-0000000d0001";
const NEW_ORDER = "00000000-0000-0000-0000-0000000d2001";

function moyasar() {
  const intents: unknown[] = [];
  const client = {
    async listPaymentsByOrder() {
      return { ok: true as const, data: [] };
    },
    async createIntent(i: unknown) {
      intents.push(i);
      return { ok: true as const, data: { id: "pi_new", clientSecret: "cs", expiresAt: null } };
    },
    async cancelIntent(id: string) {
      return { ok: true as const, data: { id, status: "canceled" } };
    },
  } as unknown as CheckoutDeps["client"];
  return { client, intents };
}

function db(over?: FakeHandler) {
  return fakeDb((q) => {
    const r = over?.(q);
    if (r) return r;
    if (q.table === "profiles") return { data: { user_type: "lawyer" } };
    if (q.table === "payment_orders" && q.op === "select") return { data: [] };
    if (q.table === "payment_orders" && q.op === "insert") return { data: { id: NEW_ORDER } };
    if (q.table === "payment_orders" && q.op === "update") return { data: [{ id: NEW_ORDER }] };
    return { data: null };
  });
}

const input = (over: Partial<CheckoutInput> = {}): CheckoutInput => ({
  user: { id: USER, email: "demo@example.test" },
  itemId: "lawyer-founder-2026",
  billing: "once",
  origin: "https://nezamy.sa",
  publishableKey: "pk_test_x",
  founderConsent: { accepted: true, version: FOUNDER_TERMS_VERSION },
  ...over,
});

const orderInserts = (log: FakeQuery[]) => log.filter((q) => q.table === "payment_orders" && q.op === "insert");

test("demo: payment_orders refuses the order (demo_account:no_payment) → 403 with the fixed sentence, no intent, no seat call", async () => {
  const { client: admin } = db((q) =>
    q.table === "payment_orders" && q.op === "insert"
      ? { error: { code: "P0001", message: "demo_account:no_payment" } }
      : undefined,
  );
  const m = moyasar();
  const seatCalls: string[] = [];
  const r = await startCheckoutWith(
    {
      admin,
      client: m.client,
      now: () => NOW,
      onSale: true,
      reserveFounderSeat: async (_u, o) => {
        seatCalls.push(o);
        return "reserved";
      },
    },
    input(),
  );
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, { error: DEMO_NO_PAYMENT_AR });
  assert.equal(m.intents.length, 0);
  assert.equal(seatCalls.length, 0);
});

test("demo: the same refusal on a plain plan or a top-up is the same 403 (a demo account never pays)", async () => {
  for (const [over, userType] of [
    [{ itemId: "lawyer-pro", billing: "yearly" as const, founderConsent: undefined }, "lawyer"],
    [{ itemId: "topup-250", billing: "once" as const, founderConsent: undefined }, "individual"],
  ] as const) {
    const { client: admin } = db((q) => {
      if (q.table === "profiles") return { data: { user_type: userType } };
      if (q.table === "payment_orders" && q.op === "insert") {
        return { error: { code: "P0001", message: "demo_account:no_payment" } };
      }
      return undefined;
    });
    const r = await startCheckoutWith({ admin, client: moyasar().client, now: () => NOW }, input(over));
    assert.equal(r.status, 403, over.itemId);
    assert.deepEqual(r.body, { error: DEMO_NO_PAYMENT_AR });
  }
});

test("demo: founder_reserve_seat → demo_account is a 403 with the fixed sentence, the order is cancelled and no intent opens", async () => {
  const { client: admin, log } = db();
  const m = moyasar();
  const r = await startCheckoutWith(
    { admin, client: m.client, now: () => NOW, onSale: true, reserveFounderSeat: async () => "demo_account" },
    input(),
  );
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, { error: DEMO_NO_PAYMENT_AR });
  assert.equal(orderInserts(log).length, 1);
  assert.equal(m.intents.length, 0);
  const cancelled = log.filter(
    (q) => q.table === "payment_orders" && q.op === "update" && (q.payload as { status?: string }).status === "cancelled",
  );
  assert.equal(cancelled.length, 1, "the order is cancelled");
});

test("demo: an unrelated insert error stays the generic 503 (the mapping is token-exact)", async () => {
  const { client: admin } = db((q) =>
    q.table === "payment_orders" && q.op === "insert"
      ? { error: { code: "P0001", message: "demo_accountx" } }
      : undefined,
  );
  const r = await startCheckoutWith({ admin, client: moyasar().client, now: () => NOW, onSale: true, reserveFounderSeat: async () => "reserved" }, input());
  assert.equal(r.status, 503);
});
