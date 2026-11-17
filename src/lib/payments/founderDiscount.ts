/**
 * founderDiscount.ts — F12 (owner package 17 Nov 2026, founder campaign spec
 * §11 «المزايا»): an ACTIVE founder member gets 15 % off point top-ups, never
 * combined with a better offer — when a coupon also applies, the buyer gets
 * the BETTER of the two, never both (bestDiscount).
 *
 * Eligible items: point top-ups only (kind "topup"). The spec also names
 * «رسوم نظامي المؤهلة» (eligible platform fees) without saying which; until
 * the owner names them nothing else is discounted (listed in the l6-pay
 * report). Plans, the library and the founder membership itself: never.
 * The top-up keeps every point of its pack (the bonus included): the
 * discount is on the price only. Whether a pack's bonus counts as «a better
 * offer» is an open owner question (report).
 *
 * Active founder = a founder_seats row of the founder campaign with status
 * 'active' and an end in the future — the same read as
 * src/app/api/ai/_founderToolMember.ts.
 *
 * Money: the discount is floor(net × 15 / 100) halalas off the net BEFORE
 * VAT; VAT is recomputed on the rest (couponRules.applyDiscount).
 *
 * Relative imports only (type-only for Supabase), so `node --test` loads it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemKind } from "./catalog.ts";

/** A table / column / function of a migration not applied yet (fulfillDecision.isMissingPaymentsObject, copied: this module is also imported by the browser, and fulfillDecision imports node:crypto). */
const MISSING_CODES: readonly string[] = ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"];

export const FOUNDER_DISCOUNT_PCT = 15;
/** The kinds the founder discount applies to (F12). */
export const FOUNDER_DISCOUNT_KINDS: readonly ItemKind[] = Object.freeze(["topup"] as ItemKind[]);
/** src/lib/membership/founderPlan.ts FOUNDER_CAMPAIGN_ID (founderDiscount.test.ts holds them equal). */
export const FOUNDER_DISCOUNT_CAMPAIGN_ID = "founder-2026";

export const FOUNDER_DISCOUNT_LABEL_AR = "خصم العضو المؤسس (١٥٪)";
export const FOUNDER_DISCOUNT_FAILED_AR = "تعذّر التحقق من خصم العضو المؤسس، حاول مرة أخرى بعد قليل";

export function founderDiscountApplies(kind: string): boolean {
  return (FOUNDER_DISCOUNT_KINDS as readonly string[]).includes(kind);
}

/** 15 % of the net, floored to a halala; 0 for a bad net. */
export function founderDiscountHalalas(netHalalas: number): number {
  if (!Number.isSafeInteger(netHalalas) || netHalalas <= 0) return 0;
  return Math.floor((netHalalas * FOUNDER_DISCOUNT_PCT) / 100);
}

/**
 * «never combined with a better offer»: the larger discount wins, never the
 * sum. A tie goes to the founder discount, so the coupon stays unused.
 */
export function bestDiscount(
  couponHalalas: number | null | undefined,
  founderHalalas: number | null | undefined,
): { source: "coupon" | "founder" | null; discountHalalas: number } {
  const c = Number.isSafeInteger(couponHalalas) && (couponHalalas as number) > 0 ? (couponHalalas as number) : 0;
  const f = Number.isSafeInteger(founderHalalas) && (founderHalalas as number) > 0 ? (founderHalalas as number) : 0;
  if (c === 0 && f === 0) return { source: null, discountHalalas: 0 };
  if (f >= c) return { source: "founder", discountHalalas: f };
  return { source: "coupon", discountHalalas: c };
}

/** payment_orders.metadata.founder_discount */
export function founderDiscountMetadata(listNetHalalas: number, discountHalalas: number) {
  return { pct: FOUNDER_DISCOUNT_PCT, discount_halalas: discountHalalas, list_net_halalas: listNetHalalas };
}

/**
 * Whether `userId` is an active founder member. A missing table (the founder
 * migrations not applied) is false; any other read error is null — the
 * caller answers 503 rather than charge a founder the full price.
 */
export async function isActiveFounder(admin: SupabaseClient, userId: string, now: Date): Promise<boolean | null> {
  try {
    const { data, error } = await admin
      .from("founder_seats")
      .select("id")
      .eq("user_id", userId)
      .eq("campaign_id", FOUNDER_DISCOUNT_CAMPAIGN_ID)
      .eq("status", "active")
      .gt("ends_at", now.toISOString())
      .limit(1);
    if (error) {
      if (MISSING_CODES.includes(error.code ?? "")) return false;
      console.error("[payments/founder-discount] reading the founder seat failed:", error.code);
      return null;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    console.error("[payments/founder-discount] reading the founder seat threw:", err instanceof Error ? err.message : "unknown");
    return null;
  }
}
