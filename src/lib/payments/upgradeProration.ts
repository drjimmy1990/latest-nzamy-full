/**
 * upgradeProration.ts — owner TODO Q511: a subscriber who upgrades from a
 * lower PAID plan to a higher one mid-period pays the difference, pro-rated
 * by the days left on what he holds. The server computes it (checkout, the
 * coupon preview and the checkout page all call readUpgrade); the browser
 * only shows the figure the server sent («يُخصم المتبقي من باقتك الحالية: …»).
 *
 * The rule (decided here, documented in the l6-pay report):
 *   - Only a PLAN being bought (kind "plan"). The founder membership, the
 *     library, top-ups: never — checkoutCore calls readUpgrade for a plan only.
 *   - What the user holds = his `subscriptions` rows with status 'active'
 *     whose period has not ended at `now` (planEndsAtMs: a NULL end is
 *     open-ended), the same "running" set fulfilment's planWindow uses.
 *   - A running row of a HIGHER rank than the plan being bought, or an
 *     open-ended row of the SAME rank → refused at checkout ("downgrade"):
 *     today such a payment is taken and then grants nothing
 *     (planGrantDecision keeps the better row → «already entitled», money
 *     waiting for an admin refund). Refusing before any order is the safe
 *     choice; scheduling a downgrade needs the renewal machinery (B2).
 *   - A running row of the SAME rank with an end is a renewal: fulfilment
 *     stacks the new period after it, nothing is lost, no credit.
 *   - Every running row of a LOWER rank is cancelled by the grant
 *     (grant_plan_subscription cancels every active row), so each one is
 *     credited — but only from what was actually PAID for it: its
 *     metadata.order_id names a payment_orders row of this user, kind
 *     'plan', status 'paid' (not refunded / voided), live = true (never a
 *     test-mode payment), not «already entitled». Its stored net_halalas
 *     already includes any coupon, launch price or earlier credit. Admin
 *     grants, invites, trials and the founder membership (no subscriptions
 *     row; its plan id is excluded anyway) give no credit.
 *   - Days: periodDays = round((end − start) / 1 day); remainingDays =
 *     ceil((end − max(now, start)) / 1 day), clamped to [0, periodDays]. A
 *     started day counts as remaining, so an upgrade on the day of purchase
 *     credits the whole period and one on the last day credits one day. A row
 *     stacked to start in the future is credited in full.
 *   - credit = floor(paidNet × remainingDays / periodDays) per row, in
 *     halalas (never more than was paid), summed.
 *   - The credit comes off the net BEFORE VAT; VAT (15 %) is recomputed on
 *     what is left (the coupon rule's applyDiscount). If less than
 *     MIN_CHARGE_HALALAS would be left the checkout is refused: Moyasar
 *     cannot charge 0, and a credit larger than the new plan would be lost.
 *   - A coupon is never combined with a credit (٢٧٩, one discount): the
 *     checkout and the preview both refuse the code when a credit applies.
 *
 * Relative imports only (type-only for Supabase), so `node --test` loads it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { planEndsAtMs, tierRank, type TierRankTable } from "../entitlementGrantRules.ts";
import { formatHalalas } from "./catalog.ts";

export const DAY_MS = 86_400_000;
/** Moyasar's smallest charge (1 SAR). A credit leaving less is refused. */
export const MIN_CHARGE_HALALAS = 100;
/** The founder membership (src/lib/membership/founderPlan.ts FOUNDER_PLAN_ID): never a credit source. */
export const NO_CREDIT_PLAN_IDS: readonly string[] = Object.freeze(["lawyer-founder-2026"]);

export const UPGRADE_DOWNGRADE_AR = "لديك باقة أعلى سارية؛ لا يمكن شراء باقة أدنى قبل انتهائها";
export const UPGRADE_ALREADY_AR = "لديك اشتراك مفتوح في هذه الباقة بالفعل";
export const UPGRADE_CREDIT_TOO_BIG_AR =
  "رصيد المتبقي من باقتك الحالية يغطي سعر هذه الباقة؛ اختر مدة اشتراك أطول";
export const UPGRADE_NO_COUPON_AR = "لا يُجمع كود الخصم مع خصم المتبقي من باقتك الحالية";
export const UPGRADE_PENDING_AR = "لديك طلب ترقية آخر قيد الدفع — أكمله أو انتظر انتهاء مهلته";
export const UPGRADE_FAILED_AR = "تعذّر حساب المتبقي من باقتك الحالية، حاول مرة أخرى بعد قليل";

/** «يُخصم المتبقي من باقتك الحالية: ١٬٢٣٤٫٥٦ ر.س» */
export function upgradeCreditLineAr(creditHalalas: number): string {
  return `يُخصم المتبقي من باقتك الحالية: ${formatHalalas(creditHalalas)}`;
}

