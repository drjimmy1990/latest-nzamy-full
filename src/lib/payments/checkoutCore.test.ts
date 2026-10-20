/**
 * checkoutCore.test.ts — behaviour of startCheckoutWith (B1 Task 6, fix
 * round 1) against a fake service client and a fake Moyasar client: the
 * audience check, the profile fallbacks, the price, superseding earlier
 * orders, the order row, and the stamp guard that keeps a client secret from
 * going out for an order it did not land on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { fakeDb, has, type FakeHandler, type FakeQuery } from "./fakeDb.test-helper.ts";
import { AUDIENCE_REFUSED_AR, CHECKOUT_FAILED_AR, startCheckoutWith, type CheckoutDeps, type CheckoutInput } from "./checkoutCore.ts";
import { quote } from "./catalog.ts";
import { MOYASAR_DISABLED_MESSAGE_AR } from "./moyasarConfig.ts";

const NOW = new Date("2026-10-22T08:00:00.000Z");
const USER = "00000000-0000-0000-0000-00000000u001";
const NEW_ORDER = "00000000-0000-0000-0000-0000000b0001";

interface FakeMoyasar {
  client: CheckoutDeps["client"];
  intents: Array<Parameters<CheckoutDeps["client"]["createIntent"]>[0]>;
  cancelled: string[];
}

function moyasar(opts: { intentOk?: boolean; cancelOk?: (id: string) => boolean } = {}): FakeMoyasar {
  const intents: FakeMoyasar["intents"] = [];
  const cancelled: string[] = [];
  const client = {
    async createIntent(input: FakeMoyasar["intents"][number]) {
      intents.push(input);
      return opts.intentOk === false
        ? { ok: false as const, status: 400, type: "invalid_request", message: "nope" }
        : { ok: true as const, data: { id: "pi_new", clientSecret: "cs_secret_new", expiresAt: null } };
    },
    async cancelIntent(id: string) {
      cancelled.push(id);
      return opts.cancelOk?.(id) === false
        ? { ok: false as const, status: 400, type: "intent_not_cancelable", message: "x" }
        : { ok: true as const, data: { id, status: "canceled" } };
    },
  } as unknown as CheckoutDeps["client"];
  return { client, intents, cancelled };
}

/** Answers: a profile of `userType`, no earlier orders, insert → NEW_ORDER, stamp → one row. */
function db(userType: string | null = "lawyer", over?: FakeHandler) {
  return fakeDb((q) => {
    const r = over?.(q);
    if (r) return r;
    if (q.table === "profiles") return { data: userType === null ? null : { user_type: userType } };
    if (q.table === "payment_orders" && q.op === "select") return { data: [] };
    if (q.table === "payment_orders" && q.op === "insert") return { data: { id: NEW_ORDER } };
    if (q.table === "payment_orders" && q.op === "update") return { data: [{ id: NEW_ORDER }] };
    return { data: null };
  });
}

const input = (over: Partial<CheckoutInput> = {}): CheckoutInput => ({
  user: { id: USER, email: "buyer@example.test" },
  itemId: "lawyer-pro",
  billing: "monthly",
  origin: "https://nezamy.sa",
  publishableKey: "pk_test_x",
  ...over,
});

const inserts = (log: FakeQuery[]) => log.filter((q) => q.table === "payment_orders" && q.op === "insert");
const updates = (log: FakeQuery[]) => log.filter((q) => q.table === "payment_orders" && q.op === "update");

