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
import { createCouponAttemptBudget } from "./couponAttempts.ts";
import { COUPON_PENDING_AR } from "./couponServer.ts";
import {
  AUDIENCE_REFUSED_AR,
  CHECKOUT_FAILED_AR,
  NOT_FOR_SALE_AR,
  startCheckoutWith as startCheckoutWithBook,
  type CheckoutDeps,
  type CheckoutInput,
} from "./checkoutCore.ts";
import { buildCatalog, quote } from "./catalog.ts";
import { PRICE_BOOK, type BookEntry } from "../pricing/priceBook.ts";
import { FOUNDER_MEMBERSHIP_ON_SALE } from "../pricing/campaigns.ts";
import { MOYASAR_DISABLED_MESSAGE_AR } from "./moyasarConfig.ts";

/** A book entry with none of its cycles retired: what it was before it was retired. */
function asSold(entry: BookEntry): BookEntry {
  return {
    ...entry,
    prices: Object.fromEntries(Object.entries(entry.prices).map(([billing, p]) => [billing, { sar: p!.sar }])),
  };
}

/**
 * q329 (owner package of 1 Nov 2026) retired ind-preventive and ind-litigation
 * in the real book. The coupon, supersede and order-row tests below were
 * written with them as items on sale (1,490 / 149 and 3,990), and they test
 * checkout's mechanics, not the catalogue — so they run against this fixture:
 * the real book with those two plans still sold at their old prices.
 * `startCheckoutWithBook` (no fixture) is the real catalogue; the q329 tests
 * use it to prove checkout refuses the retired plans and cycles.
 */
const PRE_Q329_BOOK: Readonly<Record<string, BookEntry>> = {
  ...PRICE_BOOK,
  "ind-preventive": asSold(PRICE_BOOK["ind-preventive"]),
  "ind-litigation": asSold(PRICE_BOOK["ind-litigation"]),
};
const PRE_Q329_CATALOG = buildCatalog(PRE_Q329_BOOK);

function startCheckoutWith(deps: CheckoutDeps, input: CheckoutInput) {
  return startCheckoutWithBook({ catalog: PRE_Q329_CATALOG, book: PRE_Q329_BOOK, ...deps }, input);
}

const NOW = new Date("2026-10-22T08:00:00.000Z");
const USER = "00000000-0000-0000-0000-00000000u001";
const NEW_ORDER = "00000000-0000-0000-0000-0000000b0001";

interface FakeMoyasar {
  client: CheckoutDeps["client"];
  intents: Array<Parameters<CheckoutDeps["client"]["createIntent"]>[0]>;
  cancelled: string[];
}

