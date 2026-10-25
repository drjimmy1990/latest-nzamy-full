/**
 * grantPurchase.test.ts — behaviour of grantPurchase against a fake service
 * client (fix round 1 of B1 Task 5): lapsed plans never block, the same rank
 * stacks, a higher running rank is kept, every grant is keyed on the order
 * and its 23505 means "already done". Since 20261025_10 the plan's cancel +
 * insert is ONE call, grant_plan_subscription: these tests pin what is sent to
 * it (the window, the running rows, the order) and how its answer is read;
 * supabase/tests/rls/grant_plan_atomic.test.sql runs the function itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { grantPurchase, type GrantLibraryFn } from "./grantPurchase.ts";
import { addMonthsUtc } from "./fulfillDecision.ts";
import { fakeDb, has, RANKS, type FakeHandler, type FakeQuery } from "./fakeDb.test-helper.ts";
import { buildCatalog } from "./catalog.ts";
import { PRICE_BOOK } from "../pricing/priceBook.ts";

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
    if (q.table === "grant_plan_subscription" && q.op === "rpc") {
      const p = q.payload as { p_period_end: string };
      return { data: { inserted: true, subscription_id: "new-sub", current_period_end: p.p_period_end } };
    }
    return { data: null };
  });
}

/** The atomic cancel + insert calls (grant_plan_subscription, 20261025_10). */
const grants = (log: FakeQuery[]) => log.filter((q) => q.table === "grant_plan_subscription" && q.op === "rpc");
const grantArgs = (log: FakeQuery[]) => grants(log)[0].payload as Record<string, unknown>;
/** grantPlan never writes subscriptions directly any more. */
const directWrites = (log: FakeQuery[]) =>
  log.filter((q) => q.table === "subscriptions" && (q.op === "insert" || q.op === "update"));
const lots = (log: FakeQuery[]) => log.filter((q) => q.table === "credit_points" && q.op === "rpc");

function order(item_id: string, kind: string, billing: string) {
  return { id: ORDER, user_id: USER, item_id, kind, billing };
}

test("a lapsed max row (status still active, period ended) never blocks: ind-ai is granted", async () => {
  const { client, log } = planDb([{ id: "old-max", tier: "max", current_period_end: inDays(-3) }]);
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("ind-ai", "plan", "monthly"), { now: NOW });
  assert.deepEqual(r, { ok: true, alreadyEntitled: false });
  assert.equal(grants(log).length, 1, "one atomic call (it cancels the lapsed row with the others)");
  assert.equal(directWrites(log).length, 0, "no separate cancel or insert request");
  const args = grantArgs(log);
  assert.equal(args.p_tier, "ai");
  assert.equal(args.p_plan_id, "ind-ai");
  assert.equal(args.p_billing, "monthly");
  assert.equal(args.p_order, ORDER);
  assert.equal(args.p_user, USER);
  assert.equal(args.p_now, NOW.toISOString(), "started_at / cancelled_at = now (the refund restore matches them)");
  assert.equal(args.p_period_start, NOW.toISOString());
  assert.equal(args.p_period_end, "2026-11-22T08:00:00.000Z");
  assert.equal(args.p_payment_method, null);
  assert.deepEqual(args.p_running, [], "a lapsed row is not running, so it is not in replaced_ids");
  assert.equal(lots(log).length, 0, "ind-ai comes with no monthly points");
});

test("a running higher rank is kept: nothing cancelled, nothing inserted, alreadyEntitled", async () => {
  const { client, log } = planDb([{ id: "max", tier: "max", current_period_end: inDays(10) }]);
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("ind-ai", "plan", "monthly"), { now: NOW });
  assert.deepEqual(r, { ok: true, alreadyEntitled: true });
  assert.equal(grants(log).length, 0);
  assert.equal(directWrites(log).length, 0);
});

test("an open-ended plan of the same rank is kept (the refund-review path): no grant call", async () => {
  const { client, log } = planDb([{ id: "pro-open", tier: "pro", current_period_end: null }]);
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("lawyer-pro", "plan", "monthly"), { now: NOW });
  assert.deepEqual(r, { ok: true, alreadyEntitled: true });
  assert.equal(grants(log).length, 0);
  assert.equal(lots(log).length, 0);
});

