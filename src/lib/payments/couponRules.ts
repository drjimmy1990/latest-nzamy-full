/**
 * couponRules.ts — whether a coupon applies to one checkout quote, and the
 * quote it makes (owner answers of 25 Oct 2026, P7; pricing doc §13أ; answer
 * ٢٧٩: no stacking). ONE function decides, and both
 * POST /api/v1/coupons/validate (the preview) and startCheckoutWith (the
 * charge) call it — so the discount the buyer is shown is the discount the
 * order stores and Moyasar charges.
 *
 * The rules:
 *   - the code must name an active coupon inside its dates, with uses left;
 *     a points / plan coupon is not a checkout discount;
 *   - the buyer's account type must be in eligible_user_types (empty = all);
 *   - once per user: a paid (or refunded) order of this buyer already carried
 *     it → refused. A failed or cancelled order never consumed it, and a
 *     paid order voided inside the 90-minute window gives it back (owner
 *     ٣٠٦; refundCore → couponServer.releaseCouponUsage), while a normal
 *     refund keeps it used;
 *   - a first-order coupon (its row's metadata.first_paid_order_only — NEWCLIENT
 *     by owner ٣٠٥, stamped by 20261030_16 / 20261103_21; `isFirstOrderCoupon`)
 *     only on the buyer's FIRST paid order on the platform: any earlier paid
 *     or refunded order of any kind, for any service, refuses it (the user
 *     counts, not the service type);
 *   - never on an excluded kind (top-ups always — 20261026_20 enforces it in
 *     the table too; the founder membership always, P3 — its price is the
 *     discount), never on an item already sold at a discount (a launch /
 *     campaign / founder price: ٢٧٩, the customer gets ONE discount, and the
 *     item's own discount is it). Government fees are never part of a
 *     platform order, so no coupon reaches them;
 *   - never on an item the row names in metadata.excluded_items (S6-T10: a
 *     price-book id such as "ind-ai", edited on the admin coupons page);
 *   - the order's net before VAT must reach min_order_amount;
 *   - the discount is the coupon's value (fixed SAR, or a percentage of the
 *     net) capped at max_discount_pct (25) of the net, floored to a halala so
 *     the cap is never exceeded;
 *   - VAT (15 %) is computed on the net AFTER the discount.
 *
 * Every rule is read from the coupon's ROW, never from its code: a name in
 * code would be a rule the admin cannot see or change (S6-T10;
 * couponCodeLiterals.test.ts keeps it so).
 *
 * Unknown, expired, inactive, used-up, already-used and wrong-audience codes
 * all answer the SAME sentence (COUPON_INVALID_AR): the answer must not tell
 * a guesser which codes exist. Below the minimum / not for this item answer
 * their own sentence — the buyer can act on them.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */

import { VAT_PERCENT, type ItemKind } from "./catalog.ts";

export const COUPON_INVALID_AR = "كود الخصم غير صالح أو منتهي الصلاحية";
export const COUPON_NOT_FOR_ITEM_AR = "كود الخصم لا ينطبق على هذا المنتج";
export const COUPONS_UNAVAILABLE_AR = "أكواد الخصم غير متاحة حالياً";

/** «يتطلب هذا الكود طلباً بقيمة ٢٠٠ ر.س على الأقل قبل الضريبة» */
export function couponMinimumAr(minText: string): string {
  return `يتطلب هذا الكود طلباً بقيمة ${minText} على الأقل قبل الضريبة`;
}

/** The coupon columns the rules read (public.coupons; SAR amounts are numeric). */
export interface CouponRow {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number | string;
  min_order_amount: number | string | null;
  eligible_user_types: readonly string[] | null;
  max_uses: number | null;
  used_count: number | null;
  valid_from: string | null;
  valid_until: string | null;
  active: boolean;
  /** 20261026_20 */
  max_discount_pct: number | string;
  /** 20261026_20 */
  excluded_kinds: readonly string[] | null;
  /**
   * `first_paid_order_only: true` marks a first-order coupon (owner ٣٠٥;
   * 20261030_16, 20261103_21); `excluded_items: string[]` names price-book
   * items it never discounts (S6-T10). Both are edited on the admin page.
   */
  metadata?: Record<string, unknown> | null;
}

/**
 * Owner ٣٠٥ (30 Oct 2026): a first-order coupon (NEWCLIENT) is for the
 * buyer's first paid order on the platform. S6-T10: only the row decides —
 * metadata.first_paid_order_only must be the boolean true (the string "true"
 * is not). 20261030_16 stamped NEWCLIENT and 20261103_21 (BEFORE this code's
 * deploy) re-asserts it; from then on an admin may tick or un-tick it on any
 * coupon. The code's name is never read.
 */
export function isFirstOrderCoupon(row: Pick<CouponRow, "metadata">): boolean {
  return row.metadata?.first_paid_order_only === true;
}

/**
 * The price-book ids the row never discounts (metadata.excluded_items).
 * Only an array counts, and only its strings; anything else is no list.
 */
export function excludedItemsOf(row: Pick<CouponRow, "metadata">): string[] {
  const raw = row.metadata?.excluded_items;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string");
}

