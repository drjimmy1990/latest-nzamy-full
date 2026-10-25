/**
 * fulfillDecision.ts — the pure half of fulfilment (Moyasar payments B1,
 * Task 5): what a payment fetched from Moyasar means for an order, the dates
 * a purchase runs to, the Arabic notices, the error codes that mean "the
 * migration has not run yet", and the cron secret check.
 *
 * The IO half is ./fulfillOrder.ts (the one place a payment becomes a
 * purchase) and ./grantPurchase.ts (what a purchase grants).
 *
 * Pure: relative imports and node builtins only, so `node --test` loads it.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { planEndsAtMs, tierRank, type ActivePlanRow, type TierRankTable } from "../entitlementGrantRules.ts";
import { CYCLE_MONTHS, isCycle } from "../pricing/priceBook.ts";

export type FulfillMode = "test" | "live";

/** The columns of a payment_orders row the decision reads. */
export interface FulfillOrderView {
  id: string;
  status: string;
  total_halalas: number;
  currency: string;
  merchant?: string | null;
  moyasar_payment_id?: string | null;
}

/** The fields of a fetched Moyasar payment the decision reads (MoyasarPayment fits). */
export interface FulfillPaymentView {
  id: string;
  status: string;
  /** Halalas. */
  amount: number;
  currency: string;
  /** Only when the body carried a boolean `live` (see moyasarClient.ts). */
  live?: boolean;
  metadata: Record<string, unknown>;
}

export interface FulfillContext {
  /** The merchant the caller works for; the order must belong to it. */
  merchant?: string;
  /** The webhook body's `live`; it must agree with the gateway mode. */
  liveFlag?: boolean;
  /** The order the payer came back for (the callback's `?order=`). */
  callbackOrderId?: string;
}

export type FulfillRejectReason = "amount_mismatch" | "currency_mismatch" | "mode_mismatch" | "order_mismatch";

export type FulfillDecision =
  | "grant"
  | "already_done"
  | "record_failed"
  | "wait"
  | { reject: FulfillRejectReason };

/** Order statuses a payment can still settle (the claim's WHERE clause). */
const OPEN_ORDER_STATUSES: ReadonlySet<string> = new Set(["created", "initiated"]);

/**
 * What a fetched payment means for an order. In order:
 *   1. order_mismatch — the payment does not name this order
 *      (metadata.order_id missing or different), another payment is already
 *      stamped on the order, the order belongs to another merchant, or the
 *      callback came back for another order;
 *   2. already_done — the order is no longer open (paid, refunded, failed,
 *      voided, cancelled, or a status this code does not know): a closed
 *      order never re-opens and never grants twice;
 *   3. amount_mismatch, currency_mismatch — the payment is not the order's
 *      price;
 *   4. mode_mismatch — the payment's `live`, or the webhook's live flag,
 *      disagrees with the gateway mode. On the callback and sweep path
 *      neither is present and the mode is the mode of the key that fetched
 *      the payment;
 *   5. the payment's status: paid → grant, failed → record_failed, anything
 *      else (initiated, authorized, captured, refunded, voided, unknown) →
 *      wait. Only "paid" ever grants.
 */
export function fulfillDecision(
  order: FulfillOrderView,
  payment: FulfillPaymentView,
  mode: FulfillMode,
  ctx: FulfillContext = {},
): FulfillDecision {
  const named = payment.metadata?.order_id;
  if (typeof named !== "string" || named !== order.id) return { reject: "order_mismatch" };
  if (ctx.callbackOrderId !== undefined && ctx.callbackOrderId !== order.id) return { reject: "order_mismatch" };
  if (order.moyasar_payment_id && order.moyasar_payment_id !== payment.id) return { reject: "order_mismatch" };
  if (ctx.merchant !== undefined && (order.merchant ?? "platform") !== ctx.merchant) {
    return { reject: "order_mismatch" };
  }

  if (!OPEN_ORDER_STATUSES.has(order.status)) return "already_done";

  if (payment.amount !== order.total_halalas) return { reject: "amount_mismatch" };
  if (String(payment.currency).toUpperCase() !== String(order.currency).toUpperCase()) {
    return { reject: "currency_mismatch" };
  }

  const expectedLive = mode === "live";
  for (const flag of [payment.live, ctx.liveFlag]) {
    if (typeof flag === "boolean" && flag !== expectedLive) return { reject: "mode_mismatch" };
  }

  if (payment.status === "paid") return "grant";
  if (payment.status === "failed") return "record_failed";
  return "wait";
}

