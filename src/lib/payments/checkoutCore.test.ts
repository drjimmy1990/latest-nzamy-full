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
import { AUDIENCE_REFUSED_AR, CHECKOUT_FAILED_AR, NOT_FOR_SALE_AR, startCheckoutWith, type CheckoutDeps, type CheckoutInput } from "./checkoutCore.ts";
import { buildCatalog, quote } from "./catalog.ts";
import { PRICE_BOOK } from "../pricing/priceBook.ts";
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

test("٢٥٨: the library is VAT-exclusive for every buyer — an individual pays VAT on top like a lawyer", async () => {
  for (const [type, total, mode] of [["individual", 172500, "exclusive"], ["lawyer", 172500, "exclusive"]] as const) {
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
  const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input({ billing: "monthly" }));
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
const NZAMY50_ROW = {
  id: COUPON_ID,
  code: "NZAMY50",
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
const NEWCLIENT_ROW = { ...NZAMY50_ROW, code: "NEWCLIENT", discount_value: 75, min_order_amount: 300, excluded_kinds: ["plan", "library", "topup"] };

/** db() plus the coupon tables: `paidWithCoupon` = a paid order of this buyer already carried it. */
function couponDb(
  userType: string,
  opts: {
    row?: Record<string, unknown> | null;
    paidWithCoupon?: boolean;
    usage?: boolean;
    couponErr?: { code: string; message: string };
  } = {},
) {
  return db(userType, (q) => {
    if (q.table === "coupons") {
      if (opts.couponErr) return { error: opts.couponErr };
      return { data: opts.row === undefined ? NZAMY50_ROW : opts.row };
    }
    if (q.table === "coupon_usage") return { data: opts.usage ? [{ id: 1 }] : [] };
    if (q.table === "payment_orders" && q.op === "select" && has(q, "eq", "metadata->coupon->>id")) {
      return { data: opts.paidWithCoupon ? [{ id: "earlier" }] : [] };
    }
    return undefined;
  });
}

test("coupon: NZAMY50 on the 1,490 SAR plan — the stored order and the intent carry the DISCOUNTED net, VAT on it, and the coupon", async () => {
  const { client: admin, log } = couponDb("individual");
  const m = moyasar();
  const r = await startCheckoutWith(
    { admin, client: m.client, now: () => NOW },
    input({ itemId: "ind-preventive", billing: "yearly", couponCode: "NZAMY50" }),
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
    coupon: { id: COUPON_ID, code: "NZAMY50", discount_halalas: 5000, list_net_halalas: 149000 },
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
    couponCode: "NZAMY50",
  });
  // the coupon is NOT consumed at checkout: nothing is written to coupon_usage
  assert.equal(log.filter((q) => q.table === "coupon_usage" && q.op === "insert").length, 0);
});

test("coupon: below the minimum (a 149 SAR monthly plan, NZAMY50 needs 200) is refused — no order, no intent", async () => {
  const { client: admin, log } = couponDb("individual");
  const m = moyasar();
  const r = await startCheckoutWith(
    { admin, client: m.client, now: () => NOW },
    input({ itemId: "ind-preventive", billing: "monthly", couponCode: "NZAMY50" }),
  );
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: "يتطلب هذا الكود طلباً بقيمة ٢٠٠ ر.س على الأقل قبل الضريبة" });
  assert.equal(inserts(log).length, 0);
  assert.equal(m.intents.length, 0);
});

test("coupon: the cap — a 500 SAR coupon on the 390 SAR plan takes 25 % (97.50), never more", async () => {
  const { client: admin, log } = couponDb("individual", { row: { ...NZAMY50_ROW, discount_value: 500, min_order_amount: 0 } });
  const r = await startCheckoutWith(
    { admin, client: moyasar().client, now: () => NOW },
    input({ itemId: "ind-ai", billing: "yearly", couponCode: "NZAMY50" }),
  );
  assert.equal(r.status, 200);
  const p = inserts(log)[0].payload as Record<string, number>;
  assert.equal(p.net_halalas, 39000 - 9750);
  assert.equal(p.vat_halalas, Math.round((39000 - 9750) * 0.15));
  assert.equal(p.total_halalas, p.net_halalas + p.vat_halalas);
});

test("coupon: once per user — a PAID earlier order with it refuses the second (generic sentence); a FAILED one does not count", async () => {
  {
    const { client: admin, log } = couponDb("individual", { paidWithCoupon: true });
    const r = await startCheckoutWith(
      { admin, client: moyasar().client, now: () => NOW },
      input({ itemId: "ind-preventive", billing: "yearly", couponCode: "NZAMY50" }),
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
      input({ itemId: "ind-preventive", billing: "yearly", couponCode: "NZAMY50" }),
    );
    assert.equal(r.status, 400);
  }
  {
    // a failed / cancelled first order is not paid: the paid-orders read finds nothing, the coupon applies
    const { client: admin } = couponDb("individual", { paidWithCoupon: false });
    const r = await startCheckoutWith(
      { admin, client: moyasar().client, now: () => NOW },
      input({ itemId: "ind-preventive", billing: "yearly", couponCode: "NZAMY50" }),
    );
    assert.equal(r.status, 200);
  }
});

test("coupon: never on a point top-up, and NEWCLIENT (single services) not on a plan or the library — 400, no order", async () => {
  const cases: Array<[Record<string, unknown> & { code: string }, string, "once" | "yearly"]> = [
    [NZAMY50_ROW, "topup-1000", "once"],
    [NEWCLIENT_ROW, "ind-litigation", "yearly"],
    [NEWCLIENT_ROW, "lib-q1", "once"],
  ];
  for (const [row, itemId, billing] of cases) {
    const { client: admin, log } = couponDb("individual", { row });
    const m = moyasar();
    const r = await startCheckoutWith({ admin, client: m.client, now: () => NOW }, input({ itemId, billing, couponCode: row.code }));
    assert.equal(r.status, 400, itemId);
    assert.deepEqual(r.body, { error: "كود الخصم لا ينطبق على هذا المنتج" }, itemId);
    assert.equal(inserts(log).length, 0, itemId);
    assert.equal(m.intents.length, 0, itemId);
  }
});

test("coupon: ٢٧٩ no stacking — an item already at a launch price takes no coupon", async () => {
  const book = {
    ...PRICE_BOOK,
    "ind-preventive": { ...PRICE_BOOK["ind-preventive"], launchPrices: [{ campaignId: "launch", prices: { yearly: 990 } }] },
  };
  const { client: admin, log } = couponDb("individual");
  const r = await startCheckoutWith(
    { admin, client: moyasar().client, now: () => NOW, book },
    input({ itemId: "ind-preventive", billing: "yearly", couponCode: "NZAMY50" }),
  );
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: "كود الخصم لا ينطبق على هذا المنتج" });
  assert.equal(inserts(log).length, 0);
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
      input({ itemId: "ind-preventive", billing: "yearly", couponCode: "NZAMY50" }),
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