function moyasar(
  opts: {
    intentOk?: boolean;
    cancelOk?: (id: string) => boolean;
    /** listPaymentsByOrder's answer: the statuses Moyasar lists for the order, or false for a failed listing. */
    listed?: (orderId: string) => string[] | false;
  } = {},
): FakeMoyasar & { listedFor: string[] } {
  const intents: FakeMoyasar["intents"] = [];
  const cancelled: string[] = [];
  const listedFor: string[] = [];
  const client = {
    async listPaymentsByOrder(orderId: string) {
      listedFor.push(orderId);
      const statuses = opts.listed ? opts.listed(orderId) : [];
      if (statuses === false) return { ok: false as const, status: 502, type: "network", message: "x" };
      return { ok: true as const, data: statuses.map((status, i) => ({ id: `p${i}`, status, metadata: { order_id: orderId } })) };
    },
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
  return { client, intents, cancelled, listedFor };
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
  billing: "yearly",
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
  const q = quote("lawyer-pro", "yearly");
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
    callbackUrl: `https://nezamy.sa/payments/result?order=${NEW_ORDER}`,
    expiresAt: null,
  });
  assert.equal(q.totalHalalas, 458850);

  const [ins] = inserts(log);
  assert.deepEqual(ins.payload, {
    user_id: USER,
    merchant: "platform",
    kind: "plan",
    item_id: "lawyer-pro",
    billing: "yearly",
    net_halalas: 399000,
    vat_halalas: 59850,
    total_halalas: 458850,
    vat_mode: "exclusive",
    currency: "SAR",
    status: "created",
    source: "checkout",
    metadata: { user_email: "buyer@example.test" },
  });

  assert.deepEqual(m.intents, [
    {
      amountHalalas: 458850,
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

test("٢٥٨: the library is VAT-exclusive for every buyer — a company pays VAT on top like a lawyer", async () => {
  for (const [type, total, mode] of [["corporate", 120750, "exclusive"], ["lawyer", 120750, "exclusive"]] as const) {
    const { client: admin, log } = db(type);
    const r = await startCheckoutWith({ admin, client: moyasar().client, now: () => NOW }, input({ itemId: "lib-q1", billing: "once" }));
    assert.equal(r.status, 200, type);
    assert.equal((inserts(log)[0].payload as { total_halalas: number }).total_halalas, total, type);
    assert.equal((inserts(log)[0].payload as { vat_mode: string }).vat_mode, mode, type);
  }
});

test("LIVE-F05: an individual cannot buy the library through the API (403, no order, no intent)", async () => {
  for (const itemId of ["lib-q1", "lib-q2", "lib-annual"]) {
    const { client: admin, log } = db("individual");
    const m = moyasar();
    const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input({ itemId, billing: "once" }));
    assert.deepEqual(r, { status: 403, body: { error: AUDIENCE_REFUSED_AR } }, itemId);
    assert.equal(inserts(log).length, 0, itemId);
    assert.equal(m.intents.length, 0, itemId);
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

test("the response carries the intent's callback URL (from the server origin) and its expiry", async () => {
  const { client: admin } = db("lawyer");
  const m = moyasar();
  const expiring = {
    ...m.client,
    createIntent: async (i: Parameters<typeof m.client.createIntent>[0]) => {
      const r = await m.client.createIntent(i);
      return r.ok ? { ...r, data: { ...r.data, expiresAt: "2026-10-22T11:00:00.000Z" } } : r;
    },
  };
  const r = await startCheckoutWith({ admin, client: expiring, now: () => NOW }, input());
  assert.equal(r.status, 200);
  if (r.status !== 200) return;
  // the same URL the intent was created with — never the browser's origin
  assert.equal(r.body.callbackUrl, `https://nezamy.sa/payments/result?order=${NEW_ORDER}`);
  assert.equal(m.intents.at(-1)?.callbackUrl, r.body.callbackUrl);
  assert.equal(r.body.expiresAt, "2026-10-22T11:00:00.000Z");
});

test("retire, never delete: a retired plan is refused at checkout (410, no order, no intent)", async () => {
  const catalog = buildCatalog({
    ...PRICE_BOOK,
    "lawyer-pro": { ...PRICE_BOOK["lawyer-pro"], retired: true },
  });
  const { client: admin, log } = db("lawyer");
  const m = moyasar();
  const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW, catalog }, input({ billing: "yearly" }));
  assert.equal(r.status, 410);
  assert.deepEqual(r.body, { error: NOT_FOR_SALE_AR });
  assert.equal(inserts(log).length, 0, "no order");
  assert.equal(m.intents.length, 0, "no intent");
});

test("a retired CYCLE (lawyer-pro monthly, owner 26 Oct) is refused with 410 from the real book — no order, no intent", async () => {
  const { client: admin, log } = db("lawyer");
  const m = moyasar();
  const r = await startCheckoutWithBook({ admin, client: m.client, now: () => NOW }, input({ billing: "monthly" }));
  assert.equal(r.status, 410);
  assert.deepEqual(r.body, { error: NOT_FOR_SALE_AR });
  assert.equal(inserts(log).length, 0, "no order");
  assert.equal(m.intents.length, 0, "no intent");
});

test("a cycle the item is not sold in (quarterly before P2) is refused with 400", async () => {
  const { client: admin, log } = db("lawyer");
  const m = moyasar();
  const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input({ billing: "quarterly" }));
  assert.equal(r.status, 400);
  assert.equal(inserts(log).length, 0);
});

// ── coupons (P7, owner answers of 25 Oct; pricing doc §13أ) ─────────────────

const COUPON_ID = "00000000-0000-0000-0000-0000000c0050";
// A fixed-50 coupon OPEN to plans (min 200, top-ups excluded) — NZAMY50's
// shape until owner ٤٣٦. The plan checkout mechanics are tested on it.
const PLAN50_ROW = {
  id: COUPON_ID,
  code: "PLAN50",
  discount_type: "fixed",
  discount_value: "50.00",
  min_order_amount: "200.00",
  eligible_user_types: [],
  max_uses: null,
  used_count: 0,
  valid_from: "2026-06-01T00:00:00Z",
  valid_until: "2027-12-31T23:59:59Z",
  active: true,
  max_discount_pct: "25.00",
  excluded_kinds: ["topup"],
};
const NEWCLIENT_ROW = { ...PLAN50_ROW, code: "NEWCLIENT", discount_value: 75, min_order_amount: 300, excluded_kinds: ["plan", "library", "topup"] };
/** Owner ٤٣٦: NZAMY50 after 20261107_50 — single services only. */
const NZAMY50_ROW = { ...PLAN50_ROW, code: "NZAMY50", excluded_kinds: ["topup", "plan", "library"] };

/** db() plus the coupon tables: `paidWithCoupon` = a paid order of this buyer already carried it. */
function couponDb(
  userType: string,
  opts: {
    row?: Record<string, unknown> | null;
    paidWithCoupon?: boolean;
    usage?: boolean;
    couponErr?: { code: string; message: string };
    /** The buyer's paid / refunded orders carrying the coupon (overrides paidWithCoupon). */
    paidRows?: Array<Record<string, unknown>>;
    /** The buyer's OPEN orders carrying the coupon. */
    openRows?: Array<Record<string, unknown>>;
    /** ٣٠٥: the buyer's earlier paid order of ANY item (the first-order read), or a failed read. */
    earlierPaid?: "paid" | "refunded" | "test_mode" | "already_entitled" | "error";
    insertErr?: { code: string; message: string };
  } = {},
) {
  return db(userType, (q) => {
    if (q.table === "coupons") {
      if (opts.couponErr) return { error: opts.couponErr };
      return { data: opts.row === undefined ? PLAN50_ROW : opts.row };
    }
    if (q.table === "coupon_usage") return { data: opts.usage ? [{ id: 1 }] : [] };
    if (
      opts.earlierPaid &&
      q.table === "payment_orders" &&
      q.op === "select" &&
      !has(q, "eq", "metadata->coupon->>id") &&
      (q.filters.find(([k, c]) => k === "in" && c === "status")?.[2] as string[] | undefined)?.join() === "paid,refunded"
    ) {
      if (opts.earlierPaid === "error") return { error: { code: "57014", message: "timeout" } };
      if (opts.earlierPaid === "test_mode") return { data: [{ id: "earlier-any", live: false, metadata: {} }] };
      if (opts.earlierPaid === "already_entitled") return { data: [{ id: "earlier-any", live: true, metadata: { already_entitled: true } }] };
      return { data: [{ id: "earlier-any", live: true, metadata: {} }] };
    }
    if (q.table === "payment_orders" && q.op === "insert" && opts.insertErr) return { error: opts.insertErr };
    if (q.table === "payment_orders" && q.op === "select" && has(q, "eq", "metadata->coupon->>id")) {
      const statuses = q.filters.find(([k, c]) => k === "in" && c === "status")?.[2] as string[] | undefined;
      if (statuses?.includes("created")) return { data: opts.openRows ?? [] };
      return { data: opts.paidRows ?? (opts.paidWithCoupon ? [{ id: "earlier", live: true, metadata: {} }] : []) };
    }
    return undefined;
  });
}

const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60 * 1000).toISOString();
const openRow = (over: Record<string, unknown> = {}) => ({
  id: "00000000-0000-0000-0000-0000000c0de1",
  item_id: "lib-q1",
  status: "initiated",
  created_at: minutesAgo(5),
  moyasar_intent_id: "pi_other",
  moyasar_payment_id: null,
  ...over,
});
const closes = (log: FakeQuery[], id: string) =>
  updates(log).filter((q) => has(q, "eq", "id", id) && (q.payload as { status?: string }).status === "cancelled");

test("coupon: PLAN50 on the 1,490 SAR plan — the stored order and the intent carry the DISCOUNTED net, VAT on it, and the coupon", async () => {
  const { client: admin, log } = couponDb("individual");
  const m = moyasar();
  const r = await startCheckoutWith(
    { admin, client: m.client, now: () => NOW },
    input({ itemId: "ind-preventive", billing: "yearly", couponCode: "PLAN50" }),
  );
  assert.equal(r.status, 200);
  // 1,490 − 50 = 1,440 net; VAT 216; total 1,656
  const [ins] = inserts(log);
  const p = ins.payload as Record<string, unknown>;
  assert.equal(p.net_halalas, 144000);
  assert.equal(p.vat_halalas, 21600);
  assert.equal(p.total_halalas, 165600);
  assert.deepEqual(p.metadata, {
    user_email: "buyer@example.test",
    coupon: { id: COUPON_ID, code: "PLAN50", discount_halalas: 5000, list_net_halalas: 149000 },
  });
  // the amount charged is the stored total — fulfilment compares the paid amount to it
  assert.equal(m.intents[0].amountHalalas, 165600);
  if (r.status !== 200) throw new Error("unreachable");
  assert.equal(r.body.amountHalalas, 165600);
  assert.deepEqual(r.body.quote, {
    net: 144000,
    vat: 21600,
    total: 165600,
    vatMode: "exclusive",
    listNet: 149000,
    discount: 5000,
    couponCode: "PLAN50",
  });
  // the coupon is NOT consumed at checkout: nothing is written to coupon_usage
  assert.equal(log.filter((q) => q.table === "coupon_usage" && q.op === "insert").length, 0);
});

test("coupon: below the minimum (a 149 SAR monthly plan, PLAN50 needs 200) is refused — no order, no intent", async () => {
  const { client: admin, log } = couponDb("individual");
  const m = moyasar();
  const r = await startCheckoutWith(
    { admin, client: m.client, now: () => NOW },
    input({ itemId: "ind-preventive", billing: "monthly", couponCode: "PLAN50" }),
  );
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: "يتطلب هذا الكود طلباً بقيمة ٢٠٠ ر.س على الأقل قبل الضريبة" });
  assert.equal(inserts(log).length, 0);
  assert.equal(m.intents.length, 0);
});

