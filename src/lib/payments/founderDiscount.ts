/**
 * founderDiscount.ts — F12 (owner package 17 Nov 2026, founder campaign spec
 * §11 «المزايا»): a founder member gets a discount off point top-ups, never
 * combined with a better offer — when a coupon also applies, the buyer gets
 * the BETTER of the two, never both (bestDiscount).
 *
 * Batch l7 (decision 4, 18 Nov 2026; pricing gap row 16):
 *   - the discount is LIFETIME: during the membership year, after it and
 *     after the 6 works. Only a seat that is no longer 'active' — revoked
 *     (refund, violation) — loses it; a seat still waiting for the licence
 *     check (pending_verification, 20261127_10) is not a membership yet;
 *   - the rate is the setting platform_settings.founder_topup_discount_bps
 *     (basis points; 1500 = 15 %), read by founderDiscountBps(). Absent,
 *     malformed or unreadable → FOUNDER_DISCOUNT_DEFAULT_BPS.
 *   - the discount vs a pack's bonus is an open owner question: the top-up
 *     keeps every point of its pack (the bonus included), as before.
 *
 * Eligible items: point top-ups only (kind "topup"). The spec also names
 * «رسوم نظامي المؤهلة» (eligible platform fees) without saying which; until
 * the owner names them nothing else is discounted (listed in the l6-pay
 * report). Plans, the library and the founder membership itself: never.
 *
 * Founder member = a founder_seats row of the founder campaign with status
 * 'active' (no end-date filter since l7).
 *
 * Money: the discount is floor(net × bps / 10000) halalas off the net BEFORE
 * VAT; VAT is recomputed on the rest (couponRules.applyDiscount).
 *
 * Relative imports only (type-only for Supabase), so `node --test` loads it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemKind } from "./catalog.ts";

/** A table / column / function of a migration not applied yet (fulfillDecision.isMissingPaymentsObject, copied: this module is also imported by the browser, and fulfillDecision imports node:crypto). */
const MISSING_CODES: readonly string[] = ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"];

/** The default rate in basis points (decision 4: 15 %) — the setting's absent / malformed value. */
export const FOUNDER_DISCOUNT_DEFAULT_BPS = 1500;
/** The default rate in percent (FOUNDER_DISCOUNT_DEFAULT_BPS / 100). */
export const FOUNDER_DISCOUNT_PCT = FOUNDER_DISCOUNT_DEFAULT_BPS / 100;
/** platform_settings key of the rate (20261127_10). */
export const FOUNDER_DISCOUNT_SETTING_KEY = "founder_topup_discount_bps";
/** The kinds the founder discount applies to (F12). */
export const FOUNDER_DISCOUNT_KINDS: readonly ItemKind[] = Object.freeze(["topup"] as ItemKind[]);
/** src/lib/membership/founderPlan.ts FOUNDER_CAMPAIGN_ID (founderDiscount.test.ts holds them equal). */
export const FOUNDER_DISCOUNT_CAMPAIGN_ID = "founder-2026";

/** Without the percent: the browser shows the server's amount, whatever the rate setting says. */
export const FOUNDER_DISCOUNT_LABEL_AR = "خصم العضو المؤسس";
export const FOUNDER_DISCOUNT_FAILED_AR = "تعذّر التحقق من خصم العضو المؤسس، حاول مرة أخرى بعد قليل";

export function founderDiscountApplies(kind: string): boolean {
  return (FOUNDER_DISCOUNT_KINDS as readonly string[]).includes(kind);
}

/** A rate the setting may hold: a whole number of basis points, 0–10000. */
export function isFounderDiscountBps(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 10000;
}

/** «خصم العضو المؤسس (١٥٪)» for a rate in basis points (Arabic-Indic digits). */
export function founderDiscountLabelAr(bps: number = FOUNDER_DISCOUNT_DEFAULT_BPS): string {
  if (!isFounderDiscountBps(bps)) return FOUNDER_DISCOUNT_LABEL_AR;
  const pct = (bps / 100).toLocaleString("ar-SA-u-nu-arab", { maximumFractionDigits: 2 });
  return `${FOUNDER_DISCOUNT_LABEL_AR} (${pct}٪)`;
}

/** bps of the net (default 15 %), floored to a halala; 0 for a bad net or rate. */
export function founderDiscountHalalas(netHalalas: number, bps: number = FOUNDER_DISCOUNT_DEFAULT_BPS): number {
  if (!Number.isSafeInteger(netHalalas) || netHalalas <= 0 || !isFounderDiscountBps(bps)) return 0;
  return Math.floor((netHalalas * bps) / 10000);
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
export function founderDiscountMetadata(
  listNetHalalas: number,
  discountHalalas: number,
  bps: number = FOUNDER_DISCOUNT_DEFAULT_BPS,
) {
  return { pct: bps / 100, discount_halalas: discountHalalas, list_net_halalas: listNetHalalas };
}

/**
 * The rate in basis points: platform_settings.founder_topup_discount_bps
 * when it holds a whole number 0–10000, else FOUNDER_DISCOUNT_DEFAULT_BPS
 * (absent row, a database before 20261127_10, a malformed value, a failed
 * read — never the full price for a founder). Never throws.
 */
export async function founderDiscountBps(admin: SupabaseClient): Promise<number> {
  try {
    const { data, error } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", FOUNDER_DISCOUNT_SETTING_KEY)
      .maybeSingle();
    if (error) {
      if (!MISSING_CODES.includes(error.code ?? "")) {
        console.error("[payments/founder-discount] reading the rate failed:", error.code);
      }
      return FOUNDER_DISCOUNT_DEFAULT_BPS;
    }
    const value = (data as { value?: unknown } | null)?.value;
    return isFounderDiscountBps(value) ? value : FOUNDER_DISCOUNT_DEFAULT_BPS;
  } catch (err) {
    console.error("[payments/founder-discount] reading the rate threw:", err instanceof Error ? err.message : "unknown");
    return FOUNDER_DISCOUNT_DEFAULT_BPS;
  }
}

/**
 * Whether `userId` is a founder member: an 'active' seat, at any date (l7,
 * decision 4: lifetime). A revoked seat (refund, violation) is not, nor a
 * seat still pending verification. `_now` is kept for the callers' signature;
 * the end date is no longer read. A missing table (the founder migrations not
 * applied) is false; any other read error is null — the caller answers 503
 * rather than charge a founder the full price.
 */
export async function isActiveFounder(admin: SupabaseClient, userId: string, _now?: Date): Promise<boolean | null> {
  void _now;
  try {
    const { data, error } = await admin
      .from("founder_seats")
      .select("id")
      .eq("user_id", userId)
      .eq("campaign_id", FOUNDER_DISCOUNT_CAMPAIGN_ID)
      .eq("status", "active")
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
