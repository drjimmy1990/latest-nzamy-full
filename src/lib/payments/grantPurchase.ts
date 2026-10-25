/**
 * grantPurchase.ts — what a paid order grants (Moyasar payments B1, Task 5).
 * Runs with the service role, after the order was claimed
 * (claim_payment_order, 20261022_30), never before. Its IO comes in through
 * `deps` (the service client, the library grant, the tier ranking), wired by
 * ./fulfillOrder.ts, so `node --test` can drive it with a fake client
 * (grantPurchase.test.ts).
 *
 *   plan    → a `subscriptions` row: plan_id = item.id, tier = item.tier,
 *             billing_cycle = order.billing, auto_renew false (B2 turns it on),
 *             payment_method_id = the saved card's row, metadata {order_id,
 *             method: 'moyasar', replaced_ids}; the user's active rows are
 *             cancelled and the row inserted in ONE transaction by the
 *             grant_plan_subscription RPC (20261025_10), so an error between
 *             the two never leaves the user without their previous plan; then
 *             user_metadata.tier is stamped.
 *             The window (planWindow, ./fulfillDecision.ts): one month or one
 *             year from now; on the SAME rank it starts at the end of the
 *             running row, so the remaining days carry over. Lapsed rows (period
 *             ended, status still 'active') never block. planGrantDecision
 *             guards the rest: a higher-ranked running plan (or an open-ended
 *             one of the same rank) is never replaced — the result is
 *             `alreadyEntitled` and the order is left paid for an admin refund.
 *             lawyer-pro and consultant-independent also get a plan_monthly lot
 *             of PLAN_MONTHLY_POINTS (= LAWYER_PRO_MONTHLY_POINTS) expiring at
 *             the period end (monthly) or after one month (yearly; B2 tops up
 *             the later months).
 *   library → grantLibraryAccess({ source: 'purchase', orderId }).
 *   topup   → credit_points(user, points, 'purchase', now + validity months, order).
 *
 * EXACTLY ONCE: every grant is keyed on the order, so a retry (the sweep, or a
 * second caller) never grants twice —
 *   subscriptions: the order's row is looked up first; grant_plan_subscription
 *     takes a per-user lock and looks again, answering inserted = false when
 *     another call wrote it (the grant counts as done); the partial UNIQUE
 *     index on metadata->>'order_id' (20261022_30) backs both;
 *   library_access_grants.order_id UNIQUE (23505 = already granted);
 *   points_lots UNIQUE (order_id, source) (23505 = already credited).
 *
 * Never throws. A missing table or function (the migrations not applied yet)
 * comes back as `{ ok: false, missing: true }`; the order then stays
 * unfulfilled and the sweep retries it.
 *
 * Relative imports only (and type-only package imports): `node --test` loads it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { planGrantDecision, type ActivePlanRow, type TierRankTable } from "../entitlementGrantRules.ts";
import type { LibraryGrantSource, LibraryPlanRef } from "../libraryAccess.ts";
import { resolveItem, type PayableItem } from "./catalog.ts";
import {
  addMonthsUtc,
  isMissingPaymentsObject,
  MONTHLY_POINTS_PLAN_IDS,
  PLAN_MONTHLY_POINTS,
  planWindow,
} from "./fulfillDecision.ts";

/** The columns of a claimed payment_orders row a grant reads. */
export interface PurchaseOrder {
  id: string;
  user_id: string;
  kind: string;
  item_id: string;
  billing: string;
}

export type GrantPurchaseResult =
  | { ok: true; alreadyEntitled: boolean }
  | { ok: false; error: string; missing?: boolean };

export type GrantLibraryFn = (input: {
  userId: string;
  planRef: LibraryPlanRef;
  days: number;
  source: LibraryGrantSource;
  orderId?: string | null;
}) => Promise<{ ok: true; endsAt: string } | { ok: false; error: string; code?: string }>;