/** The database's backstop (20261126_60): one open / paid prorated order per (buyer, credited rows). */
export const PRORATION_ORDER_INDEX = "payment_orders_proration_once_key";

export function isProrationOrderConflict(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "23505" && typeof error.message === "string" && error.message.includes(PRORATION_ORDER_INDEX);
}

/** The columns of a `subscriptions` row the rule reads. */
export interface HeldPlanRow {
  id: string;
  plan_id?: string | null;
  tier?: string | null;
  status?: string | null;
  started_at?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

/** The columns of the payment_orders row a held plan was paid by. */
export interface SourceOrderRow {
  id: string;
  user_id: string | null;
  kind: string;
  item_id?: string | null;
  status: string;
  live: boolean | null;
  net_halalas: number;
  metadata?: Record<string, unknown> | null;
}

export interface CreditPart {
  subscriptionId: string;
  orderId: string;
  paidNetHalalas: number;
  periodDays: number;
  remainingDays: number;
  creditHalalas: number;
}

export type UpgradeDecision =
  | { kind: "none" }
  | { kind: "refused"; reason: "downgrade" | "already"; error: string }
  | { kind: "credit"; creditHalalas: number; parts: CreditPart[]; key: string };

/**
 * The days and the credit of one held row: paidNet × remainingDays /
 * periodDays, floored to a halala. 0 when the dates are unusable.
 */
export function rowCredit(
  paidNetHalalas: number,
  startMs: number,
  endMs: number,
  nowMs: number,
): { periodDays: number; remainingDays: number; creditHalalas: number } {
  const zero = { periodDays: 0, remainingDays: 0, creditHalalas: 0 };
  if (!Number.isSafeInteger(paidNetHalalas) || paidNetHalalas <= 0) return zero;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !Number.isFinite(nowMs) || endMs <= startMs) return zero;
  const periodDays = Math.round((endMs - startMs) / DAY_MS);
  if (periodDays <= 0) return zero;
  const fromMs = Math.max(nowMs, startMs);
  const remainingRaw = endMs > fromMs ? Math.ceil((endMs - fromMs) / DAY_MS) : 0;
  const remainingDays = Math.min(Math.max(remainingRaw, 0), periodDays);
  const creditHalalas = Math.floor((paidNetHalalas * remainingDays) / periodDays);
  return { periodDays, remainingDays, creditHalalas: Math.min(creditHalalas, paidNetHalalas) };
}

/** Whether a paid order may be credited (see the header). */
export function orderCreditable(order: SourceOrderRow | null | undefined, userId: string): order is SourceOrderRow {
  if (!order) return false;
  if (order.user_id !== userId) return false;
  if (order.kind !== "plan") return false;
  if (order.status !== "paid") return false;
  if (order.live !== true) return false;
  if (order.metadata?.already_entitled === true) return false;
  if (order.item_id && NO_CREDIT_PLAN_IDS.includes(order.item_id)) return false;
  return Number.isSafeInteger(order.net_halalas) && order.net_halalas > 0;
}

function parseMs(raw: string | null | undefined): number {
  if (!raw) return Number.NaN;
  return Date.parse(raw);
}

/** The order id a subscriptions row was granted by (grant_plan_subscription writes metadata.order_id). */
export function rowOrderId(row: HeldPlanRow): string | null {
  const id = row.metadata?.order_id;
  return typeof id === "string" && id ? id : null;
}

/**
 * The decision for buying a plan of `tier` now, from the user's active rows
 * and the orders that paid for them (keyed by id).
 */
export function upgradeDecision(input: {
  userId: string;
  tier: string;
  now: Date;
  ranks: TierRankTable;
  rows: readonly HeldPlanRow[] | null | undefined;
  orders: ReadonlyMap<string, SourceOrderRow>;
}): UpgradeDecision {
  const nowMs = input.now.getTime();
  const rank = tierRank(input.tier, input.ranks);
  const running = (input.rows ?? []).filter((r) => (r.status ?? "active") === "active" && planEndsAtMs(r) > nowMs);

  for (const r of running) {
    const held = tierRank(r.tier, input.ranks);
    if (held > rank) return { kind: "refused", reason: "downgrade", error: UPGRADE_DOWNGRADE_AR };
    if (held === rank && planEndsAtMs(r) === Number.POSITIVE_INFINITY) {
      return { kind: "refused", reason: "already", error: UPGRADE_ALREADY_AR };
    }
  }

  const parts: CreditPart[] = [];
  for (const r of running) {
    if (tierRank(r.tier, input.ranks) >= rank) continue;
    if (r.plan_id && NO_CREDIT_PLAN_IDS.includes(r.plan_id)) continue;
    const orderId = rowOrderId(r);
    const order = orderId ? input.orders.get(orderId) : undefined;
    if (!orderCreditable(order, input.userId)) continue;
    const startMs = parseMs(r.current_period_start ?? r.started_at);
    const endMs = parseMs(r.current_period_end);
    const c = rowCredit(order.net_halalas, startMs, endMs, nowMs);
    if (c.creditHalalas <= 0) continue;
    parts.push({
      subscriptionId: r.id,
      orderId: order.id,
      paidNetHalalas: order.net_halalas,
      periodDays: c.periodDays,
      remainingDays: c.remainingDays,
      creditHalalas: c.creditHalalas,
    });
  }
  if (parts.length === 0) return { kind: "none" };
  parts.sort((a, b) => (a.subscriptionId < b.subscriptionId ? -1 : a.subscriptionId > b.subscriptionId ? 1 : 0));
  const creditHalalas = parts.reduce((sum, p) => sum + p.creditHalalas, 0);
  return { kind: "credit", creditHalalas, parts, key: parts.map((p) => p.subscriptionId).join(",") };
}

