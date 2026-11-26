/**
 * freeActivationCore.ts — batch l18 (owner's urgent package of 26 Nov,
 * decision ق٢٦-١١ which settles question ٢٢٤; LIVE-11 / LIVE-13): a code that
 * brings the price to 0 is activated at once, with a 0 SAR free-activation
 * receipt, no card and no Moyasar.
 *
 *   activateFullDiscountWith — checkout's step 3f (checkoutCore.ts): a
 *     DISCOUNT code (100 %, or a fixed amount at least the price) that leaves
 *     less than Moyasar's smallest charge. Every gate before it in checkout
 *     still applied (audience, library lock, consultant, licence, what the
 *     buyer holds). Here:
 *       1. a plan: any other paid plan with days left refuses (409) — a free
 *          activation never silently cancels days that were paid for (the
 *          redeem box's rule, couponRedeemCore);
 *       2. coupon_redeem_full_open (20261208_30) under the coupon's row lock:
 *          once per user, uses left (with live checkout reservations), and the
 *          code must really cover the price — the database re-does the
 *          arithmetic;
 *       3. the item is granted (grantRedeemedItem) keyed on the redemption,
 *          then coupon_redeem_finish: granted, or void (the use comes back)
 *          when a higher plan turned out to run. A transient failure leaves
 *          the redemption opened: the next try resumes it;
 *       4. 201 {freeActivation: {...}} — the page shows «تم التفعيل مجاناً»
 *          and the receipt link (/dashboard/billing/activation/<id>).
 *     Never a payment_orders row (its total stays > 0).
 *   grantRedeemedItem — what a redemption grants, for this path and for the
 *     free-plan code box (couponRedeemCore): a PLAN through grantPurchase's
 *     plan path keyed on the redemption id (grant_plan_subscription — never
 *     twice); a LIBRARY pass, or the bundle's library part, through
 *     coupon_redeem_grant_library (20261208_30 — exactly once, with the pass's
 *     library-assistant points). The order-keyed library grant of a paid
 *     order cannot be used: library_access_grants.order_id and
 *     points_lots.order_id reference payment_orders.
 *
 * Missing objects (20261208_30 not run) → 503 «تفعيل الأكواد غير متاح
 * حالياً», nothing granted. Never a 500.
 *
 * Pure: relative imports only (type-only for Supabase), so `node --test` loads it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PAYABLE_ITEMS, resolveItem, type Billing, type PayableItem } from "./catalog.ts";
import { COUPON_INVALID_AR, COUPON_NOT_FOR_ITEM_AR } from "./couponRules.ts";
import { COUPON_PENDING_AR } from "./couponServer.ts";
import { DEMO_LIVE_PAYMENT_AR } from "../api/dbErrorCore.ts";
import { grantPurchase } from "./grantPurchase.ts";
import { isMissingPaymentsObject } from "./fulfillDecision.ts";
import { otherPaidPlanRunning, readHeldPlans } from "./upgradeProration.ts";
import { readLibraryPlanPoints } from "../points/pointsSettings.ts";
import type { TierRankTable } from "../entitlementGrantRules.ts";

export const FREE_ACTIVATION_UNAVAILABLE_AR = "تفعيل الأكواد غير متاح حالياً، حاول مرة أخرى بعد قليل";
export const FREE_ACTIVATION_PAID_PLAN_RUNNING_AR =
  "لديك باقة مدفوعة سارية لم تنتهِ أيامها، وتفعيل هذا الكود الآن يلغي ما تبقى منها. فعّله بعد انتهائها، أو تواصل مع الدعم.";
export const FREE_ACTIVATION_HIGHER_PLAN_AR = "لديك باقة أعلى سارية، فلا يُضاف إليها هذا الكود.";
/** l18 review: an open payment for the same item may still go through — never a free activation beside it. */
export const FREE_ACTIVATION_OPEN_ORDER_AR =
  "لديك عملية دفع مفتوحة لهذا الاشتراك لم تُغلق بعد. انتظر قليلاً ثم أعد المحاولة، وراجع «الفواتير» قبل أي دفع جديد.";

/** What the checkout answers for a 0 SAR activation (in place of the Moyasar intent). */
export interface FreeActivationResponse {
  freeActivation: {
    redemptionId: string;
    receiptNumber: string;
    itemId: string;
    labelAr: string;
    billing: Billing;
    couponCode: string;
    listNet: number;
  };
}