export interface CouponContext {
  netHalalas: number;
  /** payment_orders.kind: what checkout sells (plan / library / topup), or a single service (not sold online yet). */
  kind: ItemKind | "service";
  userType: string | null;
  /** True when a paid or refunded order of this buyer already carried this coupon. */
  alreadyUsed: boolean;
  /** True when the item is already sold at a discount (launch / campaign / founder price). */
  itemDiscounted: boolean;
  /** True when the buyer already has a paid or refunded order of any kind (owner ٣٠٥). */
  hasEarlierPaidOrder: boolean;
  /** The price-book id being bought (payment_orders.item_id), matched against metadata.excluded_items. */
  itemId: string;
  now: Date;
}

export type CouponDecision =
  | { ok: true; discountHalalas: number }
  | { ok: false; reason: "invalid" | "not_for_item" | "below_minimum"; minHalalas?: number };

/** A code as typed: trimmed, upper-case, at most 32 of A–Z 0–9 _ -; anything else is null. */
export function normalizeCouponCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) return null;
  return code;
}

/** SAR (numeric column, possibly a string) → whole halalas; NaN / negative → 0. */
export function sarToHalalas(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

const MAX_PCT = 25;

export function evaluateCoupon(row: CouponRow | null | undefined, ctx: CouponContext): CouponDecision {
  if (!row || row.active !== true) return { ok: false, reason: "invalid" };
  const now = ctx.now.getTime();
  if (row.valid_from && Date.parse(row.valid_from) > now) return { ok: false, reason: "invalid" };
  if (row.valid_until && Date.parse(row.valid_until) < now) return { ok: false, reason: "invalid" };
  if (typeof row.max_uses === "number" && row.max_uses > 0 && (row.used_count ?? 0) >= row.max_uses) {
    return { ok: false, reason: "invalid" };
  }
  if (row.discount_type !== "fixed" && row.discount_type !== "percentage") return { ok: false, reason: "invalid" };
  const audience = row.eligible_user_types ?? [];
  if (audience.length > 0 && !(ctx.userType && audience.includes(ctx.userType))) return { ok: false, reason: "invalid" };
  if (ctx.alreadyUsed) return { ok: false, reason: "invalid" };
  // the same sentence as «already used»: the buyer cannot act on either
  if (isFirstOrderCoupon(row) && ctx.hasEarlierPaidOrder) return { ok: false, reason: "invalid" };

  const excluded = new Set(row.excluded_kinds ?? []);
  excluded.add("topup"); // the owner: never on a point top-up, whatever a row says
  // P3: the founder membership's first-year price is already the discount (٢٧٩,
  // nothing stacks) — and coupons.excluded_kinds cannot name it (its CHECK
  // lists plan / library / topup / service), so the rule lives here
  excluded.add("membership");
  if (excluded.has(ctx.kind) || ctx.itemDiscounted) return { ok: false, reason: "not_for_item" };
  // S6-T10: an item the row excludes by its id. Both sides are trimmed and
  // lower-cased (every price-book id is lower-case), so a hand-edited "IND-AI"
  // or " ind-ai" still excludes ind-ai: the match fails closed, never open.
  const itemKey = ctx.itemId.trim().toLowerCase();
  if (excludedItemsOf(row).some((id) => id.trim().toLowerCase() === itemKey)) return { ok: false, reason: "not_for_item" };

  const net = ctx.netHalalas;
  const minHalalas = sarToHalalas(row.min_order_amount);
  if (!Number.isSafeInteger(net) || net <= 0 || net < minHalalas) {
    return { ok: false, reason: "below_minimum", minHalalas };
  }

  const value = Number(row.discount_value);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, reason: "invalid" };
  const raw = row.discount_type === "fixed" ? sarToHalalas(value) : Math.floor((net * Math.min(value, 100)) / 100);
  const pctRaw = Number(row.max_discount_pct);
  const pct = Number.isFinite(pctRaw) && pctRaw > 0 ? Math.min(pctRaw, MAX_PCT) : MAX_PCT;
  const cap = Math.floor((net * pct) / 100);
  const discountHalalas = Math.min(raw, cap);
  if (discountHalalas <= 0) return { ok: false, reason: "invalid" };
  return { ok: true, discountHalalas };
}

export interface DiscountedQuote {
  /** The listed net before the coupon. */
  listNetHalalas: number;
  discountHalalas: number;
  /** The net after the coupon — what VAT is computed on and what the order stores. */
  netHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
}

/** The quote after a discount: VAT on the discounted net (owner, §13أ; same rounding as catalog.quote). */
export function applyDiscount(listNetHalalas: number, discountHalalas: number): DiscountedQuote {
  const d = Math.max(0, Math.min(discountHalalas, listNetHalalas));
  const netHalalas = listNetHalalas - d;
  const vatHalalas = Math.round((netHalalas * VAT_PERCENT) / 100);
  return { listNetHalalas, discountHalalas: d, netHalalas, vatHalalas, totalHalalas: netHalalas + vatHalalas };
}

/** The Arabic answer for a refusal. */
export function couponRefusalAr(decision: Extract<CouponDecision, { ok: false }>, formatHalalas: (h: number) => string): string {
  if (decision.reason === "not_for_item") return COUPON_NOT_FOR_ITEM_AR;
  if (decision.reason === "below_minimum" && decision.minHalalas) return couponMinimumAr(formatHalalas(decision.minHalalas));
  return COUPON_INVALID_AR;
}