/**
 * Why a PAID payment did not settle this order, or null. A payment that is
 * not paid took no money and leaves no trace. fulfillOrder writes the answer
 * to metadata.paid_unmatched = {payment_id, reason, at} (merged), so an admin
 * finds the money that bought nothing: a rejected payment (order, amount,
 * currency or mode mismatch) or a paid payment for a closed unpaid order.
 *
 * A payment whose metadata.order_id names ANOTHER order is that order's
 * money, not this one's: it leaves no trace here (a callback
 * `?order=X&id=<Y's payment>` must never mark X, nor overwrite X's real
 * trace). Every other reject already implies the payment names this order.
 */
export function paidUnmatchedReason(
  decision: FulfillDecision,
  payment: Pick<FulfillPaymentView, "status" | "metadata">,
  order: Pick<FulfillOrderView, "id" | "status">,
): string | null {
  if (payment.status !== "paid") return null;
  if (typeof decision === "object") {
    const named = payment.metadata?.order_id;
    if (typeof named === "string" && named !== "" && named !== order.id) return null;
    return decision.reject;
  }
  if (decision === "already_done") return `order_${order.status}`;
  return null;
}

/**
 * The payment a sweep should settle an intent-only order with: among the
 * listed payments whose metadata.order_id is this order (a list Moyasar did
 * not filter can never hand over another order's payment), the paid one —
 * the newest by created_at when there are several (an unknown date sorts
 * oldest). null when none is paid — the order is left alone.
 */
export function pickPaidPayment<
  T extends { status: string; createdAt: string | null; metadata: Record<string, unknown> },
>(payments: readonly T[] | null | undefined, orderId: string): T | null {
  let best: T | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const p of payments ?? []) {
    if (p.metadata?.order_id !== orderId) continue;
    if (p.status !== "paid") continue;
    const ms = p.createdAt ? Date.parse(p.createdAt) : Number.NaN;
    const key = Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
    if (!best || key > bestMs) {
      best = p;
      bestMs = key;
    }
  }
  return best;
}

// ── resuming a paid order whose grant did not finish ────────────────────────

/**
 * How long after the claim a paid, unfulfilled order is left to the call that
 * claimed it. Only the sweep resumes, and only after this: a callback and a
 * webhook arriving together must not both run the grant. The plan grant is
 * guarded anyway — grant_plan_subscription (20261025_10) serialises a user's
 * grants under a per-user lock and re-checks subscriptions.metadata->>'order_id',
 * backed by the partial UNIQUE index subscriptions_order_id_key (20261022_30) —
 * and the delay keeps the other grants (library, points) apart as well.
 */
export const RESUME_AFTER_MS = 10 * 60 * 1000;

/** True when the sweep may finish this order's grant. */
export function resumeAllowed(
  order: { status: string; fulfilled_at: string | null; paid_at: string | null },
  nowMs: number,
): boolean {
  if (order.status !== "paid" || order.fulfilled_at || !order.paid_at) return false;
  const paidMs = Date.parse(order.paid_at);
  if (!Number.isFinite(paidMs)) return false;
  return nowMs - paidMs > RESUME_AFTER_MS;
}

// ── the sweep's windows ─────────────────────────────────────────────────────

/** An initiated order is swept once it is this old… */
export const SWEEP_INITIATED_AFTER_MS = 10 * 60 * 1000;
/** …and no longer once it is this old (an abandoned 3-D Secure page). */
export const SWEEP_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
/** Orders per sweep run, per query. */
export const SWEEP_BATCH = 50;
/** Sweep runs a paid-but-unfinished order gets before it is left to an admin. */
export const SWEEP_MAX_ATTEMPTS = 20;