export type FreeActivationReply =
  // 201: the activation was created (no payment intent) — never confused with checkout's 200 intent
  | { status: 201; body: FreeActivationResponse }
  | { status: 400 | 403 | 409 | 503; body: { error: string } };

export type GrantRedeemedResult =
  | { ok: true; subscriptionId: string | null }
  | { ok: false; alreadyEntitled: true }
  | { ok: false; alreadyEntitled?: false; error: string; missing?: boolean };

const fail = (status: 400 | 403 | 409 | 503, error: string): FreeActivationReply => ({ status, body: { error } });

/** coupon_redeem_finish (20261206_30): 'granted' / 'void' / the row's status; null on an error. */
export async function finishRedemption(admin: SupabaseClient, id: string, ok: boolean, subscriptionId: string | null): Promise<string | null> {
  const { data, error } = await admin.rpc("coupon_redeem_finish", { p_redemption: id, p_ok: ok, p_subscription: subscriptionId });
  if (error) {
    console.error("[coupons/free] closing the redemption failed:", id, error.code);
    return null;
  }
  return typeof data === "string" ? data : null;
}

/** The plan row this redemption granted (metadata.order_id = the redemption id): its id, and the method set to «coupon». */
export async function markRedemptionPlanRow(admin: SupabaseClient, userId: string, redemptionId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("subscriptions")
    .select("id, metadata")
    .eq("user_id", userId)
    .eq("metadata->>order_id", redemptionId)
    .limit(1);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as { id: string; metadata?: Record<string, unknown> | null };
  const metadata = { ...(row.metadata ?? {}), method: "coupon", coupon_redemption_id: redemptionId };
  const { error: upErr } = await admin.from("subscriptions").update({ metadata }).eq("id", row.id);
  if (upErr) console.warn("[coupons/free] stamping the plan row's method failed:", row.id, upErr.code);
  return row.id;
}

/**
 * One admin audit row per redemption that granted something (actor_type
 * 'user'); best effort — the grant and its receipt stand without it.
 */
export async function auditRedemption(
  admin: SupabaseClient,
  input: { userId: string; couponId: string; code: string; redemptionId: string; receiptNumber: string; kind: "points" | "plan"; itemId: string | null; points: number | null; via?: "code_box" | "checkout" },
): Promise<void> {
  try {
    const { error } = await admin.from("admin_audit_events").insert({
      actor_id: input.userId,
      actor_type: "user",
      action: "coupon_redeemed",
      target_type: "coupon",
      target_id: input.couponId,
      before_state: null,
      after_state: null,
      metadata: {
        code: input.code,
        redemption_id: input.redemptionId,
        receipt_number: input.receiptNumber,
        kind: input.kind,
        item_id: input.itemId,
        points: input.points,
        ...(input.via ? { via: input.via } : {}),
      },
    });
    if (error) console.error("[coupons/free] the audit row failed:", error.code);
  } catch {
    console.error("[coupons/free] the audit row threw");
  }
}

/** The library pass of a redemption, exactly once (coupon_redeem_grant_library, 20261208_30). */
async function grantRedemptionLibrary(
  admin: SupabaseClient,
  redemptionId: string,
  planRef: string,
  days: number,
  now: Date,
): Promise<{ ok: true } | { ok: false; error: string; missing?: boolean }> {
  const points = await readLibraryPlanPoints(admin, planRef);
  const { data, error } = await admin.rpc("coupon_redeem_grant_library", {
    p_redemption: redemptionId,
    p_plan_ref: planRef,
    p_days: days,
    p_points: Number.isSafeInteger(points) && points > 0 ? points : 0,
    p_now: now.toISOString(),
  });
  if (error) return { ok: false, error: `coupon_redeem_grant_library: ${error.code ?? ""}`, missing: isMissingPaymentsObject(error.code) };
  const status = (data as { status?: unknown } | null)?.status;
  return status === "granted" || status === "done" ? { ok: true } : { ok: false, error: `coupon_redeem_grant_library answered ${String(status).slice(0, 40)}` };
}

/**
 * What a redemption grants: a plan (and the bundle's library part), or a
 * library pass. Keyed on the redemption id, so a retry never grants twice.
 */
