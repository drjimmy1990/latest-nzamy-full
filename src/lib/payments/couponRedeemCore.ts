/**
 * couponRedeemCore.ts — «تفعيل كود» (batch l16, A-08 / A-59 / E-12; owner
 * 25 Nov §7.7.3 and decision س٢١٣). POST /api/v1/coupons/redeem builds the
 * clients and calls redeemCouponWith; the tests drive it with a fake client.
 *
 *   0. the buyer's coupon try budget (couponAttempts.ts — the same budget as
 *      the preview and checkout): spent → 429 before any read; every refusal
 *      of a code spends a try;
 *   1. profiles.user_type (service role): an error or no row → 503;
 *   2. the coupon by its normalised code: unknown, inactive or outside its
 *      dates → 400 COUPON_INVALID_AR (one sentence for all — the answer must
 *      not tell a guesser which codes exist); unreadable / not migrated → 503;
 *   3. a DISCOUNT code (fixed / percentage) is not redeemed here: 200
 *      {kind: "discount"} only when this buyer could use it (audience, not
 *      used before, first-order rule — the same sentence otherwise; every
 *      call spends a try) — the box says it applies at checkout, and while
 *      online payment is off it rides on the activation request
 *      (manualRequest.ts);
 *   4. a FREE-PLAN code: the plan it names on sale in its billing
 *      (couponGrantRules.grantablePlan), then the gates checkout applies to
 *      buying that plan, so the box is never a way around them: the account
 *      type (buyerAllowed → 403), the independent consultant and the office
 *      plans (403; a failed read → 503, fail-closed), what the buyer holds
 *      (readHeldPlans: a higher or open-ended plan → 409 with its reason; a
 *      lower PAID plan with days left → 409 — a free plan never silently
 *      cancels days he paid for; l16 review: so does ANY other non-free plan
 *      with days left, whatever granted it — otherPaidPlanRunning; a failed
 *      read → 503);
 *   5. coupon_redeem_open (20261206_30) under the coupon's row lock: once per
 *      user, uses left, the audience again; a POINTS code is credited there
 *      (a gift lot, gift_valid_days) and answers granted; a PLAN code answers
 *      opened (or resume after an interrupted grant) and is granted here by
 *      grantPurchase's plan path keyed on the redemption id
 *      (grant_plan_subscription — never twice), then closed by
 *      coupon_redeem_finish: granted, or void (the use comes back) when a
 *      higher plan turned out to run. A transient grant failure leaves it
 *      opened: the next try resumes it;
 *   6. 200 {kind: "points" | "plan", …, receiptNumber, redemptionId}: the
 *      free-activation receipt (/dashboard/billing/activation/<id>) shows the
 *      three lines — full price, 100 % discount, net 0.
 * Missing objects (the migration not run) → 503 «تفعيل الأكواد غير متاح
 * حالياً», nothing written. Never a 500.
 *
 * Pure: relative imports only (type-only for Supabase), so `node --test` loads it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buyerAllowed, resolveItem, PAYABLE_ITEMS, type Billing, type PayableItem } from "./catalog.ts";
import { COUPON_INVALID_AR, isFirstOrderCoupon, normalizeCouponCode } from "./couponRules.ts";
import { alreadyUsed, hasEarlierPaidOrder } from "./couponServer.ts";
import { COUPON_ATTEMPTS, RATE_LIMITED_AR, type CouponAttemptBudget } from "./couponAttempts.ts";
import { grantablePlan, isGrantCouponType } from "./couponGrantRules.ts";
import { otherPaidPlanRunning, readHeldPlans } from "./upgradeProration.ts";
import { readConsultantStanding } from "../auth/consultantScopeServer.ts";
import { CONSULTANT_REFUSED_PLAN_ID_LIST } from "../pricing/audienceForUserType.ts";
import { isMissingPaymentsObject } from "./fulfillDecision.ts";
import { grantPurchase } from "./grantPurchase.ts";
import type { TierRankTable } from "../entitlementGrantRules.ts";

export const REDEEM_UNAVAILABLE_AR = "تفعيل الأكواد غير متاح حالياً، حاول مرة أخرى بعد قليل";
export const REDEEM_AUDIENCE_AR = "هذا الكود لباقة غير متاحة لنوع حسابك";
export const REDEEM_CONSULTANT_AR = "هذا الكود لباقة «إدارة المكتب»، وحساب المستشار القانوني المستقل للمكتبة وحدها.";
export const REDEEM_CHECK_FAILED_AR = "تعذّر التحقق من صلاحية الحساب الآن، حاول مرة أخرى بعد قليل";
export const REDEEM_PAID_PLAN_RUNNING_AR =
  "لديك باقة مدفوعة سارية لم تنتهِ أيامها، وتفعيل الكود الآن يلغي ما تبقى منها. فعّله بعد انتهائها، أو تواصل مع الدعم.";
export const REDEEM_HIGHER_PLAN_AR = "لديك باقة أعلى سارية، فلا يُضاف إليها هذا الكود.";
export const DISCOUNT_CODE_NOTE_AR =
  "هذا كود خصم صالح للشراء: يُطبَّق في صفحة الدفع عند شراء الباقة. وما دام الدفع الإلكتروني متوقفاً يُرفق تلقائياً بطلب التفعيل الذي ترسله من بطاقة الباقة في هذه الصفحة.";

export interface RedeemDeps {
  admin: SupabaseClient;
  ranks: TierRankTable;
  /** gift_valid_days (pointsSettings.readGiftValidDays) — the points code's lot lasts this long. */
  giftValidDays: () => Promise<number>;
  attempts?: CouponAttemptBudget;
  now?: () => Date;
  catalog?: Readonly<Record<string, PayableItem>>;
}