test("coupon: the cap — a 500 SAR coupon on the 249 SAR plan takes 25 % (62.25), never more", async () => {
  const { client: admin, log } = couponDb("individual", { row: { ...PLAN50_ROW, discount_value: 500, min_order_amount: 0 } });
  const r = await startCheckoutWith(
    { admin, client: moyasar().client, now: () => NOW },
    input({ itemId: "ind-ai", billing: "yearly", couponCode: "PLAN50" }),
  );
  assert.equal(r.status, 200);
  const p = inserts(log)[0].payload as Record<string, number>;
  assert.equal(p.net_halalas, 24900 - 6225);
  assert.equal(p.vat_halalas, Math.round((24900 - 6225) * 0.15));
  assert.equal(p.total_halalas, p.net_halalas + p.vat_halalas);
});

test("coupon: once per user — a PAID earlier order with it refuses the second (generic sentence); a FAILED one does not count", async () => {
  {
    const { client: admin, log } = couponDb("individual", { paidWithCoupon: true });
    const r = await startCheckoutWith(
      { admin, client: moyasar().client, now: () => NOW },
      input({ itemId: "ind-preventive", billing: "yearly", couponCode: "PLAN50" }),
    );
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { error: "كود الخصم غير صالح أو منتهي الصلاحية" });
    assert.equal(inserts(log).length, 0);
    // the use is read from PAID / REFUNDED orders of this buyer only
    const read = log.find((q) => q.table === "payment_orders" && has(q, "eq", "metadata->coupon->>id", COUPON_ID));
    assert.ok(read && has(read, "eq", "user_id", USER));
    assert.deepEqual(read.filters.find(([k, c]) => k === "in" && c === "status")?.[2], ["paid", "refunded"]);
  }
  {
    // the ledger row alone also refuses it
    const { client: admin } = couponDb("individual", { usage: true });
    const r = await startCheckoutWith(
      { admin, client: moyasar().client, now: () => NOW },
      input({ itemId: "ind-preventive", billing: "yearly", couponCode: "PLAN50" }),
    );
    assert.equal(r.status, 400);
  }
  {
    // a failed / cancelled first order is not paid: the paid-orders read finds nothing, the coupon applies
    const { client: admin } = couponDb("individual", { paidWithCoupon: false });
    const r = await startCheckoutWith(
      { admin, client: moyasar().client, now: () => NOW },
      input({ itemId: "ind-preventive", billing: "yearly", couponCode: "PLAN50" }),
    );
    assert.equal(r.status, 200);
  }
});

test("coupon: never on a point top-up, and NEWCLIENT / NZAMY50 (single services, owner ٤٣٦) not on a plan or the library — 400, no order", async () => {
  // The library is sold to professionals only (LIVE-F05), so its case is a lawyer's.
  const cases: Array<[Record<string, unknown> & { code: string }, string, "once" | "yearly", string]> = [
    [PLAN50_ROW, "topup-250", "once", "individual"],
    [NEWCLIENT_ROW, "ind-litigation", "yearly", "individual"],
    [NEWCLIENT_ROW, "lib-q1", "once", "lawyer"],
    [NZAMY50_ROW, "ind-preventive", "yearly", "individual"],
    [NZAMY50_ROW, "lawyer-pro", "yearly", "lawyer"],
    [NZAMY50_ROW, "lib-q1", "once", "lawyer"],
    [NZAMY50_ROW, "topup-1000", "once", "lawyer"],
  ];
  for (const [row, itemId, billing, type] of cases) {
    const { client: admin, log } = couponDb(type, { row });
    const m = moyasar();
    // A budget of its own: seven refusals here must not spend the shared
    // per-buyer coupon budget the later tests rely on.
    const r = await startCheckoutWith(
      { admin, client: m.client, now: () => NOW, attempts: createCouponAttemptBudget() },
      input({ itemId, billing, couponCode: row.code }),
    );
    assert.equal(r.status, 400, itemId);
    assert.deepEqual(r.body, { error: "كود الخصم لا ينطبق على هذا المنتج" }, itemId);
    assert.equal(inserts(log).length, 0, itemId);
    assert.equal(m.intents.length, 0, itemId);
  }
});

test("coupon: ٢٧٩ no stacking — an item at a RUNNING launch price takes no coupon; once the campaign is over it does", async () => {
  const book = {
    ...PRE_Q329_BOOK,
    "ind-preventive": { ...PRE_Q329_BOOK["ind-preventive"], launchPrices: [{ campaignId: "launch-2026", prices: { yearly: 990 } }] },
  };
  {
    const { client: admin, log } = couponDb("individual");
    const r = await startCheckoutWith(
      { admin, client: moyasar().client, now: () => IN_LAUNCH, book, attempts: createCouponAttemptBudget() },
      input({ itemId: "ind-preventive", billing: "yearly", couponCode: "PLAN50" }),
    );
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { error: "كود الخصم لا ينطبق على هذا المنتج" });
    assert.equal(inserts(log).length, 0);
  }
  for (const now of [NOW, AFTER_LAUNCH]) {
    // before 25 Oct and after 25 Jan the item is at its listed price: the coupon applies
    const { client: admin, log } = couponDb("individual");
    const r = await startCheckoutWith(
      { admin, client: moyasar().client, now: () => now, book, attempts: createCouponAttemptBudget() },
      input({ itemId: "ind-preventive", billing: "yearly", couponCode: "PLAN50" }),
    );
    assert.equal(r.status, 200, now.toISOString());
    assert.equal((inserts(log)[0].payload as { net_halalas: number }).net_halalas, 149000 - 5000, now.toISOString());
  }
  {
    // the other cycle of the same item has no launch price: the coupon applies even during the campaign
    const { client: admin } = couponDb("individual");
    const r = await startCheckoutWith(
      { admin, client: moyasar().client, now: () => IN_LAUNCH, book, attempts: createCouponAttemptBudget() },
      input({ itemId: "ind-preventive", billing: "monthly", couponCode: "PLAN50", }),
    );
    assert.equal(r.status, 400, "monthly 149 is under PLAN50's 200 minimum — refused for the minimum, not the launch");
    assert.deepEqual(r.body, { error: "يتطلب هذا الكود طلباً بقيمة ٢٠٠ ر.س على الأقل قبل الضريبة" });
  }
});

// ── ٣٠٣: the launch price is charged by the request's clock ──────────────────

const IN_LAUNCH = new Date("2026-12-01T09:00:00.000Z");
const AFTER_LAUNCH = new Date("2027-01-25T21:00:00.000Z"); // 26 Jan 00:00 Riyadh