test("a higher tier starts now and replaces the running lower one", async () => {
  const { client, log } = planDb([{ id: "ai-m", tier: "ai", current_period_end: inDays(20) }]);
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("lawyer-pro", "plan", "monthly"), { now: NOW });
  assert.deepEqual(r, { ok: true, alreadyEntitled: false });
  const args = grantArgs(log);
  assert.equal(args.p_period_start, NOW.toISOString(), "no carry-over across ranks");
  assert.equal(args.p_period_end, addMonthsUtc(NOW, 1).toISOString());
  assert.deepEqual(args.p_running, [{ id: "ai-m", tier: "ai", current_period_end: inDays(20) }]);
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
  const args = grantArgs(log);
  const expectedEnd = addMonthsUtc(new Date(oldEnd), 1).toISOString();
  assert.equal(args.p_period_start, new Date(oldEnd).toISOString());
  assert.equal(args.p_period_end, expectedEnd);
  assert.equal(args.p_payment_method, "pm-1");
  assert.deepEqual(args.p_running, [{ id: "pro-m", tier: "pro", current_period_end: oldEnd }], "replaced_ids = the running row");
  assert.equal(lots(log).length, 0, "a plan comes with no points (owner ٢٩١)");
});

test("same rank, a yearly plan held + a monthly bought → the yearly end + 1 month", async () => {
  const yearEnd = inDays(300);
  const { client, log } = planDb([{ id: "pro-y", tier: "pro", current_period_end: yearEnd }]);
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("ind-preventive", "plan", "monthly"), { now: NOW });
  assert.deepEqual(r, { ok: true, alreadyEntitled: false });
  assert.equal(grantArgs(log).p_period_end, addMonthsUtc(new Date(yearEnd), 1).toISOString());
});

test("the order's subscription already exists → no cancel, no insert, no points", async () => {
  const { client, log } = planDb([], (q) =>
    q.table === "subscriptions" && q.op === "select" && has(q, "eq", "metadata->>order_id", ORDER)
      ? { data: [{ id: "s1", current_period_end: inDays(30) }] }
      : undefined,
  );
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("lawyer-pro", "plan", "monthly"), { now: NOW });
  assert.deepEqual(r, { ok: true, alreadyEntitled: false });
  assert.equal(grants(log).length + directWrites(log).length, 0);
  assert.equal(lots(log).length, 0, "a retry of an older order credits no plan lot either");
});

test("the grant call answers inserted=false (another call wrote the order's row) → done, no points", async () => {
  const { client, log } = planDb([], (q) =>
    q.table === "grant_plan_subscription"
      ? { data: { inserted: false, subscription_id: "s-other", current_period_end: "2026-11-30T08:00:00+00:00" } }
      : undefined,
  );
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("lawyer-pro", "plan", "monthly"), { now: NOW });
  assert.deepEqual(r, { ok: true, alreadyEntitled: false });
  assert.equal(directWrites(log).length, 0, "nothing is re-activated");
  assert.equal(lots(log).length, 0);
});

test("a stale grant (40001: the running plans changed) is a FAILURE, not missing — the sweep retries", async () => {
  const { client, log } = planDb([{ id: "pro-m", tier: "pro", current_period_end: inDays(5) }], (q) =>
    q.table === "grant_plan_subscription" ? { error: { code: "40001", message: "grant_plan_stale" } } : undefined,
  );
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("lawyer-pro", "plan", "monthly"), { now: NOW });
  assert.equal(r.ok, false);
  if (!r.ok) assert.notEqual(r.missing, true);
  assert.equal(lots(log).length, 0, "no points for a plan that was not granted");
});

test("the grant function not applied yet (PGRST202) → ok:false, missing; no fallback to separate writes", async () => {
  const { client, log } = planDb([], (q) =>
    q.table === "grant_plan_subscription" ? { error: { code: "PGRST202", message: "function not found" } } : undefined,
  );
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("ind-ai", "plan", "yearly"), { now: NOW });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.missing, true);
  assert.equal(directWrites(log).length, 0);
});

