/**
 * fulfillCore.test.ts — behaviour of fulfillOrderWith against a fake service
 * client and a fake Moyasar client (fix round 1 of B1 Task 5): the order of
 * the steps, the exactly-once stamp and notification, the 23505 paths, the
 * paid_unmatched trace, and the deploy-order fallbacks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { findPaidPaymentWith, fulfillOrderWith, releaseExpiredFounderSeats, type FulfilDeps, type GatewayClient } from "./fulfillCore.ts";
import type { MoyasarPayment } from "./moyasarClient.ts";
import type { GrantLibraryFn } from "./grantPurchase.ts";
import { fakeDb, has, RANKS, type FakeHandler, type FakeQuery } from "./fakeDb.test-helper.ts";
import { buildCatalog } from "./catalog.ts";
import { PRICE_BOOK } from "../pricing/priceBook.ts";

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

test("saved cards keep the verified gateway mode and receipts keep only masked payment details", async () => {
  const row = orderRow({ kind: "plan", item_id: "lawyer-pro", billing: "monthly", total_halalas: 45885 });
  const { client, log } = happyDb(row, q => {
    if (q.table === "payment_methods" && q.op === "insert") return { data: { id: "card-1" } };
    if (q.table === "subscriptions" && q.op === "select") return { data: [] };
    if (q.table === "grant_plan_subscription") return { data: { inserted: true, subscription_id: "sub-1", current_period_end: null } };
    if (q.table === "subscription_plans") return { data: [{ id: "plan-1", tier: "pro", name: "lawyer-pro" }] };
    return undefined;
  });
  const { d } = deps(client, gateway(paymentOf({ amount: 45885, source: { type: "creditcard", token: "token-secret", number: "4111-11XX-XXXX-1111", company: "visa" } })));
  await fulfillOrderWith(d, INPUT);
  const inserted = log.find(q => q.table === "payment_methods" && q.op === "insert");
  assert.equal((inserted?.payload as { live: boolean }).live, false);
  const snapshot = log.find(q => q.table === "merge_payment_order_metadata" && JSON.stringify(q.payload).includes("payment_method"));
  assert.ok(snapshot);
  assert.ok(JSON.stringify(snapshot.payload).includes("1111"));
  assert.ok(!JSON.stringify(snapshot.payload).includes("token-secret") && !JSON.stringify(snapshot.payload).includes("4111-11XX"));
});

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

test("a callback for order X with another order's PAID payment leaves no trace on X", async () => {
  const { client, log } = happyDb(orderRow({ metadata: { paid_unmatched: { payment_id: "pay_real", reason: "amount_mismatch", at: "t" } } }));
  const { d } = deps(client, gateway(paymentOf({ id: "pay_Y", metadata: { order_id: "00000000-0000-0000-0000-0000000a00ff" } })));
  const r = await fulfillOrderWith(d, { ...INPUT, paymentId: "pay_Y" });
  assert.deepEqual(r, { outcome: "rejected", reason: "order_mismatch" });
  assert.equal(unmatched(log).length, 0, "X keeps its real trace untouched");
});

test("findPaidPaymentWith ignores listed payments of other orders", async () => {
  const listed = [
    paymentOf({ id: "p-theirs", status: "paid", createdAt: "2026-10-22T07:50:00Z", metadata: { order_id: "00000000-0000-0000-0000-0000000a00ff" } }),
    paymentOf({ id: "p-mine", status: "paid", createdAt: "2026-10-22T07:30:00Z" }),
  ];
  assert.deepEqual(await findPaidPaymentWith({ gateway: async () => gateway(null, listed) }, ORDER), { ok: true, paymentId: "p-mine" });
  assert.deepEqual(await findPaidPaymentWith({ gateway: async () => gateway(null, [listed[0]]) }, ORDER), { ok: true, paymentId: null });
});

test("already_entitled is merged through the metadata RPC before the stamp, never by replacing metadata", async () => {
  const plan = orderRow({ kind: "plan", item_id: "ind-ai", billing: "monthly", total_halalas: 3900 });
  const { client, log } = happyDb(plan, (q) => {
    if (q.table === "subscriptions" && q.op === "select" && has(q, "eq", "status", "active")) {
      return { data: [{ id: "max", tier: "max", status: "active", current_period_end: "2027-01-01T00:00:00Z" }] };
    }
    if (q.table === "subscriptions" && q.op === "select") return { data: [] };
    return undefined;
  });
  const { d, notices } = deps(client, gateway(paymentOf({ amount: 3900 })));
  const r = await fulfillOrderWith(d, INPUT);
  assert.equal(r.reason, "already_entitled");
  const mergeAt = idx(log, (q) => q.table === "merge_payment_order_metadata");
  const stampAt = idx(log, (q) => stamps([q]).length === 1);
  assert.ok(mergeAt > -1 && stampAt > mergeAt, "merge, then stamp");
  assert.deepEqual((log[mergeAt].payload as { p_patch: unknown }).p_patch, { already_entitled: true });
  assert.ok(!("metadata" in (log[stampAt].payload as object)), "the stamp never writes metadata");
  assert.equal(notices.length, 1);
});

test("no_user is merged through the metadata RPC, never by replacing metadata", async () => {
  const { client, log } = happyDb(orderRow(), (q) =>
    q.table === "claim_payment_order" ? { data: [{ ...orderRow(), user_id: null, status: "paid", receipt_number: "NZ-2026-000004" }] } : undefined,
  );
  const { d } = deps(client, gateway(paymentOf()));
  const r = await fulfillOrderWith(d, INPUT);
  assert.equal(r.reason, "order_has_no_user");
  const merge = log.find((q) => q.table === "merge_payment_order_metadata");
  assert.deepEqual((merge?.payload as { p_patch: unknown }).p_patch, { no_user: true });
  assert.ok(stamps(log).length === 1 && stamps(log).every((q) => !("metadata" in (q.payload as object))));
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

test("a failed card-details merge never blocks the grant: it runs after the grant and the purchase completes", async () => {
  const { client, log } = happyDb(orderRow(), (q) =>
    q.table === "merge_payment_order_metadata" && JSON.stringify(q.payload).includes("payment_method")
      ? { error: { code: "XX000", message: "merge down" } }
      : undefined,
  );
  const { d, notices } = deps(client, gateway(paymentOf({ source: { type: "creditcard", number: "4111-11XX-XXXX-1111" } })));
  const r = await fulfillOrderWith(d, INPUT);
  assert.equal(r.outcome, "granted");
  const merge = idx(log, (q) => q.table === "merge_payment_order_metadata" && JSON.stringify(q.payload).includes("payment_method"));
  const credit = idx(log, (q) => q.table === "credit_points");
  assert.ok(merge > -1 && credit > -1 && credit < merge, "the merge runs after the grant");
  assert.equal(stamps(log).length, 1);
  assert.equal(notices.length, 1);
});

test("a payment without a source object still grants (no throw on source.number)", async () => {
  const { client, log } = happyDb();
  const { d } = deps(client, gateway(paymentOf({ source: undefined as unknown as MoyasarPayment["source"] })));
  const r = await fulfillOrderWith(d, INPUT);
  assert.equal(r.outcome, "granted");
  assert.ok(!log.some((q) => q.table === "merge_payment_order_metadata" && JSON.stringify(q.payload).includes("payment_method")));
});

test("retire, never delete: a paid order for an item retired since is still granted, stamped and notified", async () => {
  const catalog = buildCatalog({ ...PRICE_BOOK, "topup-100": { ...PRICE_BOOK["topup-100"], retired: true } });
  const { client, log } = happyDb();
  const { d, notices } = deps(client, gateway(paymentOf()), { catalog });
  const r = await fulfillOrderWith(d, INPUT);
  assert.deepEqual(r, { outcome: "granted", receiptNumber: "NZ-2026-000001" });
  assert.equal(log.filter((q) => q.table === "credit_points").length, 1, "the points are credited");
  assert.equal(stamps(log).length, 1);
  assert.equal(notices.length, 1);
  assert.ok(notices[0].body.includes("شحن ١٠٠"), "the notice names the retired item");
});

// ── P3 Task 5: the founder membership — activate on payment, free the seat of a dead payment ──

const MEMBER_ROW = (over: Record<string, unknown> = {}) =>
  orderRow({ kind: "membership", item_id: "lawyer-founder-2026", billing: "once", total_halalas: 344540, ...over });
const MEMBER_PAY = (over: Partial<MoyasarPayment> = {}) => paymentOf({ amount: 344540, ...over });

/** A membership order whose claim succeeds ONCE (a second caller gets zero rows, as claim_payment_order answers). */
function memberDb(row: Record<string, unknown> = MEMBER_ROW(), over?: FakeHandler) {
  let claimed = false;
  return fakeDb((q) => {
    const r = over?.(q);
    if (r) return r;
    if (q.table === "payment_orders" && q.op === "select") return { data: row };
    if (q.table === "claim_payment_order") {
      if (claimed) return { data: [] };
      claimed = true;
      return { data: [{ ...row, status: "paid", moyasar_payment_id: "pay_1", receipt_number: "NZ-2026-000009", paid_at: NOW.toISOString() }] };
    }
    if (q.table === "payment_orders" && q.op === "update") return { data: [{ id: ORDER }] };
    return { data: null };
  });
}