test("٣٠٣: during the campaign checkout charges the launch price — order, intent and answer — and records the listed one", async () => {
  const { client: admin, log } = db("firm");
  const m = moyasar();
  const r = await startCheckoutWithBook({ admin, client: m.client, now: () => IN_LAUNCH }, input({ itemId: "firm-basic", billing: "yearly" }));
  assert.equal(r.status, 200);
  const p = inserts(log)[0].payload as Record<string, unknown>;
  assert.equal(p.net_halalas, 841500);
  assert.equal(p.vat_halalas, 126225);
  assert.equal(p.total_halalas, 967725);
  assert.deepEqual((p.metadata as Record<string, unknown>).launch, { campaign_id: "launch-2026", list_net_halalas: 990000 });
  assert.equal(m.intents[0].amountHalalas, 967725);
  const body = r.body as { quote: Record<string, unknown> };
  assert.deepEqual(body.quote, { net: 841500, vat: 126225, total: 967725, vatMode: "exclusive", launchListNet: 990000 });
});

test("٣٠٣: the day after the campaign the listed price is charged and nothing names a launch", async () => {
  const { client: admin, log } = db("firm");
  const r = await startCheckoutWithBook({ admin, client: moyasar().client, now: () => AFTER_LAUNCH }, input({ itemId: "firm-basic", billing: "yearly" }));
  assert.equal(r.status, 200);
  const p = inserts(log)[0].payload as Record<string, unknown>;
  assert.equal(p.net_halalas, 990000);
  assert.equal((p.metadata as Record<string, unknown>).launch, undefined);
  assert.equal((r.body as { quote: Record<string, unknown> }).quote.launchListNet, undefined);
});

// ── q329 (owner package of 1 Nov 2026): the cancelled individual plans ──────

test("q329: the real book refuses every cancelled individual plan and cycle with 410 — no order, no intent", async () => {
  const cases: Array<[string, CheckoutInput["billing"]]> = [
    ["ind-ai", "monthly"],
    ["ind-ai", "quarterly"],
    ["ind-ai", "semiannual"],
    ["ind-preventive", "monthly"],
    ["ind-preventive", "yearly"],
    ["ind-litigation", "monthly"],
    ["ind-litigation", "yearly"],
  ];
  for (const [itemId, billing] of cases) {
    for (const now of [NOW, IN_LAUNCH]) {
      const { client: admin, log } = db("individual");
      const m = moyasar();
      const r = await startCheckoutWithBook({ admin, client: m.client, now: () => now }, input({ itemId, billing }));
      assert.equal(r.status, 410, `${itemId} ${billing}`);
      assert.deepEqual(r.body, { error: NOT_FOR_SALE_AR }, `${itemId} ${billing}`);
      assert.equal(inserts(log).length, 0, `${itemId} ${billing}: no order`);
      assert.equal(m.intents.length, 0, `${itemId} ${billing}: no intent`);
    }
  }
});

test("q329: ind-ai yearly still sells at 249 before VAT, and during the campaign too (its 199 launch price is retired)", async () => {
  for (const now of [NOW, IN_LAUNCH]) {
    const { client: admin, log } = db("individual");
    const m = moyasar();
    const r = await startCheckoutWithBook({ admin, client: m.client, now: () => now }, input({ itemId: "ind-ai", billing: "yearly" }));
    assert.equal(r.status, 200, now.toISOString());
    const p = inserts(log)[0].payload as Record<string, unknown>;
    assert.equal(p.net_halalas, 24900);
    assert.equal(p.vat_halalas, 3735);
    assert.equal(p.total_halalas, 28635);
    assert.equal((p.metadata as Record<string, unknown>).launch, undefined);
    assert.equal(m.intents[0].amountHalalas, 28635);
  }
});

// ── ٣٠٥: NEWCLIENT is for the buyer's first paid order on the platform ───────

// S6-T10: the first-order rule is the ROW's flag (20261030_16 / 20261103_21), never the name.
// Exported fixtures: Task 9 (S1-T19, ruling R16) reuses FIRST_ORDER_ROW and EXCLUDED_ITEM_ROW.
export const FIRST_ORDER_ROW = {
  ...NEWCLIENT_ROW,
  min_order_amount: 0,
  excluded_kinds: ["topup"],
  metadata: { first_paid_order_only: true, first_order_rule: "20261103_21" },
};
const earlierPaidRead = (log: FakeQuery[]) =>
  log.find((q) => q.table === "payment_orders" && q.op === "select" && !has(q, "eq", "metadata->coupon->>id") && has(q, "eq", "user_id", USER)
    && (q.filters.find(([k, c]) => k === "in" && c === "status")?.[2] as string[] | undefined)?.join() === "paid,refunded");

test("٣٠٥: NEWCLIENT with any earlier paid order of this buyer (any item) is refused with the generic sentence — no order", async () => {
  for (const status of ["paid", "refunded"] as const) {
    const { client: admin, log } = couponDb("individual", { row: FIRST_ORDER_ROW, earlierPaid: status });
    const m = moyasar();
    const r = await startCheckoutWith(
      { admin, client: m.client, now: () => NOW, attempts: createCouponAttemptBudget() },
      input({ itemId: "ind-preventive", billing: "yearly", couponCode: "NEWCLIENT" }),
    );
    assert.equal(r.status, 400, status);
    assert.deepEqual(r.body, { error: "كود الخصم غير صالح أو منتهي الصلاحية" }, status);
    assert.equal(inserts(log).length, 0, status);
    assert.equal(m.intents.length, 0, status);
  }
});

test("٣٠٥: NEWCLIENT on the buyer's first paid order applies; the read is this buyer's paid / refunded orders, not the coupon's", async () => {
  const { client: admin, log } = couponDb("individual", { row: FIRST_ORDER_ROW });
  const r = await startCheckoutWith(
    { admin, client: moyasar().client, now: () => NOW, attempts: createCouponAttemptBudget() },
    input({ itemId: "ind-preventive", billing: "yearly", couponCode: "NEWCLIENT" }),
  );
  assert.equal(r.status, 200);
  assert.equal((inserts(log)[0].payload as { net_halalas: number }).net_halalas, 149000 - 7500);
  assert.ok(earlierPaidRead(log), "the first-order read ran");
});

test("٣٠٥: a test-mode payment or a paid order that granted nothing is not a first paid order — NEWCLIENT still applies", async () => {
  for (const earlierPaid of ["test_mode", "already_entitled"] as const) {
    const { client: admin, log } = couponDb("individual", { row: FIRST_ORDER_ROW, earlierPaid });
    const r = await startCheckoutWith(
      { admin, client: moyasar().client, now: () => NOW, attempts: createCouponAttemptBudget() },
      input({ itemId: "ind-preventive", billing: "yearly", couponCode: "NEWCLIENT" }),
    );
    assert.equal(r.status, 200, earlierPaid);
    assert.equal((inserts(log)[0].payload as { net_halalas: number }).net_halalas, 149000 - 7500, earlierPaid);
  }
});

test("٣٠٥: a code that is not first-order-only never reads the buyer's other orders", async () => {
  const { client: admin, log } = couponDb("individual");
  const r = await startCheckoutWith(
    { admin, client: moyasar().client, now: () => NOW, attempts: createCouponAttemptBudget() },
    input({ itemId: "ind-preventive", billing: "yearly", couponCode: "PLAN50" }),
  );
  assert.equal(r.status, 200);
  assert.equal(earlierPaidRead(log), undefined);
});