function attemptsOf(metadata: Record<string, unknown> | null | undefined): number {
  const n = metadata?.sweep_attempts;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : 0;
}

/** True once a paid-but-unfinished order has used up its sweep attempts. */
export function sweepGaveUp(metadata: Record<string, unknown> | null | undefined): boolean {
  return attemptsOf(metadata) >= SWEEP_MAX_ATTEMPTS;
}

/**
 * The metadata patch after one more failed sweep attempt on a paid order: the
 * counter, and on the last attempt a paid_unmatched trace (reason
 * sweep_gave_up) so an admin sees it.
 */
export function sweepAttemptPatch(
  metadata: Record<string, unknown> | null | undefined,
  paymentId: string | null,
  atIso: string,
): Record<string, unknown> {
  const next = attemptsOf(metadata) + 1;
  if (next < SWEEP_MAX_ATTEMPTS) return { sweep_attempts: next };
  return { sweep_attempts: next, paid_unmatched: { payment_id: paymentId, reason: "sweep_gave_up", at: atIso } };
}

// ── dates ───────────────────────────────────────────────────────────────────

/** `months` calendar months after `from` (UTC), clamped to the end of a shorter month. */
export function addMonthsUtc(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/**
 * Asia/Riyadh is UTC+3 all year (the kingdom keeps no daylight saving), so a
 * fixed offset is its wall clock exactly — no Intl round trip needed.
 */
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * `months` calendar months after `from` on the RIYADH calendar, clamped to the
 * end of a shorter month: 31 Jan 10:00 Riyadh + 1 → 28 (29) Feb 10:00 Riyadh.
 * It differs from addMonthsUtc only between 21:00 and 24:00 UTC, when Riyadh
 * is already on the next day — e.g. 2026-01-30T22:00Z is 31 Jan 01:00 in
 * Riyadh, so + 1 month lands on 28 Feb 01:00 Riyadh (2026-02-27T22:00Z),
 * where the UTC rule gives 2026-02-28T22:00Z (already 1 Mar in Riyadh).
 */
export function addMonthsRiyadh(from: Date, months: number): Date {
  const wall = new Date(from.getTime() + RIYADH_OFFSET_MS);
  return new Date(addMonthsUtc(wall, months).getTime() - RIYADH_OFFSET_MS);
}

/**
 * The end of a plan period starting at `start`: 1, 3, 6 or 12 calendar months
 * on the Riyadh calendar (monthly / quarterly / semiannual / yearly). null for
 * "once" and anything that is not a cycle.
 */
export function planPeriodEnd(start: Date, billing: string): Date | null {
  return isCycle(billing) ? addMonthsRiyadh(start, CYCLE_MONTHS[billing]) : null;
}

/**
 * The window a plan bought now runs over (controller ruling, fix round 1):
 *   - `running` — the active rows still covering the user (period end null or
 *     after now). A row whose period ended is lapsed even while its status
 *     still reads 'active' (nothing moves B1 rows to 'expired'); it never
 *     blocks a purchase. planGrantDecision gets `running` only.
 *   - the SAME rank stacks: when the user holds a running row of the plan's
 *     rank with a finite end, the new period starts at the latest such end and
 *     the remaining days carry over (monthly + monthly = old end + 1 month;
 *     yearly held + monthly bought = yearly end + 1 month). An open-ended
 *     same-rank row cannot be stacked onto — the new window starts now and
 *     planGrantDecision keeps that row.
 *   - a lower rank → higher rank upgrade starts now (pro-rata is B2); a higher
 *     running rank is left to planGrantDecision, which keeps it.
 * null for a billing a plan does not have.
 */
export function planWindow<T extends ActivePlanRow>(input: {
  now: Date;
  billing: string;
  tier: string;
  activeRows: readonly T[] | null | undefined;
  ranks: TierRankTable;
}): { start: Date; end: Date; running: T[] } | null {
  const nowMs = input.now.getTime();
  const running = (input.activeRows ?? []).filter((row) => planEndsAtMs(row) > nowMs);
  const rank = tierRank(input.tier, input.ranks);
  let baseMs = nowMs;
  for (const row of running) {
    if (tierRank(row.tier, input.ranks) !== rank) continue;
    const endMs = planEndsAtMs(row);
    if (Number.isFinite(endMs) && endMs > baseMs) baseMs = endMs;
  }
  const start = new Date(baseMs);
  const end = planPeriodEnd(start, input.billing);
  return end ? { start, end, running } : null;
}

/**
 * The points a month those plans come with — LAWYER_PRO_MONTHLY_POINTS in
 * src/constants/pricing/pricing.lawyers.ts. Mirrored here, not imported: that
 * file imports @phosphor-icons/react (React context), which a route handler
 * must not load. fulfillDecision.test.ts fails if the two drift apart.
 */
export const PLAN_MONTHLY_POINTS = 1500;

/**
 * The plans that come with 1,500 points a month (PLAN_MONTHLY_POINTS):
 * the lawyer card says so (pricing.lawyers.ts) and the independent
 * consultant's card promises the same (pricing.providers.ts, owner ١٧٣).
 */
export const MONTHLY_POINTS_PLAN_IDS: ReadonlySet<string> = new Set(["lawyer-pro", "consultant-independent"]);

// ── deploy order ────────────────────────────────────────────────────────────

/**
 * True when an error means a table, column or function of the B1 migrations
 * does not exist yet (Postgres 42P01 / 42703 / 42883, PostgREST PGRST202 /
 * PGRST204 / PGRST205). The caller answers 'pending' and logs once.
 */
export function isMissingPaymentsObject(code: string | null | undefined): boolean {
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "42883" ||
    code === "PGRST202" ||
    code === "PGRST204" ||
    code === "PGRST205"
  );
}