export interface GrantPurchaseDeps {
  /** The service-role client. */
  admin: SupabaseClient;
  /** grantLibraryAccess (src/lib/libraryAccessServer.ts). */
  grantLibrary: GrantLibraryFn;
  /** TIER_RANK (src/lib/access-control.ts). */
  ranks: TierRankTable;
  /**
   * The halala catalogue (PAYABLE_ITEMS unless a test passes a fixture). Looked
   * up with resolveItem — RETIRED items included: an order paid for a plan
   * that has since been retired is still fulfilled.
   */
  catalog?: Readonly<Record<string, PayableItem>>;
}

type DbError = { code?: string; message?: string } | null;

/** A lot must outlive the call by at least this much, or it is not credited. */
const MIN_LOT_LIFETIME_MS = 60 * 1000;

function failure(step: string, error: DbError): { ok: false; error: string; missing?: boolean } {
  const missing = isMissingPaymentsObject(error?.code);
  return { ok: false, error: `${step}: ${error?.code ?? ""} ${error?.message ?? "unknown error"}`.trim(), missing };
}

async function creditOrderLot(
  admin: SupabaseClient,
  input: { userId: string; points: number; source: "purchase" | "plan_monthly"; expiresAt: Date; orderId: string },
): Promise<{ ok: true } | { ok: false; error: string; missing?: boolean }> {
  const { error } = await admin.rpc("credit_points", {
    p_user: input.userId,
    p_points: input.points,
    p_source: input.source,
    p_expires_at: input.expiresAt.toISOString(),
    p_order: input.orderId,
    p_ref: `order:${input.orderId}`,
  });
  if (!error) return { ok: true };
  // UNIQUE (order_id, source): this order's lot already exists
  if (error.code === "23505") return { ok: true };
  return failure("credit_points", error);
}

async function grantPlan(
  deps: GrantPurchaseDeps,
  order: PurchaseOrder,
  item: PayableItem,
  paymentMethodId: string | null,
  now: Date,
): Promise<GrantPurchaseResult> {
  const { admin } = deps;
  const tier = item.tier;
  if (!tier) return { ok: false, error: `plan ${item.id} has no tier` };

  // Already granted for this order (a retry after a later step failed)?
  const { data: existing, error: existingErr } = await admin
    .from("subscriptions")
    .select("id, current_period_end")
    .eq("user_id", order.user_id)
    .eq("metadata->>order_id", order.id)
    .limit(1);
  if (existingErr) return failure("subscriptions read", existingErr);

  let periodEnd: Date | null;
  const done = Array.isArray(existing) ? (existing[0] as { current_period_end?: string | null } | undefined) : undefined;

  if (done) {
    periodEnd = done.current_period_end ? new Date(done.current_period_end) : null;
  } else {
    const { data: activeRows, error: activeErr } = await admin
      .from("subscriptions")
      .select("id, tier, status, current_period_end")
      .eq("user_id", order.user_id)
      .eq("status", "active");
    // Fail closed: what the user holds must be known before anything is cancelled.
    if (activeErr) return failure("active subscriptions read", activeErr);

    const window = planWindow({
      now,
      billing: order.billing,
      tier,
      activeRows: (activeRows as ActivePlanRow[] | null) ?? [],
      ranks: deps.ranks,
    });
    if (!window) return { ok: false, error: `plan order with billing ${order.billing}` };
    periodEnd = window.end;

    // Only the rows still running are protected; a lapsed row is cancelled below.
    const decision = planGrantDecision({
      activeRows: window.running,
      tier,
      newPeriodEnd: window.end,
      ranks: deps.ranks,
    });
    if (decision.keepExisting) return { ok: true, alreadyEntitled: true };

    // ONE transaction (grant_plan_subscription, 20261025_10): under a per-user
    // lock it re-checks that the running rows are still the ones this window
    // was computed from, cancels every active row and inserts the order's row.
    // An error anywhere rolls the cancel back, so the previous plan survives.
    const { data: granted, error: grantErr } = await admin.rpc("grant_plan_subscription", {
      p_order: order.id,
      p_user: order.user_id,
      p_plan_id: item.id,
      p_tier: tier,
      p_billing: order.billing,
      p_period_start: window.start.toISOString(),
      p_period_end: window.end.toISOString(),
      p_payment_method: paymentMethodId,
      p_now: now.toISOString(),
      p_running: window.running.map(row => ({ id: row.id, tier: row.tier, current_period_end: row.current_period_end ?? null })),
    });
    // 40001 grant_plan_stale: the user's plans changed since the read above —
    // a failure, so fulfilled_at stays null and the sweep retries with a fresh read.
    if (grantErr) return failure("grant_plan_subscription", grantErr);
    const result = (granted ?? null) as { inserted?: boolean; current_period_end?: string | null } | null;
    if (!result || typeof result.inserted !== "boolean") {
      return { ok: false, error: "grant_plan_subscription: no result" };
    }
    // inserted false: another call already wrote this order's row (a retry) —
    // the grant counts as done, with that row's period.
    if (!result.inserted) {
      periodEnd = result.current_period_end ? new Date(result.current_period_end) : periodEnd;
    }

    // Keep auth metadata in sync (useSubscription hydration); the row is the truth.
    try {
      await admin.auth.admin.updateUserById(order.user_id, { user_metadata: { tier } });
    } catch {
      // non-fatal
    }
  }

  if (MONTHLY_POINTS_PLAN_IDS.has(item.id)) {
    const expiresAt = order.billing === "monthly" && periodEnd ? periodEnd : addMonthsUtc(now, 1);
    if (expiresAt.getTime() - now.getTime() > MIN_LOT_LIFETIME_MS) {
      const lot = await creditOrderLot(admin, {
        userId: order.user_id,
        points: PLAN_MONTHLY_POINTS,
        source: "plan_monthly",
        expiresAt,
        orderId: order.id,
      });
      if (!lot.ok) return lot;
    } else {
      console.warn("[payments] grantPurchase: the plan period already ended; no monthly points for order", order.id);
    }
  }

  return { ok: true, alreadyEntitled: false };
}