test("happy path: the quote's price, a created order, the intent, the guarded stamp, the response", async () => {
  const { client: admin, log } = db("lawyer");
  const m = moyasar();
  const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input());
  const q = quote("lawyer-pro", "monthly", "lawyer");
  assert.ok(q.ok);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, {
    orderId: NEW_ORDER,
    intentId: "pi_new",
    clientSecret: "cs_secret_new",
    publishableKey: "pk_test_x",
    amountHalalas: q.totalHalalas,
    descriptionAr: "NEZAMY — المحامي المحترف",
    saveCard: true,
    quote: { net: q.netHalalas, vat: q.vatHalalas, total: q.totalHalalas, vatMode: "exclusive" },
  });
  assert.equal(q.totalHalalas, 45885);

  const [ins] = inserts(log);
  assert.deepEqual(ins.payload, {
    user_id: USER,
    merchant: "platform",
    kind: "plan",
    item_id: "lawyer-pro",
    billing: "monthly",
    net_halalas: 39900,
    vat_halalas: 5985,
    total_halalas: 45885,
    vat_mode: "exclusive",
    currency: "SAR",
    status: "created",
    source: "checkout",
    metadata: { user_email: "buyer@example.test" },
  });

  assert.deepEqual(m.intents, [
    {
      amountHalalas: 45885,
      description: "NEZAMY — المحامي المحترف",
      callbackUrl: `https://nezamy.sa/payments/result?order=${NEW_ORDER}`,
      metadata: { order_id: NEW_ORDER },
    },
  ]);

  const stamp = updates(log).find((u) => (u.payload as { status?: string }).status === "initiated");
  assert.ok(stamp, "the order is stamped initiated");
  assert.deepEqual(stamp.payload, { moyasar_intent_id: "pi_new", status: "initiated" });
  assert.ok(has(stamp, "eq", "id", NEW_ORDER) && has(stamp, "eq", "status", "created"), "only while still created");
  assert.equal(stamp.returning, "id", "the stamp returns the row it updated");
  assert.ok(log.indexOf(ins) < log.indexOf(stamp));
});

test("the library is priced by the buyer's type: inclusive for an individual, exclusive for a lawyer", async () => {
  for (const [type, total, mode] of [["individual", 150000, "inclusive"], ["lawyer", 172500, "exclusive"]] as const) {
    const { client: admin, log } = db(type);
    const r = await startCheckoutWith({ admin, client: moyasar().client, now: () => NOW }, input({ itemId: "lib-q1", billing: "once" }));
    assert.equal(r.status, 200, type);
    assert.equal((inserts(log)[0].payload as { total_halalas: number }).total_halalas, total, type);
    assert.equal((inserts(log)[0].payload as { vat_mode: string }).vat_mode, mode, type);
  }
});

test("the audience check: a lawyer cannot buy the individuals' plans (403, no order, no intent)", async () => {
  for (const [type, itemId] of [
    ["lawyer", "ind-preventive"],
    ["lawyer", "ind-litigation"],
    ["individual", "lawyer-pro"],
    ["individual", "firm-basic"],
    ["corporate", "ind-ai"],
  ] as const) {
    const { client: admin, log } = db(type);
    const m = moyasar();
    const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input({ itemId }));
    assert.deepEqual(r, { status: 403, body: { error: AUDIENCE_REFUSED_AR } }, `${type} → ${itemId}`);
    assert.equal(r.body && (r.body as { error: string }).error, "هذه الباقة غير متاحة لنوع حسابك");
    assert.equal(inserts(log).length, 0);
    assert.equal(m.intents.length, 0);
    assert.equal(log.filter((q) => q.table === "payment_orders").length, 0, "nothing is read or written before the check");
  }
});

test("the profile: a missing row or a read error is 503, never a guessed price", async () => {
  const missing = db(null);
  const m1 = moyasar();
  const r1 = await startCheckoutWith({ admin: missing.client, client: m1.client, now: () => NOW }, input({ itemId: "lib-q1", billing: "once" }));
  assert.deepEqual(r1, { status: 503, body: { error: CHECKOUT_FAILED_AR } });
  assert.equal(inserts(missing.log).length, 0);

  const broken = db("lawyer", (q) => (q.table === "profiles" ? { error: { code: "57014", message: "timeout" } } : undefined));
  const r2 = await startCheckoutWith({ admin: broken.client, client: moyasar().client, now: () => NOW }, input());
  assert.deepEqual(r2, { status: 503, body: { error: CHECKOUT_FAILED_AR } });
  assert.equal(inserts(broken.log).length, 0);
});

test("unknown item / billing not offered → 400, nothing written", async () => {
  const a = db("lawyer");
  assert.equal((await startCheckoutWith({ admin: a.client, client: moyasar().client }, input({ itemId: "gold-plan" }))).status, 400);
  const b = db("lawyer");
  assert.equal((await startCheckoutWith({ admin: b.client, client: moyasar().client }, input({ billing: "once" }))).status, 400);
  assert.equal(inserts(a.log).length + inserts(b.log).length, 0);
});