test("٣٠٥: a failed read of the earlier orders is 503, never the discount", async () => {
  const { client: admin, log } = couponDb("individual", { row: FIRST_ORDER_ROW, earlierPaid: "error" });
  const r = await startCheckoutWith(
    { admin, client: moyasar().client, now: () => NOW, attempts: createCouponAttemptBudget() },
    input({ itemId: "ind-preventive", billing: "yearly", couponCode: "NEWCLIENT" }),
  );
  assert.equal(r.status, 503);
  assert.deepEqual(r.body, { error: "أكواد الخصم غير متاحة حالياً" });
  assert.equal(inserts(log).length, 0);
});

test("S6: NEWCLIENT whose row is not flagged (an admin un-ticked it) is an ordinary coupon — an earlier paid order does not refuse it, and nothing reads it", async () => {
  const unticked = { ...FIRST_ORDER_ROW, metadata: { first_paid_order_only: false, first_order_rule: "20261103_21" } };
  const { client: admin, log } = couponDb("individual", { row: unticked, earlierPaid: "paid" });
  const r = await startCheckoutWith(
    { admin, client: moyasar().client, now: () => NOW, attempts: createCouponAttemptBudget() },
    input({ itemId: "ind-preventive", billing: "yearly", couponCode: "NEWCLIENT" }),
  );
  assert.equal(r.status, 200);
  assert.equal((inserts(log)[0].payload as { net_halalas: number }).net_halalas, 149000 - 7500);
  assert.equal(earlierPaidRead(log), undefined, "the first-order read never ran");
});

test("S6: a first-order coupon is first-order by its FLAG — another code marked first_paid_order_only is refused after an earlier paid order", async () => {
  const marked = { ...FIRST_ORDER_ROW, code: "WELCOME1" };
  const { client: admin, log } = couponDb("individual", { row: marked, earlierPaid: "paid" });
  const r = await startCheckoutWith(
    { admin, client: moyasar().client, now: () => NOW, attempts: createCouponAttemptBudget() },
    input({ itemId: "ind-preventive", billing: "yearly", couponCode: "WELCOME1" }),
  );
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: "كود الخصم غير صالح أو منتهي الصلاحية" });
  assert.equal(inserts(log).length, 0);
});

// metadata.excluded_items names a price-book id the coupon never discounts (S6-T10)
export const EXCLUDED_ITEM_ROW = { ...PLAN50_ROW, metadata: { excluded_items: ["ind-preventive"] } };

test("S6: excluded_items — the named item is refused (400 «لا ينطبق على هذا المنتج»), no order, no intent; another item still takes the coupon", async () => {
  {
    const { client: admin, log } = couponDb("individual", { row: EXCLUDED_ITEM_ROW });
    const m = moyasar();
    const r = await startCheckoutWith(
      { admin, client: m.client, now: () => NOW, attempts: createCouponAttemptBudget() },
      input({ itemId: "ind-preventive", billing: "yearly", couponCode: "PLAN50" }),
    );
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { error: "كود الخصم لا ينطبق على هذا المنتج" });
    assert.equal(inserts(log).length, 0);
    assert.equal(m.intents.length, 0);
  }
  {
    const { client: admin, log } = couponDb("individual", { row: EXCLUDED_ITEM_ROW });
    const r = await startCheckoutWith(
      { admin, client: moyasar().client, now: () => NOW, attempts: createCouponAttemptBudget() },
      input({ itemId: "ind-litigation", billing: "yearly", couponCode: "PLAN50" }),
    );
    assert.equal(r.status, 200);
    assert.equal((inserts(log)[0].payload as { item_id: string; net_halalas: number }).item_id, "ind-litigation");
    assert.equal((inserts(log)[0].payload as { net_halalas: number }).net_halalas, 399000 - 5000);
  }
});

test("S6 race: two checkouts with NEWCLIENT at once — the database's once-per-(buyer, coupon) index refuses the second insert with the same 400", async () => {
  const { client: admin } = couponDb("individual", {
    row: FIRST_ORDER_ROW,
    insertErr: { code: "23505", message: 'duplicate key value violates unique constraint "payment_orders_coupon_once_key"' },
  });
  const m = moyasar();
  const r = await startCheckoutWith(
    { admin, client: m.client, now: () => NOW, attempts: createCouponAttemptBudget() },
    input({ itemId: "ind-preventive", billing: "yearly", couponCode: "NEWCLIENT" }),
  );
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: COUPON_PENDING_AR });
  assert.equal(m.intents.length, 0);
});

test("coupon: an unknown code is the generic 400; before 20261026_20 (no max_discount_pct) a code is 503, never the full price", async () => {
  {
    const { client: admin, log } = couponDb("individual", { row: null });
    const r = await startCheckoutWith(
      { admin, client: moyasar().client, now: () => NOW },
      input({ itemId: "ind-preventive", billing: "yearly", couponCode: "GUESS1" }),
    );
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { error: "كود الخصم غير صالح أو منتهي الصلاحية" });
    assert.equal(inserts(log).length, 0);
  }
  {
    const { client: admin, log } = couponDb("individual", {
      couponErr: { code: "42703", message: "column coupons.max_discount_pct does not exist" },
    });
    const m = moyasar();
    const r = await startCheckoutWith(
      { admin, client: m.client, now: () => NOW },
      input({ itemId: "ind-preventive", billing: "yearly", couponCode: "PLAN50" }),
    );
    assert.equal(r.status, 503);
    assert.deepEqual(r.body, { error: "أكواد الخصم غير متاحة حالياً" });
    assert.equal(inserts(log).length, 0);
    assert.equal(m.intents.length, 0);
  }
});

test("coupon: no couponCode — nothing reads the coupon tables and the order is exactly as before", async () => {
  const { client: admin, log } = couponDb("individual");
  const r = await startCheckoutWith({ admin, client: moyasar().client, now: () => NOW }, input({ itemId: "ind-preventive", billing: "yearly" }));
  assert.equal(r.status, 200);
  assert.equal(log.filter((q) => q.table === "coupons" || q.table === "coupon_usage").length, 0);
  assert.deepEqual((inserts(log)[0].payload as { metadata: unknown }).metadata, { user_email: "buyer@example.test" });
});

// ── P7 review, finding 1: one code, one open order ──────────────────────────

const NZ_INPUT = { itemId: "ind-preventive", billing: "yearly" as const, couponCode: "PLAN50" };

test("coupon twice in two tabs: a payable open order of ANOTHER item carrying the code refuses it — 400, no order, no intent, nothing closed", async () => {
  const { client: admin, log } = couponDb("individual", { openRows: [openRow()] });
  const m = moyasar();
  const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input(NZ_INPUT));
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: COUPON_PENDING_AR });
  assert.equal(COUPON_PENDING_AR, "هذا الكود مستخدم في طلب آخر قيد الدفع — أكمل ذلك الطلب أو ألغِه");
  assert.equal(inserts(log).length, 0);
  assert.equal(m.intents.length, 0);
  assert.equal(closes(log, openRow().id).length, 0);
  // the read is this buyer's OPEN orders carrying this coupon
  const read = log.find(
    (q) =>
      q.table === "payment_orders" &&
      has(q, "eq", "metadata->coupon->>id", COUPON_ID) &&
      ((q.filters.find(([k, c]) => k === "in" && c === "status")?.[2] as string[] | undefined) ?? []).includes("initiated"),
  );
  assert.ok(read && has(read, "eq", "user_id", USER));
});