function founderDeps(client: FulfilDeps["admin"], gw: GatewayClient | null, answer = "activated") {
  const activations: string[] = [];
  const releases: string[] = [];
  const admins: Array<{ title: string; body: string; href: string }> = [];
  const base = deps(client, gw, {
    activateFounder: async (orderId: string) => {
      activations.push(orderId);
      return { data: answer, error: null };
    },
    releaseFounderSeat: async (orderId: string) => {
      releases.push(orderId);
    },
    notifyAdmins: async (n: { title: string; body: string; href: string }) => {
      admins.push(n);
    },
  });
  return { ...base, activations, releases, admins };
}

test("founder: a paid membership activates once — claim, founder_activate, stamp, the «تم تفعيل عضويتك المؤسِّسة» notice; no admin alert, no points", async () => {
  const { client, log } = memberDb();
  const f = founderDeps(client, gateway(MEMBER_PAY()));
  const r = await fulfillOrderWith(f.d, INPUT);
  assert.equal(r.outcome, "granted");
  assert.deepEqual(f.activations, [ORDER]);
  assert.equal(stamps(log).length, 1);
  assert.equal(f.notices.length, 1);
  assert.equal(f.notices[0].title, "تم تفعيل عضويتك المؤسِّسة");
  assert.equal(f.admins.length, 0);
  assert.equal(log.filter((q) => q.table === "credit_points").length, 0);
  assert.equal(f.releases.length, 0);
});