export type RedeemReply =
  | { status: 200; body: RedeemOk }
  | { status: 400 | 403 | 409 | 429 | 503; body: { error: string } };

export type RedeemOk =
  | { kind: "discount"; code: string; note: string }
  | { kind: "points"; code: string; points: number; receiptNumber: string; redemptionId: string }
  | { kind: "plan"; code: string; itemId: string; labelAr: string; billing: Billing; receiptNumber: string; redemptionId: string };

interface CouponRedeemRow {
  id: string;
  code: string;
  discount_type: string;
  plan_granted: string | null;
  points_granted: number | null;
  active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  eligible_user_types: readonly string[] | null;
  metadata: Record<string, unknown> | null;
}

const fail = (status: 400 | 403 | 409 | 429 | 503, error: string): RedeemReply => ({ status, body: { error } });

function insideDates(row: CouponRedeemRow, now: Date): boolean {
  const t = now.getTime();
  if (row.valid_from && Date.parse(row.valid_from) > t) return false;
  if (row.valid_until && Date.parse(row.valid_until) < t) return false;
  return true;
}

async function finish(admin: SupabaseClient, id: string, ok: boolean, subscriptionId: string | null): Promise<string | null> {
  const { data, error } = await admin.rpc("coupon_redeem_finish", { p_redemption: id, p_ok: ok, p_subscription: subscriptionId });
  if (error) {
    console.error("[coupons/redeem] closing the redemption failed:", id, error.code);
    return null;
  }
  return typeof data === "string" ? data : null;
}

/**
 * l16 review: one admin audit row per redemption that granted something
 * (actor_type 'user', the checkMinTopup pattern) — best effort: the grant and
 * its receipt stand even if the row cannot be written.
 */
async function auditRedemption(
  admin: SupabaseClient,
  input: { userId: string; couponId: string; code: string; redemptionId: string; receiptNumber: string; kind: "points" | "plan"; itemId: string | null; points: number | null },
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
      },
    });
    if (error) console.error("[coupons/redeem] the audit row failed:", error.code);
  } catch {
    console.error("[coupons/redeem] the audit row threw");
  }
}

/** The plan row this redemption granted (metadata.order_id = the redemption id): its id, and the method set to «coupon». */
async function markPlanRow(admin: SupabaseClient, userId: string, redemptionId: string): Promise<string | null> {
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
  if (upErr) console.warn("[coupons/redeem] stamping the plan row's method failed:", row.id, upErr.code);
  return row.id;
}