test("coupon: reopening checkout of the SAME item with the code is not refused — the earlier order is superseded", async () => {
  const same = openRow({ item_id: "ind-preventive", moyasar_intent_id: "pi_same" });
  const { client: admin } = couponDb("individual", { openRows: [same] });
  const m = moyasar();
  const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input(NZ_INPUT));
  assert.equal(r.status, 200);
  assert.equal(m.listedFor.length, 0, "a fresh order is never listed at Moyasar");
});

test("coupon: an open order a payment already reached refuses the code even after its intent expired; it is never closed", async () => {
  const reached = openRow({ created_at: minutesAgo(120), moyasar_payment_id: "pay_inflight" });
  const { client: admin, log } = couponDb("individual", { openRows: [reached] });
  const m = moyasar();
  const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input(NZ_INPUT));
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: COUPON_PENDING_AR });
  assert.equal(closes(log, reached.id).length, 0);
});

test("coupon: an expired order that never had an intent is closed without asking Moyasar, and the checkout goes on", async () => {
  const abandoned = openRow({ status: "created", moyasar_intent_id: null, created_at: minutesAgo(90) });
  const { client: admin, log } = couponDb("individual", { openRows: [abandoned] });
  const m = moyasar();
  const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input(NZ_INPUT));
  assert.equal(r.status, 200);
  assert.equal(m.listedFor.length, 0);
  const [close] = closes(log, abandoned.id);
  assert.ok(close, "closed");
  assert.ok(has(close, "eq", "user_id", USER) && has(close, "is", "moyasar_payment_id", null));
  assert.deepEqual(close.filters.find(([k, c]) => k === "in" && c === "status")?.[2], ["created", "initiated"]);
  assert.ok(log.indexOf(close) < log.indexOf(inserts(log)[0]), "closed before the new order");
});

test("coupon: an expired intent is closed only when Moyasar lists nothing for it but failed payments; a live payment keeps it; a failed listing is 503", async () => {
  const expired = openRow({ created_at: minutesAgo(70) });
  {
    const { client: admin, log } = couponDb("individual", { openRows: [expired] });
    const m = moyasar({ listed: () => ["failed"] });
    const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input(NZ_INPUT));
    assert.equal(r.status, 200);
    assert.deepEqual(m.listedFor, [expired.id]);
    assert.equal(closes(log, expired.id).length, 1);
  }
  for (const status of ["paid", "initiated", "authorized"]) {
    const { client: admin, log } = couponDb("individual", { openRows: [expired] });
    const m = moyasar({ listed: () => ["failed", status] });
    const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input(NZ_INPUT));
    assert.equal(r.status, 400, status);
    assert.deepEqual(r.body, { error: COUPON_PENDING_AR }, status);
    assert.equal(closes(log, expired.id).length, 0, status);
    assert.equal(inserts(log).length, 0, status);
  }
  {
    const { client: admin, log } = couponDb("individual", { openRows: [expired] });
    const m = moyasar({ listed: () => false });
    const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input(NZ_INPUT));
    assert.equal(r.status, 503);
    assert.equal(closes(log, expired.id).length, 0);
    assert.equal(inserts(log).length, 0);
  }
});

test("coupon: the database backstop — a unique violation of payment_orders_coupon_once_key at the insert is the same 400; another 23505 is not", async () => {
  {
    const { client: admin } = couponDb("individual", {
      insertErr: { code: "23505", message: 'duplicate key value violates unique constraint "payment_orders_coupon_once_key"' },
    });
    const m = moyasar();
    const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input(NZ_INPUT));
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { error: COUPON_PENDING_AR });
    assert.equal(m.intents.length, 0);
  }
  {
    const { client: admin } = couponDb("individual", {
      insertErr: { code: "23505", message: 'duplicate key value violates unique constraint "payment_orders_receipt_number_key"' },
    });
    const r = await startCheckoutWith({ admin, client: moyasar().client, now: () => NOW }, input(NZ_INPUT));
    assert.equal(r.status, 503);
    assert.deepEqual(r.body, { error: CHECKOUT_FAILED_AR });
  }
});

test("coupon (finding 5): an earlier test-mode payment or an «already entitled» order did not use the code up; a live paid one did", async () => {
  for (const paidRows of [
    [{ id: "t", live: false, metadata: { coupon: {} } }],
    [{ id: "e", live: true, metadata: { coupon: {}, already_entitled: true } }],
  ]) {
    const { client: admin } = couponDb("individual", { paidRows });
    const r = await startCheckoutWith({ admin, client: moyasar().client, now: () => NOW }, input(NZ_INPUT));
    assert.equal(r.status, 200, JSON.stringify(paidRows));
  }
  const { client: admin } = couponDb("individual", { paidRows: [{ id: "l", live: true, metadata: { coupon: {} } }] });
  const r = await startCheckoutWith({ admin, client: moyasar().client, now: () => NOW }, input(NZ_INPUT));
  assert.equal(r.status, 400);
});

// ── P7 review, finding 4: the per-buyer try budget ──────────────────────────

test("coupon tries: every checkout refusal spends one; a spent budget answers 429 before any read; a success and a code-less checkout spend nothing", async () => {
  const attempts = createCouponAttemptBudget({ max: 2, clock: () => NOW.getTime() });
  for (let i = 0; i < 2; i++) {
    const { client: admin } = couponDb("individual", { row: null });
    const r = await startCheckoutWith(
      { admin, client: moyasar().client, now: () => NOW, attempts },
      input({ ...NZ_INPUT, couponCode: `GUESS${i}` }),
    );
    assert.equal(r.status, 400);
  }
  {
    const { client: admin, log } = couponDb("individual");
    const r = await startCheckoutWith({ admin, client: moyasar().client, now: () => NOW, attempts }, input(NZ_INPUT));
    assert.equal(r.status, 429);
    assert.deepEqual(r.body, { error: "طلبات كثيرة — حاول بعد قليل." });
    assert.equal(log.length, 0, "nothing read");
  }
  {
    // the same buyer still checks out without a code
    const { client: admin } = couponDb("individual");
    const r = await startCheckoutWith(
      { admin, client: moyasar().client, now: () => NOW, attempts },
      input({ itemId: "ind-preventive", billing: "yearly" }),
    );
    assert.equal(r.status, 200);
  }
  {
    // a success spends nothing
    const fresh = createCouponAttemptBudget({ max: 1, clock: () => NOW.getTime() });
    for (let i = 0; i < 3; i++) {
      const { client: admin } = couponDb("individual");
      const r = await startCheckoutWith({ admin, client: moyasar().client, now: () => NOW, attempts: fresh }, input(NZ_INPUT));
      assert.equal(r.status, 200, `try ${i}`);
    }
  }
});

