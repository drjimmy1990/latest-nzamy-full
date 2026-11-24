/**
 * l14Bundle.test.ts — batch l14 (owner 23 Nov 2026, §عاشرًا / §حادي عشر #1–#2):
 * the ERP + library bundle `lawyer-bundle` is a PLAN that also grants the
 * library pass of its cycle, with that pass's library-assistant points; a
 * kept higher plan grants nothing more; a tier grant never targets it; the
 * checkout lines say what the cycle brings.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { grantPurchase, type GrantLibraryFn } from "./grantPurchase.ts";
import { fakeDb, has, RANKS, type FakeQuery } from "./fakeDb.test-helper.ts";
import { PAYABLE_ITEMS } from "./catalog.ts";
import { pickPlanRow } from "./pickPlanRow.ts";
import { checkoutItemNotes } from "./checkoutView.ts";
import { POINTS_SPEND_ORDER_AR, POINTS_SPEND_REFUND_NOTE_AR, TOPUP_SPEND_REFUND_LINE_AR } from "./billingView.ts";
import { WITHDRAWAL_MAX_POINTS_USED_PCT } from "./refundPolicy.ts";
import { commissionPctFor, COMMISSION_PCT } from "../pricing/commission.ts";

const NOW = new Date("2026-11-25T08:00:00.000Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();
const USER = "00000000-0000-0000-0000-0000000014a1";
const ORDER = "00000000-0000-0000-0000-0000000014c1";

function bundleDb(active: Array<{ id: string; tier: string; current_period_end: string | null }> = []) {
  return fakeDb((q) => {
    if (q.table === "subscriptions" && q.op === "select" && has(q, "eq", "metadata->>order_id")) return { data: [] };
    if (q.table === "subscriptions" && q.op === "select" && has(q, "eq", "status", "active")) {
      return { data: active.map((a) => ({ ...a, status: "active" })) };
    }
    if (q.table === "grant_plan_subscription" && q.op === "rpc") {
      const p = q.payload as { p_period_end: string };
      return { data: { inserted: true, subscription_id: "new-sub", current_period_end: p.p_period_end } };
    }
    if (q.table === "credit_wallet_points" && q.op === "rpc") return { data: "lot" };
    return { data: null };
  });
}

const walletLots = (log: FakeQuery[]) => log.filter((q) => q.table === "credit_wallet_points" && q.op === "rpc");
const planGrants = (log: FakeQuery[]) => log.filter((q) => q.table === "grant_plan_subscription" && q.op === "rpc");

for (const [billing, ref, days, points] of [
  ["quarterly", "lib-q1", 90, 50],
  ["semiannual", "lib-q2", 180, 120],
  ["yearly", "lib-annual", 365, 300],
] as const) {
  test(`a ${billing} bundle grants the plan (tier pro) AND the ${ref} pass for ${days} days with its ${points} library-assistant points`, async () => {
    const seen: unknown[] = [];
    const end = inDays(days);
    const grantLibrary: GrantLibraryFn = async (input) => {
      seen.push(input);
      return { ok: true, endsAt: end };
    };
    const { client, log } = bundleDb();
    const r = await grantPurchase(
      { admin: client, grantLibrary, ranks: RANKS },
      { id: ORDER, user_id: USER, item_id: "lawyer-bundle", kind: "plan", billing },
      { now: NOW },
    );
    assert.deepEqual(r, { ok: true, alreadyEntitled: false });
    const plan = planGrants(log)[0]?.payload as Record<string, unknown>;
    assert.equal(plan.p_plan_id, "lawyer-bundle");
    assert.equal(plan.p_tier, "pro");
    assert.equal(plan.p_billing, billing);
    assert.deepEqual(seen, [{ userId: USER, planRef: ref, days, source: "purchase", orderId: ORDER }]);
    const lot = walletLots(log)[0]?.payload as Record<string, unknown>;
    assert.deepEqual([lot.p_points, lot.p_scope, lot.p_source, lot.p_order, lot.p_expires_at], [points, "library_agent", "plan", ORDER, end]);
  });
}

test("«إدارة المكتب» alone (lawyer-pro) grants no library", async () => {
  const { client, log } = bundleDb();
  let asked = false;
  const grantLibrary: GrantLibraryFn = async () => {
    asked = true;
    return { ok: false, error: "not expected" };
  };
  const r = await grantPurchase(
    { admin: client, grantLibrary, ranks: RANKS },
    { id: ORDER, user_id: USER, item_id: "lawyer-pro", kind: "plan", billing: "quarterly" },
    { now: NOW },
  );
  assert.deepEqual(r, { ok: true, alreadyEntitled: false });
  assert.equal(asked, false);
  assert.equal(walletLots(log).length, 0);
});

test("a kept higher plan (refund review): the bundle grants neither the plan nor the library", async () => {
  const { client, log } = bundleDb([{ id: "max", tier: "max", current_period_end: inDays(30) }]);
  let asked = false;
  const grantLibrary: GrantLibraryFn = async () => {
    asked = true;
    return { ok: true, endsAt: inDays(90) };
  };
  const r = await grantPurchase(
    { admin: client, grantLibrary, ranks: RANKS },
    { id: ORDER, user_id: USER, item_id: "lawyer-bundle", kind: "plan", billing: "quarterly" },
    { now: NOW },
  );
  assert.deepEqual(r, { ok: true, alreadyEntitled: true });
  assert.equal(asked, false, "no library for an order that waits for a refund");
  assert.equal(planGrants(log).length, 0);
});

test("a retry: the library grant exists (23505) → the pass's points are credited from the grant's end; a failed library grant is not ok (the sweep retries)", async () => {
  const end = inDays(90);
  const { client, log } = fakeDb((q) => {
    if (q.table === "subscriptions" && q.op === "select" && has(q, "eq", "metadata->>order_id")) return { data: [{ id: "s", current_period_end: end }] };
    if (q.table === "library_access_grants") return { data: { ends_at: end } };
    if (q.table === "credit_wallet_points") return { data: "lot" };
    return { data: null };
  });
  const dup: GrantLibraryFn = async () => ({ ok: false, error: "duplicate key", code: "23505" });
  const order = { id: ORDER, user_id: USER, item_id: "lawyer-bundle", kind: "plan", billing: "quarterly" };
  assert.deepEqual(await grantPurchase({ admin: client, grantLibrary: dup, ranks: RANKS }, order, { now: NOW }), { ok: true, alreadyEntitled: false });
  assert.equal((walletLots(log)[0].payload as Record<string, unknown>).p_expires_at, end);
  assert.equal(planGrants(log).length, 0, "the plan was granted before: not again");

  const failing: GrantLibraryFn = async () => ({ ok: false, error: "boom", code: "XX000" });
  const r = await grantPurchase({ admin: bundleDb().client, grantLibrary: failing, ranks: RANKS }, order, { now: NOW });
  assert.equal(r.ok, false);
});

test("a tier grant (admin / entitlement) never targets the bundle row: pickPlanRow skips it", () => {
  assert.equal(pickPlanRow([{ id: "lawyer-bundle" }, { id: "lawyer-pro" }]), "lawyer-pro");
  assert.equal(pickPlanRow([{ id: "lawyer-bundle" }]), null, "the caller's own fallback, never the bundle");
  assert.ok(PAYABLE_ITEMS["lawyer-bundle"].libraryByBilling);
});

test("the bundle is a paid subscriber's plan for the market rate (7 %), not the lowest", () => {
  assert.equal(commissionPctFor({ plan: "lawyer-bundle" }), COMMISSION_PCT.subscriber);
  assert.equal(commissionPctFor({ plan: "lawyer-pro" }), COMMISSION_PCT.subscriber);
});

test("checkout lines: the bundle says what its cycle brings and the 50-point rule; «إدارة المكتب» alone says nothing extra", () => {
  const bundle = PAYABLE_ITEMS["lawyer-bundle"];
  assert.deepEqual(checkoutItemNotes(bundle, { billing: "quarterly" }), [
    "إدارة المكتب لمدة ٣ أشهر",
    "وصول إلى المكتبة القانونية لمدة ٩٠ يوماً",
  ]);
  const yearly = checkoutItemNotes(bundle, { billing: "yearly", libraryMinPoints: 50, libraryQuestionPoints: 5 });
  assert.equal(yearly[0], "إدارة المكتب لمدة سنة");
  assert.equal(yearly[1], "وصول إلى المكتبة القانونية لمدة ٣٦٥ يوماً");
  assert.match(yearly[2], /٥٠ نقطة/);
  assert.match(yearly[2], /٣٠٠ نقطة لمساعد المكتبة/);
  assert.deepEqual(checkoutItemNotes(bundle), [], "no cycle known: no line rather than a wrong one");
  assert.deepEqual(checkoutItemNotes(PAYABLE_ITEMS["lawyer-pro"], { billing: "quarterly" }), []);
});

test("owner ٢٠٦: the refund line is true to the rules it states, and stands beside the spend order", () => {
  assert.equal(WITHDRAWAL_MAX_POINTS_USED_PCT, 0, "the line says ANY spent point ends a top-up's refund");
  assert.match(POINTS_SPEND_ORDER_AR, /الأقرب انتهاءً أولاً/);
  assert.match(POINTS_SPEND_REFUND_NOTE_AR, /يُسقط أهليتها للاسترداد/);
  assert.match(TOPUP_SPEND_REFUND_LINE_AR, /^تُصرف النقاط الأقرب انتهاءً أولاً/);
  const topup = checkoutItemNotes(PAYABLE_ITEMS["topup-500"]);
  assert.equal(topup.at(-1), TOPUP_SPEND_REFUND_LINE_AR);
  assert.equal(checkoutItemNotes(PAYABLE_ITEMS["lib-q1"]).includes(TOPUP_SPEND_REFUND_LINE_AR), false, "top-ups only");
});

test("refund review: a bundle order counts as including the library (the 5-full-text line; refund policy «والباقات المدمجة»)", async () => {
  const { orderIncludesLibrary } = await import("./refundEligibility.ts");
  assert.equal(orderIncludesLibrary({ kind: "plan", item_id: "lawyer-bundle" }), true);
});
