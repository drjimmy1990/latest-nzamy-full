/**
 * fullDiscount.ts — a coupon that covers the whole price (batch l14, owner
 * package of 23 Nov, 00 §٤ and 11 §٦ / item 67ب: «الخصم ١٠٠٪ لا يتخطى الدفع،
 * وتلزم بطاقة قبل التفعيل»). Before payments go live, a discount code may go
 * up to 100 % (couponAdminRules.ts, couponRules.ts), and an order the coupon
 * leaves below Moyasar's smallest charge (1 SAR) is a "full discount":
 *
 *   1. it never reaches Moyasar (an intent of 0 does not exist, and
 *      payment_orders refuses a total of 0 — 20261022_10);
 *   2. it is never granted without a saved card of the buyer: an ACTIVE
 *      payment_methods row of the platform, saved in the gateway's current
 *      mode (live / test — 20261022_31), not past its expiry month;
 *   3. without one → 409 FULL_DISCOUNT_CARD_REQUIRED_AR (code
 *      "card_required"); with one → 409 FULL_DISCOUNT_PENDING_AR (code
 *      "full_discount_pending") while FULL_DISCOUNT_ACTIVATION_READY is
 *      false. Nothing is written either way.
 *
 * What keeps FULL_DISCOUNT_ACTIVATION_READY false (reported to the owner):
 *   - saving a card WITHOUT a purchase: today a card is saved only from a
 *     paid plan (fulfillCore.saveCard, Moyasar `save_card`). Moyasar supports
 *     tokens made without a payment ("save_only" tokens, the Tokenization
 *     feature of the merchant account); the card-save form and its callback
 *     are not built;
 *   - the zero-amount activation itself: payment_orders requires a total
 *     above 0 and every receipt / tax invoice / refund assumes money moved —
 *     a 0 SAR receipt needs the owner's (and the accountant's) decision;
 *   - charging the saved card when the free period ends (renewal from a
 *     token, "B2") is not built either.
 * The checkout and the coupon preview answer the same refusal (one rule,
 * here), so the buyer is told before he presses pay.
 *
 * Batch l16 (owner س٢١٣ ب): the zero-amount record now exists for FREE-PLAN
 * and POINTS codes — coupon_redemptions (20261206_30, couponRedeemCore.ts):
 * full price → 100 % discount → net 0 with a free-activation receipt, never
 * a payment_orders row. A percentage code that reaches 100 % AT CHECKOUT
 * still stops here: saving a card without a purchase (Moyasar tokenization)
 * is not built, and dropping the saved-card rule is the owner's call.
 *
 * Pure: a type-only import, so `node --test` loads it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Moyasar's smallest charge, in halalas (1 SAR). */
export const MOYASAR_MIN_CHARGE_HALALAS = 100;

/**
 * The switch for granting a full-discount order against a saved card. Stays
 * false until the three pieces above exist; flipping it alone grants nothing
 * (checkoutCore still has no zero-amount path).
 */
export const FULL_DISCOUNT_ACTIVATION_READY = false;

export const FULL_DISCOUNT_CARD_REQUIRED_CODE = "card_required";
export const FULL_DISCOUNT_PENDING_CODE = "full_discount_pending";

export const FULL_DISCOUNT_CARD_REQUIRED_AR =
  "هذا الكود يغطي المبلغ كاملًا، ولا يُفعَّل إلا مع بطاقة دفع محفوظة في حسابك. حفظ البطاقة دون شراء قيد التفعيل حاليًا.";
export const FULL_DISCOUNT_PENDING_AR =
  "هذا الكود يغطي المبلغ كاملًا، وتفعيل الأكواد المجانية بالكامل قيد التفعيل حاليًا.";
export const FULL_DISCOUNT_CARD_CHECK_FAILED_AR = "تعذّر التحقق من البطاقة المحفوظة، حاول مرة أخرى بعد قليل";

/** True when what is left to pay is below Moyasar's smallest charge. */
export function isFullDiscount(totalHalalas: number): boolean {
  return Number.isFinite(totalHalalas) && totalHalalas < MOYASAR_MIN_CHARGE_HALALAS;
}

/** The payment_methods columns the card check reads. */
export interface SavedCardRow {
  status: string | null;
  live: boolean | null;
  exp_month: string | null;
  exp_year: string | null;
}

/**
 * A saved card the full-discount path accepts: active, saved in this
 * gateway mode (a card of unknown mode — live null — is never assumed), and
 * not past its expiry month (Riyadh calendar; an unreadable expiry is not
 * trusted).
 */
export function savedCardUsable(row: SavedCardRow, mode: "test" | "live" | null | undefined, now: Date): boolean {
  if (row.status !== "active") return false;
  if (mode !== "live" && mode !== "test") return false;
  if (row.live !== (mode === "live")) return false;
  const month = Number(row.exp_month);
  let year = Number(row.exp_year);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) return false;
  if (year < 100) year += 2000;
  // Riyadh (+03:00, no daylight saving): the card works through its expiry month
  const riyadh = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const y = riyadh.getUTCFullYear();
  const m = riyadh.getUTCMonth() + 1;
  return year > y || (year === y && month >= m);
}

/**
 * Whether the buyer holds a usable saved card (service client: the token
 * itself is never read). true / false, or null when the read failed.
 */
export async function hasUsableSavedCard(
  admin: SupabaseClient,
  userId: string,
  mode: "test" | "live" | null | undefined,
  now: Date,
): Promise<boolean | null> {
  try {
    const { data, error } = await admin
      .from("payment_methods")
      .select("status, live, exp_month, exp_year")
      .eq("user_id", userId)
      .eq("merchant", "platform")
      .eq("status", "active")
      .limit(20);
    if (error) {
      console.error("[payments] reading the saved cards failed:", error.code);
      return null;
    }
    return ((data as SavedCardRow[] | null) ?? []).some((row) => savedCardUsable(row, mode, now));
  } catch (err) {
    console.error("[payments] reading the saved cards threw:", err instanceof Error ? err.message : "unknown");
    return null;
  }
}

export type FullDiscountDecision =
  | { ok: true }
  | { ok: false; status: 409 | 503; error: string; code?: string };

/**
 * The answer for a full-discount order. `hasCard` null = the card read
 * failed (503, never a guess).
 */
export function fullDiscountDecision(
  hasCard: boolean | null,
  ready: boolean = FULL_DISCOUNT_ACTIVATION_READY,
): FullDiscountDecision {
  if (hasCard === null) return { ok: false, status: 503, error: FULL_DISCOUNT_CARD_CHECK_FAILED_AR };
  if (!hasCard) return { ok: false, status: 409, error: FULL_DISCOUNT_CARD_REQUIRED_AR, code: FULL_DISCOUNT_CARD_REQUIRED_CODE };
  if (!ready) return { ok: false, status: 409, error: FULL_DISCOUNT_PENDING_AR, code: FULL_DISCOUNT_PENDING_CODE };
  return { ok: true };
}