test("coupon: an abandoned 3-D Secure order (a payment reached it) blocks for the sweep's 7 days, then is closed when Moyasar lists only failed / initiated payments", async () => {
  const days = (d: number) => minutesAgo(d * 24 * 60);
  {
    // 6 days: the sweep may still settle it — refused, not even listed
    const reached = openRow({ created_at: days(6), moyasar_payment_id: "pay_3ds" });
    const { client: admin, log } = couponDb("individual", { openRows: [reached] });
    const m = moyasar({ listed: () => ["initiated"] });
    const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input(NZ_INPUT));
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { error: COUPON_PENDING_AR });
    assert.equal(m.listedFor.length, 0);
    assert.equal(closes(log, reached.id).length, 0);
  }
  {
    // 8 days, only the abandoned initiated payment: closed on that payment id, the checkout goes on
    const reached = openRow({ created_at: days(8), moyasar_payment_id: "pay_3ds" });
    const { client: admin, log } = couponDb("individual", { openRows: [reached] });
    const m = moyasar({ listed: () => ["initiated", "failed"] });
    const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input(NZ_INPUT));
    assert.equal(r.status, 200);
    const [close] = closes(log, reached.id);
    assert.ok(close && has(close, "eq", "moyasar_payment_id", "pay_3ds") && !has(close, "is", "moyasar_payment_id"));
  }
  for (const listed of [["paid"], ["initiated", "authorized"], []]) {
    // a payment that may have taken money, or Moyasar knowing nothing of it: kept for an admin
    const reached = openRow({ created_at: days(8), moyasar_payment_id: "pay_3ds" });
    const { client: admin, log } = couponDb("individual", { openRows: [reached] });
    const m = moyasar({ listed: () => listed });
    const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input(NZ_INPUT));
    assert.equal(r.status, 400, JSON.stringify(listed));
    assert.equal(closes(log, reached.id).length, 0, JSON.stringify(listed));
  }
});

// ── P3: the founder membership (lawyer-founder-2026) — sale switch, no coupons, a reserved seat ──

const FOUNDER = { itemId: "lawyer-founder-2026", billing: "once" as const };

/** A reserveFounderSeat spy: answers `answer` (or throws it when it is an Error), recording each call and the log length at the call. */
function seatSpy(answer: string | Error, log?: FakeQuery[]) {
  const calls: Array<{ userId: string; orderId: string; logAt: number }> = [];
  const reserveFounderSeat = async (userId: string, orderId: string) => {
    calls.push({ userId, orderId, logAt: log ? log.length : -1 });
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { reserveFounderSeat, calls };
}

const cancels = (log: FakeQuery[]) =>
  updates(log).filter((u) => (u.payload as { status?: string }).status === "cancelled" && has(u, "eq", "id", NEW_ORDER));

test("founder: `reserved` goes on to the Moyasar form — 2,996 + VAT, billed once, no saved card; the seat is reserved after the order is written", async () => {
  const { client: admin, log } = db("lawyer");
  const m = moyasar();
  const seat = seatSpy("reserved", log);
  const r = await startCheckoutWith(
    { admin, client: m.client, now: () => NOW, onSale: true, reserveFounderSeat: seat.reserveFounderSeat },
    input(FOUNDER),
  );
  assert.equal(r.status, 200);
  if (r.status !== 200) throw new Error("unreachable");
  assert.equal(r.body.amountHalalas, 344540);
  assert.equal(r.body.saveCard, false);
  assert.deepEqual(r.body.quote, { net: 299600, vat: 44940, total: 344540, vatMode: "exclusive" });

  const [ins] = inserts(log);
  assert.equal((ins.payload as { kind?: string }).kind, "membership");
  assert.equal((ins.payload as { item_id?: string }).item_id, "lawyer-founder-2026");
  assert.equal(seat.calls.length, 1);
  assert.equal(seat.calls[0].userId, USER);
  assert.equal(seat.calls[0].orderId, NEW_ORDER);
  assert.ok(seat.calls[0].logAt > log.indexOf(ins), "the seat is reserved after the insert");
  assert.equal(m.intents.length, 1);
  assert.equal(cancels(log).length, 0);
});

test("founder: every answer but `reserved` cancels the order, opens no intent, and answers in Arabic", async () => {
  const cases: Array<[string, number, string]> = [
    ["not_verified", 403, "يُتاح اشتراك المؤسس بعد توثيق رخصتك المهنية"],
    ["already_member", 409, "أنت عضو مؤسس بالفعل"],
    ["full", 409, "اكتملت مقاعد المؤسسين"],
    ["closed", 410, "باب الاشتراك مغلق حاليًا"],
    ["paused", 410, "باب الاشتراك مغلق حاليًا"],
  ];
  for (const [answer, status, error] of cases) {
    const { client: admin, log } = db("lawyer");
    const m = moyasar();
    const seat = seatSpy(answer, log);
    const r = await startCheckoutWith(
      { admin, client: m.client, now: () => NOW, onSale: true, reserveFounderSeat: seat.reserveFounderSeat },
      input(FOUNDER),
    );
    assert.equal(r.status, status, answer);
    assert.deepEqual(r.body, { error }, answer);
    assert.equal(seat.calls.length, 1, answer);
    assert.equal(m.intents.length, 0, `${answer}: no intent`);
    const [cancel] = cancels(log);
    assert.ok(cancel, `${answer}: the order is cancelled`);
    assert.ok(has(cancel, "eq", "status", "created"), `${answer}: only while still created`);
  }
});

test("founder: an RPC error (e.g. 22023), a throw or an unknown answer is a safe 503 with the order cancelled — never a 500", async () => {
  for (const answer of [new Error("22023"), "", "something_else", "RESERVED"] as Array<string | Error>) {
    const { client: admin, log } = db("lawyer");
    const m = moyasar();
    const seat = seatSpy(answer, log);
    const r = await startCheckoutWith(
      { admin, client: m.client, now: () => NOW, onSale: true, reserveFounderSeat: seat.reserveFounderSeat },
      input(FOUNDER),
    );
    assert.equal(r.status, 503, String(answer));
    assert.deepEqual(r.body, { error: CHECKOUT_FAILED_AR });
    assert.equal(m.intents.length, 0);
    assert.equal(cancels(log).length, 1, `${String(answer)}: the order is cancelled`);
  }
});

test("founder: without a reserveFounderSeat dependency the membership fails closed — cancelled, 503, no intent", async () => {
  const { client: admin, log } = db("lawyer");
  const m = moyasar();
  const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW, onSale: true }, input(FOUNDER));
  assert.equal(r.status, 503);
  assert.equal(m.intents.length, 0);
  assert.equal(cancels(log).length, 1);
});

test("founder: while the sale switch is off the reply is 410 «باب الاشتراك مغلق حاليًا» and nothing is read or written", async () => {
  const { client: admin, log } = db("lawyer");
  const m = moyasar();
  const seat = seatSpy("reserved", log);
  const r = await startCheckoutWith(
    { admin, client: m.client, now: () => NOW, onSale: false, reserveFounderSeat: seat.reserveFounderSeat },
    input({ ...FOUNDER, couponCode: "PLAN50" }),
  );
  assert.equal(r.status, 410);
  assert.deepEqual(r.body, { error: "باب الاشتراك مغلق حاليًا" });
  assert.equal(inserts(log).length, 0);
  assert.equal(log.length, 0);
  assert.equal(seat.calls.length, 0);
  assert.equal(m.intents.length, 0);
});

