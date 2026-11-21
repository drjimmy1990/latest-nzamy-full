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
 *             A plan grants NO points (owner ٢٩١, 26 Oct 2026: standard
 *             subscriptions open with 0 points; points come from top-ups
 *             only). Until then lawyer-pro and consultant-independent orders
 *             got one 'plan_monthly' lot of 1,500 points; those lots stay as
 *             they are and are read like any other lot (balance, refunds).
 *   library → grantLibraryAccess({ source: 'purchase', orderId }), then (l7,
 *             owner 18 Nov) the plan's library-assistant points:
 *             credit_wallet_points(user, 50 / 120 / 300, 'plan', the grant's
 *             end, order, scope 'library_agent') — creditLibraryPlanPoints.
 *   topup   → credit_points(user, points, 'purchase', now + validity months, order).
 *   membership (P3, lawyer-founder-2026) → deps.activateFounder(order) — the
 *             founder_activate RPC (20261101_10), which allocates the seat,
 *             the credits, the lib-founder grant and the badge under one lock:
 *               activated                      → granted;
 *               already, the order's own seat  → granted (a retry);
 *               already, metadata.founder = 'already_member' (he paid twice),
 *               full (metadata.founder = 'seat_unavailable'), not_verified
 *                                              → { ok: true, alreadyEntitled:
 *                 true, refundReason }: nothing granted, the order stays paid
 *                 and is stamped fulfilled (so the sweep does not loop on it)
 *                 for an admin refund (ruling R7);
 *               pending_verification (l7, decision 1, 20261127_10: the
 *                 buyer's licence is still being checked; his seat is held,
 *                 counted and never expires) → { ok: true, alreadyEntitled:
 *                 false, founderPending: true }: the order is stamped
 *                 fulfilled, NOT a refund review. The admin's approval
 *                 activates the seat (founderVerification.ts), a rejection
 *                 refunds it in full;
 *               full is never answered since 20261127_10 (decision 2: a paid
 *                 order is honoured past capacity); it is still read as the
 *                 refund case for a database before that file;
 *               not_paid, an unknown answer, an RPC error → not ok (retried).
 *             No points lot: a membership never falls into the top-up branch.
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
import { addMonthsUtc, isMissingPaymentsObject, planWindow } from "./fulfillDecision.ts";
import { readLibraryPlanPoints } from "../points/pointsSettings.ts";
import { grantedTopupPoints } from "./topupBonus.ts";

/** The columns of a claimed payment_orders row a grant reads. */
export interface PurchaseOrder {
  id: string;
  user_id: string;
  kind: string;
  item_id: string;
  billing: string;
  /** payment_orders.metadata — l12: a top-up's frozen points (metadata.topup, topupBonus.ts). */
  metadata?: Record<string, unknown> | null;
}

/** Why a paid membership order granted nothing and waits for an admin refund (metadata.founder, 20261101_10). */
export type FounderRefundReason = "seat_unavailable" | "not_verified" | "already_member";

/**
 * ok with alreadyEntitled true: paid, nothing granted, refund review. For a
 * membership `refundReason` says why (absent on every other kind).
 */
export type GrantPurchaseResult =
  | {
      ok: true;
      alreadyEntitled: boolean;
      refundReason?: FounderRefundReason;
      /** l7 (decision 1): a membership paid by a lawyer whose licence is still being checked — the seat waits. */
      founderPending?: boolean;
    }
  | { ok: false; error: string; missing?: boolean };

/** founder_activate(p_order) (20261101_10): the raw RPC answer, never thrown. */
export type ActivateFounderFn = (
  orderId: string,
) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;

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
  /**
   * P3: the founder_activate RPC (wired in ./fulfillOrder.ts). Missing → a
   * membership order is not granted (not ok, the sweep retries).
   */
  activateFounder?: ActivateFounderFn;
}

type DbError = { code?: string; message?: string } | null;

function failure(step: string, error: DbError): { ok: false; error: string; missing?: boolean } {
  const missing = isMissingPaymentsObject(error?.code);
  return { ok: false, error: `${step}: ${error?.code ?? ""} ${error?.message ?? "unknown error"}`.trim(), missing };
}