/**
 * The net left after the credit, or null when less than MIN_CHARGE_HALALAS
 * would be left (the checkout refuses: UPGRADE_CREDIT_TOO_BIG_AR).
 */
export function netAfterCredit(netHalalas: number, creditHalalas: number): number | null {
  const left = netHalalas - Math.max(0, creditHalalas);
  return left >= MIN_CHARGE_HALALAS ? left : null;
}

/** payment_orders.metadata.proration — what the order stores (snake_case, like metadata.coupon). */
export function prorationMetadata(decision: Extract<UpgradeDecision, { kind: "credit" }>, listNetHalalas: number) {
  return {
    credit_halalas: decision.creditHalalas,
    list_net_halalas: listNetHalalas,
    key: decision.key,
    from: decision.parts.map((p) => ({
      subscription_id: p.subscriptionId,
      order_id: p.orderId,
      paid_net_halalas: p.paidNetHalalas,
      period_days: p.periodDays,
      remaining_days: p.remainingDays,
      credit_halalas: p.creditHalalas,
    })),
  };
}

/**
 * The IO half: the user's active rows and the orders that paid for them,
 * through the service client. null = could not tell (a read failed): the
 * caller answers 503 rather than charge a guess.
 */
export async function readUpgrade(
  admin: SupabaseClient,
  input: { userId: string; tier: string; now: Date; ranks: TierRankTable },
): Promise<UpgradeDecision | null> {
  const held = await readHeldPlans(admin, input);
  return held ? held.decision : null;
}

/**
 * l16 review (free-plan codes): is any OTHER paid plan running — a
 * subscriptions row that is active, not ended at `nowMs`, not a free tier,
 * whatever granted it (a paid order, a bank transfer, an admin grant, a test
 * account) — whose plan is not `planId`? A free plan granted on top of it
 * would cancel days the proration cannot give back (it credits only live
 * paid orders). The same plan is not "other": a code for the plan already
 * held, and the row a resumed redemption just granted, pass.
 */
export function otherPaidPlanRunning(rows: readonly HeldPlanRow[] | null | undefined, planId: string, nowMs: number): boolean {
  return (rows ?? []).some(
    (r) =>
      (r.status ?? "active") === "active" &&
      planEndsAtMs(r) > nowMs &&
      (r.tier ?? "free") !== "free" &&
      r.plan_id !== planId,
  );
}

/** readUpgrade's decision together with the active rows it was made from (one read). */
export async function readHeldPlans(
  admin: SupabaseClient,
  input: { userId: string; tier: string; now: Date; ranks: TierRankTable },
): Promise<{ decision: UpgradeDecision; rows: HeldPlanRow[] } | null> {
  const { data, error } = await admin
    .from("subscriptions")
    .select("id, plan_id, tier, status, started_at, current_period_start, current_period_end, metadata")
    .eq("user_id", input.userId)
    .eq("status", "active")
    .limit(20);
  if (error) {
    console.error("[payments/upgrade] reading the active plans failed:", error.code);
    return null;
  }
  const rows = Array.isArray(data) ? (data as HeldPlanRow[]) : [];
  const orderIds = [...new Set(rows.map(rowOrderId).filter((id): id is string => !!id))];
  const orders = new Map<string, SourceOrderRow>();
  if (orderIds.length > 0) {
    const { data: paid, error: ordersErr } = await admin
      .from("payment_orders")
      .select("id, user_id, kind, item_id, status, live, net_halalas, metadata")
      .eq("user_id", input.userId)
      .in("id", orderIds)
      .limit(orderIds.length);
    if (ordersErr) {
      console.error("[payments/upgrade] reading the orders behind the plans failed:", ordersErr.code);
      return null;
    }
    for (const o of Array.isArray(paid) ? (paid as SourceOrderRow[]) : []) orders.set(o.id, o);
  }
  return { decision: upgradeDecision({ userId: input.userId, tier: input.tier, now: input.now, ranks: input.ranks, rows, orders }), rows };
}