test("founder: the webhook and the result page fulfilling the same payment activate exactly once", async () => {
  const { client, log } = memberDb();
  const f = founderDeps(client, gateway(MEMBER_PAY()));
  const [hook, page] = await Promise.all([
    fulfillOrderWith(f.d, { ...INPUT, liveFlag: false }),
    fulfillOrderWith(f.d, INPUT),
  ]);
  assert.deepEqual([hook.outcome, page.outcome].sort(), ["already_done", "granted"]);
  assert.equal(log.filter((q) => q.table === "claim_payment_order").length, 2);
  assert.deepEqual(f.activations, [ORDER], "founder_activate once per order");
  assert.equal(f.notices.length, 1);
});

test("founder: seat_unavailable — paid, nothing granted, fulfilled_at stamped, one refund notice to the payer and ONE admin alert, never a throw", async () => {
  const { client, log } = memberDb();
  const f = founderDeps(client, gateway(MEMBER_PAY()), "full");
  const [first, second] = await Promise.all([fulfillOrderWith(f.d, INPUT), fulfillOrderWith(f.d, { ...INPUT, liveFlag: false })]);
  const outcomes = [first, second].map((x) => `${x.outcome}:${x.reason ?? ""}`).sort();
  assert.deepEqual(outcomes, ["already_done:already_entitled", "already_done:claimed_elsewhere"]);
  assert.deepEqual(f.activations, [ORDER]);
  assert.equal(stamps(log).length, 1, "stamped, so the sweep does not loop on it");
  const flag = idx(log, (q) => q.table === "merge_payment_order_metadata" && JSON.stringify(q.payload).includes("already_entitled"));
  assert.ok(flag >= 0 && flag < idx(log, (q) => stamps([q]).length === 1), "the refund flag lands before the stamp");
  assert.equal(f.notices.length, 1);
  assert.ok(!f.notices[0].body.includes("لم نغيّر اشتراكك"), "not the plan copy");
  assert.match(f.notices[0].body, /لم تُفعَّل/);
  assert.match(f.notices[0].body, /استرداد/);
  assert.equal(f.admins.length, 1);
  assert.match(f.admins[0].body, /seat_unavailable|اكتملت/);
  assert.match(f.admins[0].body, new RegExp(ORDER));
  assert.equal(f.admins[0].href, "/dashboard/admin/subscriptions/orders");
});