test("a grant error after the cancel (e.g. a failed insert) is a failure; nothing else is written", async () => {
  const { client, log } = planDb([{ id: "pro-m", tier: "pro", current_period_end: inDays(5) }], (q) =>
    q.table === "grant_plan_subscription" ? { error: { code: "23503", message: "subscriptions_plan_id_fkey" } } : undefined,
  );
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("lawyer-pro", "plan", "monthly"), { now: NOW });
  assert.equal(r.ok, false);
  assert.equal(directWrites(log).length, 0);
  assert.equal(lots(log).length, 0);
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

test("a grant call that answers nothing usable is a failure", async () => {
  const { client } = planDb([], (q) => (q.table === "grant_plan_subscription" ? { data: null } : undefined));
  const r = await grantPurchase({ admin: client, grantLibrary: noLibrary, ranks: RANKS }, order("ind-ai", "plan", "yearly"), { now: NOW });
  assert.equal(r.ok, false);
});

// ── retire, never delete (P1) ───────────────────────────────────────────────


/** The book as P2 will have it: lawyer-pro retired, firm-basic monthly retired. */
const RETIRED = buildCatalog({
  ...PRICE_BOOK,
  "lawyer-pro": { ...PRICE_BOOK["lawyer-pro"], retired: true },
  "firm-basic": {
    ...PRICE_BOOK["firm-basic"],
    prices: { monthly: { sar: 990, retired: true }, yearly: { sar: 9900 } },
  },
});

test("retired: a paid order for a retired plan is still fulfilled — the plan row, no points", async () => {
  const { client, log } = planDb([]);
  const r = await grantPurchase(
    { admin: client, grantLibrary: noLibrary, ranks: RANKS, catalog: RETIRED },
    order("lawyer-pro", "plan", "yearly"),
    { now: NOW },
  );
  assert.deepEqual(r, { ok: true, alreadyEntitled: false });
  const args = grantArgs(log);
  assert.equal(args.p_plan_id, "lawyer-pro");
  assert.equal(args.p_tier, "pro");
  assert.equal(args.p_period_end, "2027-10-22T08:00:00.000Z");
  assert.equal(lots(log).length, 0, "no plan comes with points (owner ٢٩١)");
});

test("retired: an order in a retired CYCLE (firm-basic monthly) is still fulfilled", async () => {
  const { client, log } = planDb([]);
  const r = await grantPurchase(
    { admin: client, grantLibrary: noLibrary, ranks: RANKS, catalog: RETIRED },
    order("firm-basic", "plan", "monthly"),
    { now: NOW },
  );
  assert.deepEqual(r, { ok: true, alreadyEntitled: false });
  assert.equal(grantArgs(log).p_period_end, "2026-11-22T08:00:00.000Z");
});

test("a quarterly order runs 3 months; a half-yearly one 6", async () => {
  const quarterly = buildCatalog({
    ...PRICE_BOOK,
    "firm-basic": { ...PRICE_BOOK["firm-basic"], prices: { quarterly: { sar: 2990 }, semiannual: { sar: 5490 } } },
  });
  for (const [billing, end] of [["quarterly", "2027-01-22T08:00:00.000Z"], ["semiannual", "2027-04-22T08:00:00.000Z"]] as const) {
    const { client, log } = planDb([]);
    const r = await grantPurchase(
      { admin: client, grantLibrary: noLibrary, ranks: RANKS, catalog: quarterly },
      order("firm-basic", "plan", billing),
      { now: NOW },
    );
    assert.deepEqual(r, { ok: true, alreadyEntitled: false }, billing);
    assert.equal(grantArgs(log).p_billing, billing);
    assert.equal(grantArgs(log).p_period_end, end, billing);
  }
});

test("an item the book never knew is still refused (unknown item), retired or not", async () => {
  const { client } = planDb([]);
  const r = await grantPurchase(
    { admin: client, grantLibrary: noLibrary, ranks: RANKS, catalog: RETIRED },
    order("lawyer-gold", "plan", "yearly"),
    { now: NOW },
  );
  assert.equal(r.ok, false);
});