export async function redeemCouponWith(deps: RedeemDeps, input: { userId: string; code: unknown }): Promise<RedeemReply> {
  const { admin } = deps;
  const attempts = deps.attempts ?? COUPON_ATTEMPTS;
  const catalog = deps.catalog ?? PAYABLE_ITEMS;
  const now = deps.now?.() ?? new Date();

  // 0. the try budget — every call spends a try, as the preview does (the answer is an oracle)
  if (!attempts.check(input.userId).ok) return fail(429, RATE_LIMITED_AR);
  attempts.spend(input.userId);
  const code = normalizeCouponCode(input.code);
  if (!code) return fail(400, COUPON_INVALID_AR);

  // 1. the account type
  const { data: profile, error: profileErr } = await admin.from("profiles").select("user_type").eq("id", input.userId).maybeSingle();
  if (profileErr || !profile) return fail(503, REDEEM_UNAVAILABLE_AR);
  const rawType = (profile as { user_type?: unknown }).user_type;
  const userType = typeof rawType === "string" ? rawType : null;

  // 2. the coupon
  const { data, error } = await admin
    .from("coupons")
    .select("id, code, discount_type, plan_granted, points_granted, active, valid_from, valid_until, eligible_user_types, metadata")
    .eq("code", code)
    .maybeSingle();
  if (error) {
    if (!isMissingPaymentsObject(error.code)) console.error("[coupons/redeem] reading the coupon failed:", error.code);
    return fail(503, REDEEM_UNAVAILABLE_AR);
  }
  const row = data as CouponRedeemRow | null;
  if (!row || row.active !== true || !insideDates(row, now)) return fail(400, COUPON_INVALID_AR);
  const audience = Array.isArray(row.eligible_user_types) ? row.eligible_user_types : [];
  if (audience.length > 0 && !(userType !== null && audience.includes(userType))) return fail(400, COUPON_INVALID_AR);

  // 3. a discount code applies at checkout (or rides on the request) — said
  // only when this buyer could use it: not used before, and a first-order
  // code only before his first paid order (the same sentence otherwise)
  if (!isGrantCouponType(row.discount_type)) {
    const used = await alreadyUsed(admin, row.id, input.userId);
    if (used === null) return fail(503, REDEEM_UNAVAILABLE_AR);
    if (used) return fail(400, COUPON_INVALID_AR);
    if (isFirstOrderCoupon(row)) {
      const earlier = await hasEarlierPaidOrder(admin, input.userId);
      if (earlier === null) return fail(503, REDEEM_UNAVAILABLE_AR);
      if (earlier) return fail(400, COUPON_INVALID_AR);
    }
    return { status: 200, body: { kind: "discount", code: row.code, note: DISCOUNT_CODE_NOTE_AR } };
  }

  // 4. a free-plan code: the plan, then checkout's gates for it
  let plan: { item: PayableItem; billing: Billing; listNet: number } | null = null;
  if (row.discount_type === "plan_upgrade") {
    const billing = row.metadata?.grant_billing;
    const grantable = grantablePlan(row.plan_granted, billing, catalog);
    const item = grantable ? resolveItem(grantable.id, catalog) : undefined;
    const listNet = item && typeof billing === "string" && Object.hasOwn(item.prices, billing) ? item.prices[billing as Billing] : undefined;
    if (!item || !item.tier || typeof listNet !== "number" || listNet <= 0) {
      console.error("[coupons/redeem] a free-plan code names no plan on sale:", row.id);
      return fail(400, COUPON_INVALID_AR);
    }
    if (!buyerAllowed(item, userType)) return fail(403, REDEEM_AUDIENCE_AR);
    if (userType === "lawyer" && CONSULTANT_REFUSED_PLAN_ID_LIST.includes(item.id)) {
      const standing = await readConsultantStanding(admin, input.userId);
      if (standing.readFailed) return fail(503, REDEEM_CHECK_FAILED_AR);
      if (standing.scopeKind === "consultant") return fail(403, REDEEM_CONSULTANT_AR);
    }
    const read = await readHeldPlans(admin, { userId: input.userId, tier: item.tier, now, ranks: deps.ranks });
    if (!read) return fail(503, REDEEM_UNAVAILABLE_AR);
    const held = read.decision;
    if (held.kind === "refused") return fail(409, held.error);
    if (held.kind === "credit") return fail(409, REDEEM_PAID_PLAN_RUNNING_AR);
    // l16 review: any other paid plan with days left, whatever granted it (a
    // bank transfer, an admin grant, a test account — the proration credits
    // only live paid orders, so those days would be lost without a word)
    if (otherPaidPlanRunning(read.rows, item.id, now.getTime())) return fail(409, REDEEM_PAID_PLAN_RUNNING_AR);
    plan = { item, billing: billing as Billing, listNet };
  }

  // 5. the redemption, under the coupon's row lock
  let pointsExpires: string | null = null;
  if (row.discount_type === "points_grant") {
    const days = await deps.giftValidDays();
    pointsExpires = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  }
  const { data: opened, error: openErr } = await admin.rpc("coupon_redeem_open", {
    p_user: input.userId,
    p_coupon: row.id,
    p_list_net: plan ? plan.listNet : null,
    p_points_expires: pointsExpires,
    p_now: now.toISOString(),
  });
  if (openErr) {
    if (!isMissingPaymentsObject(openErr.code)) console.error("[coupons/redeem] coupon_redeem_open failed:", openErr.code);
    return fail(503, REDEEM_UNAVAILABLE_AR);
  }
  const answer = (opened ?? {}) as { status?: unknown; id?: unknown; points?: unknown; receipt_number?: unknown };
  const status = typeof answer.status === "string" ? answer.status : "";
  const id = typeof answer.id === "string" ? answer.id : "";
  const receiptNumber = typeof answer.receipt_number === "string" ? answer.receipt_number : "";
  if (status === "invalid" || status === "not_grant" || status === "already_used" || status === "exhausted") {
    return fail(400, COUPON_INVALID_AR);
  }
  if (status === "granted" && row.discount_type === "points_grant" && id && receiptNumber) {
    const points = Number(answer.points);
    await auditRedemption(admin, { userId: input.userId, couponId: row.id, code: row.code, redemptionId: id, receiptNumber, kind: "points", itemId: null, points });
    return { status: 200, body: { kind: "points", code: row.code, points, receiptNumber, redemptionId: id } };
  }
  if ((status === "opened" || status === "resume") && plan && id && receiptNumber) {
    const granted = await grantPurchase(
      {
        admin,
        ranks: deps.ranks,
        catalog,
        // a grantable plan has no library part (couponGrantRules), so this is never called
        grantLibrary: async () => ({ ok: false as const, error: "no library part in a coupon plan" }),
      },
      { id, user_id: input.userId, kind: "plan", item_id: plan.item.id, billing: plan.billing, metadata: null },
      { now },
    );
    if (!granted.ok) {
      console.error("[coupons/redeem] granting the plan failed (the redemption stays open for a retry):", id, granted.error);
      return fail(503, REDEEM_UNAVAILABLE_AR);
    }
    if (granted.alreadyEntitled) {
      await finish(admin, id, false, null);
      return fail(409, REDEEM_HIGHER_PLAN_AR);
    }
    const subscriptionId = await markPlanRow(admin, input.userId, id);
    const closed = await finish(admin, id, true, subscriptionId);
    if (closed !== "granted") console.error("[coupons/redeem] the plan is granted but the redemption did not close:", id, closed);
    await auditRedemption(admin, { userId: input.userId, couponId: row.id, code: row.code, redemptionId: id, receiptNumber, kind: "plan", itemId: plan.item.id, points: null });
    return {
      status: 200,
      body: { kind: "plan", code: row.code, itemId: plan.item.id, labelAr: plan.item.labelAr, billing: plan.billing, receiptNumber, redemptionId: id },
    };
  }
  console.error("[coupons/redeem] coupon_redeem_open gave an unexpected answer:", String(status).slice(0, 40));
  return fail(503, REDEEM_UNAVAILABLE_AR);
}