test("founder: not_verified and a member who paid twice take the same refund path; an admin alert that throws changes nothing", async () => {
  for (const answer of ["not_verified", "already"]) {
    const { client, log } = memberDb(MEMBER_ROW(), (q) =>
      answer === "already" && q.table === "payment_orders" && q.op === "select" && q.columns === "metadata"
        ? { data: { metadata: { founder: "already_member" } } }
        : undefined,
    );
    const f = founderDeps(client, gateway(MEMBER_PAY()), answer);
    f.d.notifyAdmins = async () => {
      throw new Error("bell down");
    };
    const r = await fulfillOrderWith(f.d, INPUT);
    assert.deepEqual([r.outcome, r.reason], ["already_done", "already_entitled"], answer);
    assert.equal(stamps(log).length, 1, answer);
    assert.equal(f.notices.length, 1, answer);
  }
});

test("founder: an admin alert is sent only by the call that stamped; a lost stamp race sends none", async () => {
  const { client } = memberDb(MEMBER_ROW(), (q) =>
    q.table === "payment_orders" && q.op === "update" && "fulfilled_at" in (q.payload as object) ? { data: [] } : undefined,
  );
  const f = founderDeps(client, gateway(MEMBER_PAY()), "full");
  const r = await fulfillOrderWith(f.d, INPUT);
  assert.equal(r.outcome, "already_done");
  assert.equal(f.admins.length, 0);
  assert.equal(f.notices.length, 0);
});

test("founder: the payer refreshing a seat_unavailable order sees the refund review, not «تم التفعيل»", async () => {
  const row = MEMBER_ROW({ status: "paid", fulfilled_at: NOW.toISOString(), metadata: { already_entitled: true, founder: "seat_unavailable" } });
  const { client } = memberDb(row);
  const f = founderDeps(client, gateway(MEMBER_PAY()));
  const r = await fulfillOrderWith(f.d, INPUT);
  assert.deepEqual([r.outcome, r.reason], ["already_done", "already_entitled"]);
  assert.equal(f.activations.length, 0);
});

test("founder: a failed membership payment frees the seat once (founder_release_order); a failed top-up never does", async () => {
  const { client } = memberDb();
  const f = founderDeps(client, gateway(MEMBER_PAY({ status: "failed", source: { type: "creditcard", message: "DECLINED" } })));
  const r = await fulfillOrderWith(f.d, INPUT);
  assert.equal(r.outcome, "failed");
  assert.deepEqual(f.releases, [ORDER]);
  assert.equal(f.activations.length, 0);

  const { client: topupClient } = happyDb();
  const t = founderDeps(topupClient, gateway(paymentOf({ status: "failed", source: { type: "creditcard", message: "DECLINED" } })));
  assert.equal((await fulfillOrderWith(t.d, INPUT)).outcome, "failed");
  assert.equal(t.releases.length, 0);
});

test("founder: a release that throws never changes the failure the payer sees", async () => {
  const { client } = memberDb();
  const f = founderDeps(client, gateway(MEMBER_PAY({ status: "failed", source: { type: "creditcard", message: "DECLINED" } })));
  f.d.releaseFounderSeat = async () => {
    throw new Error("rpc down");
  };
  const r = await fulfillOrderWith(f.d, INPUT);
  assert.deepEqual(r, { outcome: "failed", reason: "DECLINED" });
});

test("founder: a dead membership order seen again (failed / voided / cancelled) frees its seat; a dead top-up does not", async () => {
  for (const status of ["failed", "voided", "cancelled"]) {
    const { client } = memberDb(MEMBER_ROW({ status, failure_message: "DECLINED" }));
    const f = founderDeps(client, gateway(MEMBER_PAY({ status: "failed" })));
    await fulfillOrderWith(f.d, INPUT);
    assert.deepEqual(f.releases, [ORDER], status);
  }
  const { client } = happyDb(orderRow({ status: "cancelled" }));
  const t = founderDeps(client, gateway(paymentOf({ status: "failed" })));
  await fulfillOrderWith(t.d, INPUT);
  assert.equal(t.releases.length, 0);
});

test("founder: the sweep's release of expired reservations calls founder_release_expired and never throws", async () => {
  const { client, log } = fakeDb((q) => (q.table === "founder_release_expired" ? { data: 3 } : { data: null }));
  assert.equal(await releaseExpiredFounderSeats(client), 3);
  assert.equal(log.filter((q) => q.table === "founder_release_expired" && q.op === "rpc").length, 1);
  const { client: missing } = fakeDb(() => ({ error: { code: "PGRST202", message: "x" } }));
  assert.equal(await releaseExpiredFounderSeats(missing), null);
  const throwing = { rpc: () => { throw new Error("boom"); } } as unknown as FulfilDeps["admin"];
  assert.equal(await releaseExpiredFounderSeats(throwing), null);
});