test("founder: the sale switch defaults to FOUNDER_MEMBERSHIP_ON_SALE", async () => {
  const { client: admin, log } = db("lawyer");
  const seat = seatSpy("reserved", log);
  const r = await startCheckoutWith(
    { admin, client: moyasar().client, now: () => NOW, reserveFounderSeat: seat.reserveFounderSeat },
    input(FOUNDER),
  );
  if (FOUNDER_MEMBERSHIP_ON_SALE) assert.equal(r.status, 200);
  else {
    assert.equal(r.status, 410);
    assert.equal(inserts(log).length, 0);
  }
});

test("founder: a coupon on the membership is 400 «لا تُطبَّق القسائم على باقة المؤسس» — no coupon read, no order, no try spent", async () => {
  const { client: admin, log } = db("lawyer");
  const seat = seatSpy("reserved", log);
  const budget = createCouponAttemptBudget({ max: 1, windowMs: 60_000 });
  for (let i = 0; i < 3; i++) {
    const r = await startCheckoutWith(
      { admin, client: moyasar().client, now: () => NOW, onSale: true, reserveFounderSeat: seat.reserveFounderSeat, attempts: budget },
      input({ ...FOUNDER, couponCode: "PLAN50" }),
    );
    assert.equal(r.status, 400, `try ${i}`);
    assert.deepEqual(r.body, { error: "لا تُطبَّق القسائم على باقة المؤسس" });
  }
  assert.equal(log.filter((q) => q.table === "coupons").length, 0);
  assert.equal(inserts(log).length, 0);
  assert.equal(seat.calls.length, 0);
  assert.ok(budget.check(USER).ok, "the refusal spent no coupon try");
});

test("founder: a non-lawyer buyer is refused 403 before any order or seat", async () => {
  for (const userType of ["individual", "firm", "corporate"]) {
    const { client: admin, log } = db(userType);
    const seat = seatSpy("reserved", log);
    const r = await startCheckoutWith(
      { admin, client: moyasar().client, now: () => NOW, onSale: true, reserveFounderSeat: seat.reserveFounderSeat },
      input(FOUNDER),
    );
    assert.equal(r.status, 403, userType);
    assert.deepEqual(r.body, { error: AUDIENCE_REFUSED_AR });
    assert.equal(inserts(log).length, 0);
    assert.equal(seat.calls.length, 0);
  }
});

test("founder: a plan, a library pass or a top-up never calls reserveFounderSeat, whatever the sale switch says", async () => {
  const cases: Array<[Partial<CheckoutInput>, string]> = [
    [{}, "lawyer"],
    [{ itemId: "lib-q1", billing: "once" }, "lawyer"],
    [{ itemId: "topup-250", billing: "once" }, "individual"],
  ];
  for (const onSale of [false, true]) {
    for (const [over, userType] of cases) {
      const { client: admin, log } = db(userType);
      const seat = seatSpy("full", log);
      const r = await startCheckoutWith(
        { admin, client: moyasar().client, now: () => NOW, onSale, reserveFounderSeat: seat.reserveFounderSeat },
        input(over),
      );
      assert.equal(r.status, 200, `${JSON.stringify(over)} onSale=${onSale}`);
      assert.equal(seat.calls.length, 0);
      assert.equal(cancels(log).length, 0);
    }
  }
});

// ── P3 Task 5 (R13): a membership order cancelled AFTER its seat was reserved frees the seat at once ──

function releaseSpy(throws = false) {
  const calls: string[] = [];
  const releaseFounderSeat = async (orderId: string) => {
    calls.push(orderId);
    if (throws) throw new Error("rpc down");
  };
  return { releaseFounderSeat, calls };
}

const stampFails = (q: FakeQuery) =>
  q.table === "payment_orders" && q.op === "update" && (q.payload as { status?: string }).status === "initiated"
    ? { error: { code: "40001", message: "serialization" } }
    : undefined;

test("founder (R13): an intent refusal, a stamp failure and a reserve RPC throw free the seat once (founder_release_order) — the reply stays 503", async () => {
  const cases: Array<[string, () => { m: ReturnType<typeof moyasar>; over?: FakeHandler; answer: string | Error }]> = [
    ["intent refused", () => ({ m: moyasar({ intentOk: false }), answer: "reserved" })],
    ["stamp failed", () => ({ m: moyasar(), over: stampFails, answer: "reserved" })],
    ["reserve threw", () => ({ m: moyasar(), answer: new Error("ECONNRESET") })],
  ];
  for (const [name, make] of cases) {
    for (const throws of [false, true]) {
      const { m, over, answer } = make();
      const { client: admin, log } = db("lawyer", over);
      const seat = seatSpy(answer, log);
      const rel = releaseSpy(throws);
      const r = await startCheckoutWith(
        { admin, client: m.client, now: () => NOW, onSale: true, reserveFounderSeat: seat.reserveFounderSeat, releaseFounderSeat: rel.releaseFounderSeat },
        input(FOUNDER),
      );
      assert.deepEqual(r, { status: 503, body: { error: CHECKOUT_FAILED_AR } }, `${name} throws=${throws}`);
      assert.deepEqual(rel.calls, [NEW_ORDER], `${name} throws=${throws}`);
      assert.ok(!JSON.stringify(r).includes("cs_secret_new"));
    }
  }
});

test("founder (R13): a seat refusal reserved nothing, so nothing is released", async () => {
  for (const answer of ["not_verified", "already_member", "full", "closed", "paused"]) {
    const { client: admin, log } = db("lawyer");
    const rel = releaseSpy();
    await startCheckoutWith(
      { admin, client: moyasar().client, now: () => NOW, onSale: true, reserveFounderSeat: seatSpy(answer, log).reserveFounderSeat, releaseFounderSeat: rel.releaseFounderSeat },
      input(FOUNDER),
    );
    assert.equal(rel.calls.length, 0, answer);
  }
  const { client: admin, log } = db("lawyer");
  const rel = releaseSpy();
  const ok = await startCheckoutWith(
    { admin, client: moyasar().client, now: () => NOW, onSale: true, reserveFounderSeat: seatSpy("reserved", log).reserveFounderSeat, releaseFounderSeat: rel.releaseFounderSeat },
    input(FOUNDER),
  );
  assert.equal(ok.status, 200);
  assert.equal(rel.calls.length, 0, "a successful checkout keeps its seat");
});

test("founder (R13): a plan, a library pass or a top-up never calls releaseFounderSeat — intent refused or stamp failed", async () => {
  const cases: Array<[Partial<CheckoutInput>, string]> = [
    [{}, "lawyer"],
    [{ itemId: "lib-q1", billing: "once" }, "lawyer"],
    [{ itemId: "topup-250", billing: "once" }, "individual"],
  ];
  for (const [over, userType] of cases) {
    for (const mode of ["intent", "stamp"] as const) {
      const { client: admin } = db(userType, mode === "stamp" ? stampFails : undefined);
      const rel = releaseSpy();
      const r = await startCheckoutWith(
        { admin, client: moyasar({ intentOk: mode !== "intent" }).client, now: () => NOW, onSale: true, releaseFounderSeat: rel.releaseFounderSeat },
        input(over),
      );
      assert.equal(r.status, 503, `${JSON.stringify(over)} ${mode}`);
      assert.equal(rel.calls.length, 0, `${JSON.stringify(over)} ${mode}`);
    }
  }
});