test("superseding: an earlier order is closed only after Moyasar cancels its intent, or when it never had one", async () => {
  const earlier = [
    { id: "o-cancelable", item_id: "lawyer-pro", status: "initiated", moyasar_intent_id: "pi_old_ok", moyasar_payment_id: null },
    { id: "o-fulfilled", item_id: "lawyer-pro", status: "initiated", moyasar_intent_id: "pi_old_used", moyasar_payment_id: null },
    { id: "o-no-intent", item_id: "lawyer-pro", status: "created", moyasar_intent_id: null, moyasar_payment_id: null },
  ];
  const { client: admin, log } = db("lawyer", (q) =>
    q.table === "payment_orders" && q.op === "select" ? { data: earlier } : undefined,
  );
  const m = moyasar({ cancelOk: (id) => id !== "pi_old_used" });
  const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input());
  assert.equal(r.status, 200);

  const read = log.find((q) => q.table === "payment_orders" && q.op === "select");
  assert.ok(read);
  assert.ok(has(read, "eq", "user_id", USER) && has(read, "eq", "item_id", "lawyer-pro"));
  assert.ok(has(read, "is", "moyasar_payment_id", null));
  assert.ok(has(read, "gt", "created_at", new Date(NOW.getTime() - 65 * 60 * 1000).toISOString()));

  assert.deepEqual(m.cancelled.sort(), ["pi_old_ok", "pi_old_used"]);
  const closes = updates(log).filter((u) => (u.payload as { status?: string }).status === "cancelled");
  const closedIds = closes.map((u) => u.filters.find(([k, c]) => k === "eq" && c === "id")?.[2]).sort();
  assert.deepEqual(closedIds, ["o-cancelable", "o-no-intent"], "the fulfilled intent's order stays open for its payment");
  for (const c of closes) {
    assert.ok(has(c, "eq", "user_id", USER));
    assert.ok(has(c, "is", "moyasar_payment_id", null), "never closes an order a payment reached");
    assert.ok(c.filters.some(([k, col]) => k === "in" && col === "status"));
  }
  const firstClose = log.indexOf(closes[0]);
  assert.ok(firstClose < log.indexOf(inserts(log)[0]), "superseded before the new order is made");
});

test("the intent is refused: the new order is closed, 503, no secret", async () => {
  const { client: admin, log } = db("lawyer");
  const r = await startCheckoutWith({ admin, client: moyasar({ intentOk: false }).client, now: () => NOW }, input());
  assert.deepEqual(r, { status: 503, body: { error: CHECKOUT_FAILED_AR } });
  const close = updates(log).find((u) => (u.payload as { status?: string }).status === "cancelled");
  assert.ok(close && has(close, "eq", "id", NEW_ORDER) && has(close, "eq", "status", "created"));
  assert.equal(updates(log).some((u) => (u.payload as { status?: string }).status === "initiated"), false);
});

test("the stamp guard: zero rows updated (a concurrent checkout closed the order) → no client secret, intent cancelled, 503", async () => {
  const { client: admin, log } = db("lawyer", (q) =>
    q.table === "payment_orders" && q.op === "update" && (q.payload as { status?: string }).status === "initiated"
      ? { data: [] }
      : undefined,
  );
  const m = moyasar();
  const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input());
  assert.deepEqual(r, { status: 503, body: { error: CHECKOUT_FAILED_AR } });
  assert.ok(!JSON.stringify(r).includes("cs_secret_new"), "the client secret never goes out");
  assert.deepEqual(m.cancelled, ["pi_new"], "the new intent is cancelled");
  const close = updates(log).find((u) => (u.payload as { status?: string }).status === "cancelled");
  assert.ok(close && has(close, "eq", "id", NEW_ORDER));
});

test("the stamp guard: a stamp error is the same refusal", async () => {
  const { client: admin } = db("lawyer", (q) =>
    q.table === "payment_orders" && q.op === "update" && (q.payload as { status?: string }).status === "initiated"
      ? { error: { code: "40001", message: "serialization" } }
      : undefined,
  );
  const m = moyasar();
  const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input());
  assert.equal(r.status, 503);
  assert.ok(!JSON.stringify(r).includes("cs_secret_new"));
  assert.deepEqual(m.cancelled, ["pi_new"]);
});

test("deploy order: a missing payment_orders table is 503 «الدفع الإلكتروني غير متاح حالياً», no intent", async () => {
  const { client: admin } = db("lawyer", (q) =>
    q.table === "payment_orders" ? { error: { code: "42P01", message: "relation does not exist" } } : undefined,
  );
  const m = moyasar();
  const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input());
  assert.deepEqual(r, { status: 503, body: { error: MOYASAR_DISABLED_MESSAGE_AR } });
  assert.equal(m.intents.length, 0);
});