// ── the Arabic notices ──────────────────────────────────────────────────────

export interface FulfilmentNotice {
  title: string;
  body: string;
  href: string;
}

/** The in-app notification a fulfilled order sends (title and a non-empty body). */
export function fulfilmentNoticeAr(input: {
  kind: "plan" | "library" | "topup";
  labelAr: string;
  receiptNumber: string | null;
  alreadyEntitled: boolean;
}): FulfilmentNotice {
  const label = `«${input.labelAr}»`;
  const receipt = input.receiptNumber ? ` رقم الإيصال: ${input.receiptNumber}.` : "";
  const href = "/dashboard/billing";

  if (input.alreadyEntitled) {
    return {
      title: "دفعتك قيد المراجعة",
      body: `استلمنا دفعتك مقابل ${label}، ولم نغيّر اشتراكك الحالي لأنه يشمل ما اشتريته.${receipt} ستراجع الإدارة الدفعة لاسترداد المبلغ.`,
      href,
    };
  }
  if (input.kind === "topup") {
    return {
      title: "أُضيفت النقاط إلى رصيدك",
      body: `تم الدفع وإضافة نقاط ${label} إلى رصيدك.${receipt}`,
      href,
    };
  }
  return {
    title: input.kind === "library" ? "تم تفعيل اشتراك المكتبة" : "تم تفعيل اشتراكك",
    body: `تم الدفع وتفعيل ${label}.${receipt}`,
    href,
  };
}

// ── the cron secret ─────────────────────────────────────────────────────────

/**
 * True when the `x-cron-secret` header equals CRON_SECRET. Both sides are
 * hashed with SHA-256 first, so timingSafeEqual always compares two
 * equal-length buffers and the comparison time says nothing about the secret
 * or its length. An unset or empty secret refuses everyone.
 */
export function cronSecretMatches(header: string | null | undefined, secret: string | null | undefined): boolean {
  if (typeof secret !== "string" || secret.length === 0) return false;
  if (typeof header !== "string" || header.length === 0) return false;
  const a = createHash("sha256").update(header, "utf8").digest();
  const b = createHash("sha256").update(secret, "utf8").digest();
  return timingSafeEqual(a, b);
}