async function creditOrderLot(
  admin: SupabaseClient,
  input: { userId: string; points: number; source: "purchase"; expiresAt: Date; orderId: string },
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

/**
 * l7 decision 7 (owner 18 Nov §16.2, G4): a library plan brings points for the
 * library assistant ONLY — 50 / 120 / 300 from platform_settings
 * library_plan_points — as one lot of the order: source 'plan', wallet
 * 'library_agent', expiring with the order's grant (credit_wallet_points,
 * 20261127_40). UNIQUE (order_id, source) keeps it to one lot (23505 = done).
 * `endsAt` null (a retry whose grant already existed): the grant's own end is
 * read, so a failure between the grant and the credit never loses the points.
 * A grant already over, or 0 points, credits nothing. Any other failure is not
 * ok (missing: the SQL not run yet): the order stays unfulfilled and the sweep
 * retries it — the access itself was granted.
 */
async function creditLibraryPlanPoints(
  admin: SupabaseClient,
  order: PurchaseOrder,
  planId: string,
  endsAt: string | null,
  now: Date,
): Promise<GrantPurchaseResult> {
  const points = await readLibraryPlanPoints(admin, planId);
  if (!(points > 0)) return { ok: true, alreadyEntitled: false };
  let end = endsAt;
  if (end === null) {
    const { data, error } = await admin
      .from("library_access_grants")
      .select("ends_at")
      .eq("order_id", order.id)
      .maybeSingle();
    if (error) return failure("library grant read", error);
    const read = (data as { ends_at?: unknown } | null)?.ends_at;
    end = typeof read === "string" ? read : null;
  }
  if (!end || !(Date.parse(end) > now.getTime())) return { ok: true, alreadyEntitled: false };
  const { error } = await admin.rpc("credit_wallet_points", {
    p_user: order.user_id,
    p_points: points,
    p_source: "plan",
    p_expires_at: new Date(end).toISOString(),
    p_order: order.id,
    p_ref: `order:${order.id}`,
    p_scope: "library_agent",
  });
  if (!error || error.code === "23505") return { ok: true, alreadyEntitled: false };
  return failure("credit_wallet_points", error);
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

  const done = Array.isArray(existing) && existing.length > 0;

  if (!done) {
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
    // the grant counts as done.

    // Keep auth metadata in sync (useSubscription hydration); the row is the truth.
    try {
      await admin.auth.admin.updateUserById(order.user_id, { user_metadata: { tier } });
    } catch {
      // non-fatal
    }
  }

  // No points with a plan (owner ٢٩١): an order fulfilled from now on — a
  // retry of an older one included — credits no lot. Lots credited before
  // stay as they are.
  return { ok: true, alreadyEntitled: false };
}

async function grantMembership(deps: GrantPurchaseDeps, order: PurchaseOrder): Promise<GrantPurchaseResult> {
  if (!deps.activateFounder) return { ok: false, error: "membership order without activateFounder" };
  const { data, error } = await deps.activateFounder(order.id);
  if (error) return failure("founder_activate", error);
  if (data === "activated") return { ok: true, alreadyEntitled: false };
  if (data === "full") return { ok: true, alreadyEntitled: true, refundReason: "seat_unavailable" };
  if (data === "not_verified") return { ok: true, alreadyEntitled: true, refundReason: "not_verified" };
  // l7 (decision 1, 20261127_10): paid before the licence check — the seat waits
  if (data === "pending_verification") return { ok: true, alreadyEntitled: false, founderPending: true };
  if (data === "already") {
    // 'already' is both «this order's seat is active» (a retry: success) and
    // «he holds a seat from ANOTHER order» (he paid twice: a refund). Only the
    // metadata founder_activate wrote tells them apart.
    const { data: row, error: readErr } = await deps.admin
      .from("payment_orders")
      .select("metadata")
      .eq("id", order.id)
      .maybeSingle();
    if (readErr) return failure("membership order read", readErr);
    const founder = (row as { metadata?: Record<string, unknown> | null } | null)?.metadata?.founder;
    return founder === "already_member"
      ? { ok: true, alreadyEntitled: true, refundReason: "already_member" }
      : { ok: true, alreadyEntitled: false };
  }
  // not_paid (the claim precedes the grant, so a retry sees it paid) or an answer this code does not know
  return { ok: false, error: `founder_activate answered ${String(data).slice(0, 40)}` };
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

    if (item.kind === "membership") {
      return await grantMembership(deps, order);
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
      if (grant.ok) return await creditLibraryPlanPoints(deps.admin, order, item.id, grant.endsAt, now);
      // library_access_grants.order_id UNIQUE: this order's grant already exists
      // (a retry) → granted; its points are credited now if an earlier try
      // stopped short of them
      if (grant.code === "23505") return await creditLibraryPlanPoints(deps.admin, order, item.id, null, now);
      return { ok: false, error: `library grant: ${grant.error}`, missing: isMissingPaymentsObject(grant.code) };
    }

    // topup
    if (!item.points || !item.pointsValidityMonths) {
      return { ok: false, error: `top-up ${item.id} has no points or validity` };
    }
    // l12 (owner Q88a / ١٦٢): the points the checkout froze in the order — the
    // pack's own points plus any admin-set bonus — else the pack's own points
    const lot = await creditOrderLot(deps.admin, {
      userId: order.user_id,
      points: grantedTopupPoints(item.points, order.metadata),
      source: "purchase",
      expiresAt: addMonthsUtc(now, item.pointsValidityMonths),
      orderId: order.id,
    });
    return lot.ok ? { ok: true, alreadyEntitled: false } : lot;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