export async function grantRedeemedItem(
  deps: { admin: SupabaseClient; ranks: TierRankTable; catalog?: Readonly<Record<string, PayableItem>> },
  r: { id: string; userId: string; item: PayableItem; billing: Billing },
  now: Date,
): Promise<GrantRedeemedResult> {
  const { admin } = deps;
  const catalog = deps.catalog ?? PAYABLE_ITEMS;
  if (r.item.kind === "plan") {
    // the plan alone through the paid-order path (keyed on the redemption id);
    // the bundle's library part goes through the redemption's own function below
    const planOnly: PayableItem = { ...r.item, libraryByBilling: undefined };
    const granted = await grantPurchase(
      {
        admin,
        ranks: deps.ranks,
        catalog: { ...catalog, [r.item.id]: planOnly },
        grantLibrary: async () => ({ ok: false as const, error: "the redemption grants its library part itself" }),
      },
      { id: r.id, user_id: r.userId, kind: "plan", item_id: r.item.id, billing: r.billing, metadata: null },
      { now },
    );
    if (!granted.ok) return { ok: false, error: granted.error, missing: granted.missing };
    if (granted.alreadyEntitled) return { ok: false, alreadyEntitled: true };
    const subscriptionId = await markRedemptionPlanRow(admin, r.userId, r.id);
    const part = r.item.libraryByBilling && Object.hasOwn(r.item.libraryByBilling, r.billing) ? r.item.libraryByBilling[r.billing] : undefined;
    if (part) {
      const lib = await grantRedemptionLibrary(admin, r.id, part.planRef, part.days, now);
      if (!lib.ok) return { ok: false, error: lib.error, missing: lib.missing };
    }
    return { ok: true, subscriptionId };
  }
  if (r.item.kind === "library") {
    if (!r.item.libraryPlanRef || !r.item.libraryDays) return { ok: false, error: `library item ${r.item.id} has no plan or length` };
    const lib = await grantRedemptionLibrary(admin, r.id, r.item.libraryPlanRef, r.item.libraryDays, now);
    return lib.ok ? { ok: true, subscriptionId: null } : { ok: false, error: lib.error, missing: lib.missing };
  }
  return { ok: false, error: `a redemption cannot grant a ${r.item.kind}` };
}

export interface FullDiscountInput {
  userId: string;
  coupon: { id: string; code: string };
  item: PayableItem;
  billing: Billing;
  /** The net before the coupon (after a launch price), in halalas — the receipt's «السعر الكامل». */
  listNetHalalas: number;
  now: Date;
  /**
   * l18 review: the gateway's mode at this checkout. A TEST ACCOUNT
   * (public.is_test_account, 20261127_80) is activated only in test mode —
   * the rule its paid orders follow (test_account_payment_guard). Absent →
   * treated as live.
   */
  gatewayMode?: "test" | "live";
}