export async function grantPurchase(
  deps: GrantPurchaseDeps,
  order: PurchaseOrder,
  opts: { paymentMethodId?: string | null; now?: Date } = {},
): Promise<GrantPurchaseResult> {
  try {
    if (!order.user_id) return { ok: false, error: "order has no user" };
    const item = resolveItem(order.item_id, deps.catalog);
    if (!item) return { ok: false, error: `unknown item ${order.item_id}` };
    if (item.kind !== order.kind) {
      return { ok: false, error: `order kind ${order.kind} does not match item kind ${item.kind}` };
    }
    const now = opts.now ?? new Date();

    if (item.kind === "plan") {
      return await grantPlan(deps, order, item, opts.paymentMethodId ?? null, now);
    }

    if (item.kind === "library") {
      if (!item.libraryPlanRef || !item.libraryDays) {
        return { ok: false, error: `library item ${item.id} has no plan or length` };
      }
      const grant = await deps.grantLibrary({
        userId: order.user_id,
        planRef: item.libraryPlanRef,
        days: item.libraryDays,
        source: "purchase",
        orderId: order.id,
      });
      if (grant.ok) return { ok: true, alreadyEntitled: false };
      // library_access_grants.order_id UNIQUE: this order's grant already exists
      if (grant.code === "23505") return { ok: true, alreadyEntitled: false };
      return { ok: false, error: `library grant: ${grant.error}`, missing: isMissingPaymentsObject(grant.code) };
    }

    // topup
    if (!item.points || !item.pointsValidityMonths) {
      return { ok: false, error: `top-up ${item.id} has no points or validity` };
    }
    const lot = await creditOrderLot(deps.admin, {
      userId: order.user_id,
      points: item.points,
      source: "purchase",
      expiresAt: addMonthsUtc(now, item.pointsValidityMonths),
      orderId: order.id,
    });
    return lot.ok ? { ok: true, alreadyEntitled: false } : lot;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
