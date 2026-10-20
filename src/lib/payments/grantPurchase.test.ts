/**
 * grantPurchase.test.ts — behaviour of grantPurchase against a fake service
 * client (fix round 1 of B1 Task 5): lapsed plans never block, the same rank
 * stacks, a higher running rank is kept, every grant is keyed on the order
 * and its 23505 means "already done".
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { grantPurchase, type GrantLibraryFn } from "./grantPurchase.ts";
import { addMonthsUtc } from "./fulfillDecision.ts";
import { fakeDb, has, RANKS, type FakeHandler, type FakeQuery } from "./fakeDb.test-helper.ts";

const NOW = new Date("2026-10-22T08:00:00.000Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();
const USER = "00000000-0000-0000-0000-00000000u001";
const ORDER = "00000000-0000-0000-0000-0000000a0001";

const noLibrary: GrantLibraryFn = async () => ({ ok: false, error: "not expected" });

function planDb(active: Array<{ id: string; tier: string; current_period_end: string | null }>, extra?: FakeHandler) {
  return fakeDb((q) => {
    const r = extra?.(q);
    if (r) return r;
    if (q.table === "subscriptions" && q.op === "select" && has(q, "eq", "metadata->>order_id")) return { data: [] };
    if (q.table === "subscriptions" && q.op === "select" && has(q, "eq", "status", "active")) {
      return { data: active.map((a) => ({ ...a, status: "active" })) };
    }
    return { data: null };
  });
}

const inserts = (log: FakeQuery[]) => log.filter((q) => q.table === "subscriptions" && q.op === "insert");
const cancels = (log: FakeQuery[]) =>
  log.filter((q) => q.table === "subscriptions" && q.op === "update" && (q.payload as { status?: string }).status === "cancelled");
const lots = (log: FakeQuery[]) => log.filter((q) => q.table === "credit_points" && q.op === "rpc");

function order(item_id: string, kind: string, billing: string) {
  return { id: ORDER, user_id: USER, item_id, kind, billing };
}

test("a lapsed max row (status still active, period ended) never blocks: ind-ai is granted", async () => {
  const { client, log } = planDb([{ id: "old-max", tier: "max", current_period_end: inDays(-3) }]);
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("ind-ai", "plan", "monthly"), { now: NOW });
  assert.deepEqual(r, { ok: true, alreadyEntitled: false });
  assert.equal(cancels(log).length, 1, "the lapsed row is cancelled");
  const ins = inserts(log)[0].payload as Record<string, unknown>;
  assert.equal(ins.tier, "ai");
  assert.equal(ins.plan_id, "ind-ai");
  assert.equal(ins.current_period_start, NOW.toISOString());
  assert.equal(ins.current_period_end, "2026-11-22T08:00:00.000Z");
  assert.equal(ins.auto_renew, false);
  assert.deepEqual(ins.metadata, { order_id: ORDER, method: "moyasar" });
  assert.equal(lots(log).length, 0, "ind-ai comes with no monthly points");
});

test("a running higher rank is kept: nothing cancelled, nothing inserted, alreadyEntitled", async () => {
  const { client, log } = planDb([{ id: "max", tier: "max", current_period_end: inDays(10) }]);
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("ind-ai", "plan", "monthly"), { now: NOW });
  assert.deepEqual(r, { ok: true, alreadyEntitled: true });
  assert.equal(cancels(log).length, 0);
  assert.equal(inserts(log).length, 0);
});

test("same rank, monthly with 20 days left + another monthly → the new period runs from the old end, + 1 month", async () => {
  const oldEnd = inDays(20);
  const { client, log } = planDb([{ id: "pro-m", tier: "pro", current_period_end: oldEnd }]);
  const r = await grantPurchase(
    { admin: client, grantLibrary: noLibrary, ranks: RANKS },
    order("lawyer-pro", "plan", "monthly"),
    { now: NOW, paymentMethodId: "pm-1" },
  );
  assert.deepEqual(r, { ok: true, alreadyEntitled: false }, "a same-rank repurchase stacks, never a refund review");
  const ins = inserts(log)[0].payload as Record<string, unknown>;
  const expectedEnd = addMonthsUtc(new Date(oldEnd), 1).toISOString();
  assert.equal(ins.current_period_start, new Date(oldEnd).toISOString());
  assert.equal(ins.current_period_end, expectedEnd);
  assert.equal(ins.payment_method_id, "pm-1");
  const lot = lots(log)[0].payload as Record<string, unknown>;
  assert.equal(lot.p_source, "plan_monthly");
  assert.equal(lot.p_points, 1500);
  assert.equal(lot.p_order, ORDER);
  assert.equal(lot.p_expires_at, expectedEnd);
});

test("same rank, a yearly plan held + a monthly bought → the yearly end + 1 month", async () => {
  const yearEnd = inDays(300);
  const { client, log } = planDb([{ id: "pro-y", tier: "pro", current_period_end: yearEnd }]);
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("ind-preventive", "plan", "monthly"), { now: NOW });
  assert.deepEqual(r, { ok: true, alreadyEntitled: false });
  const ins = inserts(log)[0].payload as Record<string, unknown>;
  assert.equal(ins.current_period_end, addMonthsUtc(new Date(yearEnd), 1).toISOString());
});

test("the order's subscription already exists → no cancel, no insert; the points are still credited once", async () => {
  const { client, log } = planDb([], (q) =>
    q.table === "subscriptions" && q.op === "select" && has(q, "eq", "metadata->>order_id", ORDER)
      ? { data: [{ id: "s1", current_period_end: inDays(30) }] }
      : undefined,
  );
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("lawyer-pro", "plan", "monthly"), { now: NOW });
  assert.deepEqual(r, { ok: true, alreadyEntitled: false });
  assert.equal(cancels(log).length + inserts(log).length, 0);
  assert.equal(lots(log).length, 1);
});

test("a 23505 on the plan insert (another call inserted it) re-activates the order's row and counts as done", async () => {
  const { client, log } = planDb([], (q) =>
    q.table === "subscriptions" && q.op === "insert" ? { error: { code: "23505", message: "subscriptions_order_id_key" } } : undefined,
  );
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("ind-ai", "plan", "yearly"), { now: NOW });
  assert.deepEqual(r, { ok: true, alreadyEntitled: false });
  const again = log.find((q) => q.table === "subscriptions" && q.op === "update" && (q.payload as { status?: string }).status === "active");
  assert.ok(again, "the order's row is re-activated");
  assert.ok(has(again!, "eq", "metadata->>order_id", ORDER));
});

test("a points 23505 (the order's lot exists) is already credited → ok", async () => {
  const { client } = fakeDb((q) => (q.table === "credit_points" ? { error: { code: "23505", message: "points_lots_order_source_key" } } : { data: null }));
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("topup-250", "topup", "once"), { now: NOW });
  assert.deepEqual(r, { ok: true, alreadyEntitled: false });
});

test("a top-up credits a purchase lot for the order, expiring after its validity months", async () => {
  const { client, log } = fakeDb(() => ({ data: "lot-1" }));
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("topup-500", "topup", "once"), { now: NOW });
  assert.deepEqual(r, { ok: true, alreadyEntitled: false });
  const lot = lots(log)[0].payload as Record<string, unknown>;
  assert.deepEqual(
    [lot.p_user, lot.p_points, lot.p_source, lot.p_order, lot.p_expires_at],
    [USER, 700, "purchase", ORDER, addMonthsUtc(NOW, 6).toISOString()],
  );
});

test("a library 23505 (the order's grant exists) is already granted → ok; the grant carries the order", async () => {
  const seen: unknown[] = [];
  const grantLibrary: GrantLibraryFn = async (input) => {
    seen.push(input);
    return { ok: false, error: "duplicate key", code: "23505" };
  };
  const { client } = fakeDb(() => ({ data: null }));
  const r = await grantPurchase({ admin: client, grantLibrary, ranks: RANKS }, order("lib-q2", "library", "once"), { now: NOW });
  assert.deepEqual(r, { ok: true, alreadyEntitled: false });
  assert.deepEqual(seen, [{ userId: USER, planRef: "lib-q2", days: 180, source: "purchase", orderId: ORDER }]);
});

test("a missing points function → ok:false, missing (the sweep retries later)", async () => {
  const { client } = fakeDb(() => ({ error: { code: "PGRST202", message: "function not found" } }));
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("topup-100", "topup", "once"), { now: NOW });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.missing, true);
});