/** Checkout's step 3f: the 0 SAR activation of a code that covers the whole price. */
export async function activateFullDiscountWith(
  deps: { admin: SupabaseClient; ranks?: TierRankTable; catalog?: Readonly<Record<string, PayableItem>> },
  input: FullDiscountInput,
): Promise<FreeActivationReply> {
  const { admin } = deps;
  const ranks = deps.ranks;
  const catalog = deps.catalog ?? PAYABLE_ITEMS;
  const kind = input.item.kind === "plan" || input.item.kind === "library" ? input.item.kind : null;
  // a top-up, the founder membership or a service is never activated free (س٢١٣ ب; couponRules refuses them earlier)
  if (!kind) return fail(400, COUPON_NOT_FOR_ITEM_AR);
  if (!Number.isSafeInteger(input.listNetHalalas) || input.listNetHalalas <= 0) return fail(400, COUPON_INVALID_AR);
  if (kind === "plan" && !ranks) {
    console.error("[coupons/free] a plan activation without the tier ranking");
    return fail(503, FREE_ACTIVATION_UNAVAILABLE_AR);
  }

  // 1. a plan: never cancels paid days silently
  if (kind === "plan" && input.item.tier && ranks) {
    const read = await readHeldPlans(admin, { userId: input.userId, tier: input.item.tier, now: input.now, ranks });
    if (!read) return fail(503, FREE_ACTIVATION_UNAVAILABLE_AR);
    if (read.decision.kind === "refused") return fail(409, read.decision.error);
    if (read.decision.kind === "credit") return fail(409, FREE_ACTIVATION_PAID_PLAN_RUNNING_AR);
    if (otherPaidPlanRunning(read.rows, input.item.id, input.now.getTime())) return fail(409, FREE_ACTIVATION_PAID_PLAN_RUNNING_AR);
  }

  // 1b. a test account: never a real activation outside test mode (l18 review;
  // the same rule as its paid orders, 20261127_80)
  if (input.gatewayMode !== "test") {
    const { data: isTest, error: testErr } = await admin.rpc("is_test_account", { p_user: input.userId });
    if (testErr) {
      if (!isMissingPaymentsObject(testErr.code)) console.error("[coupons/free] is_test_account failed:", testErr.code);
      return fail(503, FREE_ACTIVATION_UNAVAILABLE_AR);
    }
    if (isTest === true) return fail(403, DEMO_LIVE_PAYMENT_AR);
  }

  // 2. the redemption, under the coupon's row lock
  const { data: opened, error: openErr } = await admin.rpc("coupon_redeem_full_open", {
    p_user: input.userId,
    p_coupon: input.coupon.id,
    p_kind: kind,
    p_item: input.item.id,
    p_billing: input.billing,
    p_list_net: input.listNetHalalas,
    p_now: input.now.toISOString(),
  });
  if (openErr) {
    if (!isMissingPaymentsObject(openErr.code)) console.error("[coupons/free] coupon_redeem_full_open failed:", openErr.code);
    return fail(503, FREE_ACTIVATION_UNAVAILABLE_AR);
  }
  const answer = (opened ?? {}) as { status?: unknown; reason?: unknown; id?: unknown; item_id?: unknown; billing?: unknown; receipt_number?: unknown };
  const status = typeof answer.status === "string" ? answer.status : "";
  // l18 review: an open order of this buyer that may still be paid — carrying
  // this code, or for this item (checkout closed what it could first)
  if (status === "pending") return fail(409, answer.reason === "coupon" ? COUPON_PENDING_AR : FREE_ACTIVATION_OPEN_ORDER_AR);
  if (status === "invalid" || status === "already_used" || status === "exhausted" || status === "not_discount") return fail(400, COUPON_INVALID_AR);
  if (status === "not_for_item") return fail(400, COUPON_NOT_FOR_ITEM_AR);
  const id = typeof answer.id === "string" ? answer.id : "";
  const receiptNumber = typeof answer.receipt_number === "string" ? answer.receipt_number : "";
  if ((status !== "opened" && status !== "resume") || !id || !receiptNumber) {
    // not_full (the database's arithmetic disagrees) or an unknown answer: never a guess
    console.error("[coupons/free] coupon_redeem_full_open gave an unexpected answer:", String(status).slice(0, 40));
    return fail(503, FREE_ACTIVATION_UNAVAILABLE_AR);
  }
  // resume: the item the open redemption names (a retry may come from another page)
  const itemId = typeof answer.item_id === "string" ? answer.item_id : input.item.id;
  const billingRaw = typeof answer.billing === "string" ? answer.billing : input.billing;
  const item = resolveItem(itemId, catalog);
  if (!item || !Object.hasOwn(item.prices, billingRaw)) {
    console.error("[coupons/free] the redemption names an item that cannot be granted:", id);
    return fail(503, FREE_ACTIVATION_UNAVAILABLE_AR);
  }
  const billing = billingRaw as Billing;

  // 3. the grant, then the close
  const granted = await grantRedeemedItem({ admin, ranks: ranks ?? {}, catalog }, { id, userId: input.userId, item, billing }, input.now);
  if (!granted.ok) {
    if (granted.alreadyEntitled) {
      await finishRedemption(admin, id, false, null);
      return fail(409, FREE_ACTIVATION_HIGHER_PLAN_AR);
    }
    console.error("[coupons/free] granting failed (the redemption stays open for a retry):", id, granted.error);
    return fail(503, FREE_ACTIVATION_UNAVAILABLE_AR);
  }
  const closed = await finishRedemption(admin, id, true, granted.subscriptionId);
  if (closed !== "granted") console.error("[coupons/free] granted but the redemption did not close:", id, closed);
  await auditRedemption(admin, {
    userId: input.userId,
    couponId: input.coupon.id,
    code: input.coupon.code,
    redemptionId: id,
    receiptNumber,
    kind: "plan",
    itemId: item.id,
    points: null,
    via: "checkout",
  });
  return {
    status: 201,
    body: {
      freeActivation: {
        redemptionId: id,
        receiptNumber,
        itemId: item.id,
        labelAr: item.labelAr,
        billing,
        couponCode: input.coupon.code,
        listNet: input.listNetHalalas,
      },
    },
  };
}
