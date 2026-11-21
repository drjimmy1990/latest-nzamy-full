/**
 * founderDiscount.ts — F12 (owner package 17 Nov 2026, founder campaign spec
 * §11 «المزايا»): a founder member gets a discount off point top-ups, never
 * combined with a better offer — when a coupon also applies, the buyer gets
 * the BETTER of the two, never both (bestDiscount).
 *
 * Batch l7 (decision 4) made the discount lifetime; batch l8 (owner 18 Nov
 * evening, decisions ط/ك, questions ٤٨–٤٩) REVERTS that:
 *   - the discount runs for the MEMBERSHIP YEAR from activation, never for
 *     life. Its length is the setting platform_settings
 *     founder_topup_discount_expires (founderDiscountWindowFromSetting):
 *       {"months_after_activation": N} → activated_at + N months (default
 *                                        12; 0 switches the discount off);
 *       {"until": "YYYY-MM-DD"}        → to the end of that Riyadh day, for
 *                                        every founder alike.
 *     Absent, malformed or unreadable → 12 months from activation, never
 *     lifetime. A seat that is no longer 'active' — revoked (refund,
 *     violation) — loses it; a seat still waiting for the licence check
 *     (pending_verification, 20261127_10) is not a membership yet;
 *   - the rate is the setting platform_settings.founder_topup_discount_bps
 *     (basis points; 1500 = 15 %), read by founderDiscountBps(). Absent,
 *     malformed or unreadable → FOUNDER_DISCOUNT_DEFAULT_BPS.
 *   - ٤٨: the top-up keeps every point of its pack. Batch l12 (owner Q88a /
 *     ١٥٢): the packs carry no bonus by default; when the admin sets one
 *     (topup_bonus_pct) a founder gets the discount OR the bonus, the larger
 *     (founder_bonus_rule, default "higher_only" — topupBonus.ts, checkout
 *     step 3e).
 *
 * Batch l9 (owner register 14 items 29 / 32 / 55, 19 Nov 2026) widens it:
 * eligible items are point top-ups AND any plan or library subscription he
 * buys (kinds "topup", "plan", "library"), while his yearly founder
 * subscription is active — the window above (the membership year; a future
 * founder-renewal product must extend it, nothing renews yet). Never the
 * founder membership itself (kind "membership": its first-year price is
 * excluded, register 55). Never combined with another discount: checkout
 * takes the founder discount off the LISTED price and compares it with what
 * the other path saves (a launch price's saving plus any coupon on it) —
 * the larger wins, never both (bestDiscount). Lost for good when the seat is
 * no longer active (refund, violation) or the window ends.
 *
 * Founder member = a founder_seats row of the founder campaign with status
 * 'active' whose discount window (above) has not ended at `now`.
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
/** The kinds the founder discount applies to (F12; l9 adds every plan and library subscription — never "membership"). */
export const FOUNDER_DISCOUNT_KINDS: readonly ItemKind[] = Object.freeze(["topup", "plan", "library"] as ItemKind[]);
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

// ── the discount's length (l8: the membership year, never lifetime) ─────────

/** platform_settings key of the discount's length (20261128_10). */
export const FOUNDER_DISCOUNT_EXPIRES_KEY = "founder_topup_discount_expires";
/** The default length: the membership year from activation (owner 18 Nov, decision ك). */
export const FOUNDER_DISCOUNT_DEFAULT_MONTHS = 12;
const MAX_DISCOUNT_MONTHS = 120;

/** How long the discount runs: N months from the seat's activation, or to a fixed Riyadh day for everyone. */
export type FounderDiscountWindow =
  | { kind: "months_after_activation"; months: number }
  | { kind: "until"; day: string };

export const FOUNDER_DISCOUNT_DEFAULT_WINDOW: FounderDiscountWindow = Object.freeze({
  kind: "months_after_activation",
  months: FOUNDER_DISCOUNT_DEFAULT_MONTHS,
}) as FounderDiscountWindow;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function isRealDay(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}

const EXPIRES_SHAPE_AR =
  'قيمة founder_topup_discount_expires يجب أن تكون {"months_after_activation": عدد أشهر صحيح من 0 إلى 120} (12 = سنة العضوية من التفعيل، 0 = إيقاف الخصم) أو {"until": "YYYY-MM-DD"} (آخر يوم للخصم بتوقيت الرياض)';

/** Admin write check for founder_topup_discount_expires; null when acceptable. */
export function founderDiscountExpiresIssue(value: unknown): string | null {
  if (!isPlainObject(value)) return EXPIRES_SHAPE_AR;
  const keys = Object.keys(value);
  if (keys.length !== 1) return EXPIRES_SHAPE_AR;
  if (keys[0] === "months_after_activation") {
    const n = value.months_after_activation;
    return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_DISCOUNT_MONTHS ? null : EXPIRES_SHAPE_AR;
  }
  if (keys[0] === "until") return isRealDay(value.until) ? null : EXPIRES_SHAPE_AR;
  return EXPIRES_SHAPE_AR;
}

/** The stored value as a window; anything absent or malformed is the membership year (never lifetime). */
export function founderDiscountWindowFromSetting(value: unknown): FounderDiscountWindow {
  if (founderDiscountExpiresIssue(value) !== null) return { ...FOUNDER_DISCOUNT_DEFAULT_WINDOW };
  const v = value as Record<string, unknown>;
  if (Object.hasOwn(v, "until")) return { kind: "until", day: v.until as string };
  return { kind: "months_after_activation", months: v.months_after_activation as number };
}

/** `at` + `months` calendar months (UTC); the day is clamped to the month's last, as Postgres does (31 Jan + 1 → end of Feb). */
export function addMonthsUtc(at: Date, months: number): Date {
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = new Date(at.getTime());
  d.setUTCFullYear(y, m, Math.min(at.getUTCDate(), lastDay));
  return d;
}

/**
 * When one seat's discount ends (exclusive), or null when it cannot be told
 * (no activation date) — the caller then gives NO discount, never a lifetime
 * one. `until` ends at the end of that Riyadh day (UTC+3, no DST).
 */
export function founderDiscountEndsAt(
  seat: { activated_at?: string | null; ends_at?: string | null },
  window: FounderDiscountWindow,
): Date | null {
  if (window.kind === "until") return new Date(Date.parse(`${window.day}T00:00:00+03:00`) + 86_400_000);
  const activated = seat.activated_at ? Date.parse(seat.activated_at) : NaN;
  if (Number.isFinite(activated)) return addMonthsUtc(new Date(activated), window.months);
  // a row without activated_at: its membership end stands for the default year
  const ends = seat.ends_at ? Date.parse(seat.ends_at) : NaN;
  if (window.months === FOUNDER_DISCOUNT_DEFAULT_MONTHS && Number.isFinite(ends)) return new Date(ends);
  return null;
}

/** The window from platform_settings; a failed read is the default (the membership year). Never throws. */
export async function founderDiscountWindow(admin: SupabaseClient): Promise<FounderDiscountWindow> {
  try {
    const { data, error } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", FOUNDER_DISCOUNT_EXPIRES_KEY)
      .maybeSingle();
    if (error) {
      if (!MISSING_CODES.includes(error.code ?? "")) {
        console.error("[payments/founder-discount] reading the discount length failed:", error.code);
      }
      return { ...FOUNDER_DISCOUNT_DEFAULT_WINDOW };
    }
    return founderDiscountWindowFromSetting((data as { value?: unknown } | null)?.value);
  } catch (err) {
    console.error("[payments/founder-discount] reading the discount length threw:", err instanceof Error ? err.message : "unknown");
    return { ...FOUNDER_DISCOUNT_DEFAULT_WINDOW };
  }
}

/**
 * Whether `userId` gets the founder top-up discount at `now`: an 'active'
 * seat whose discount window (founder_topup_discount_expires — by default the
 * membership year from activation; l8 reverts l7's lifetime rule) has not
 * ended. A revoked seat (refund, violation) is not, nor a seat still pending
 * verification, nor a seat past its window. A missing table (the founder
 * migrations not applied) is false; any other read error of the seat is null
 * — the caller answers 503 rather than charge a founder the full price.
 */
export async function isActiveFounder(admin: SupabaseClient, userId: string, now: Date = new Date()): Promise<boolean | null> {
  try {
    const { data, error } = await admin
      .from("founder_seats")
      .select("id, activated_at, ends_at")
      .eq("user_id", userId)
      .eq("campaign_id", FOUNDER_DISCOUNT_CAMPAIGN_ID)
      .eq("status", "active")
      .limit(1);
    if (error) {
      if (MISSING_CODES.includes(error.code ?? "")) return false;
      console.error("[payments/founder-discount] reading the founder seat failed:", error.code);
      return null;
    }
    const seat = Array.isArray(data)
      ? (data[0] as { activated_at?: string | null; ends_at?: string | null } | undefined)
      : undefined;
    if (!seat) return false;
    const endsAt = founderDiscountEndsAt(seat, await founderDiscountWindow(admin));
    return endsAt !== null && now.getTime() < endsAt.getTime();
  } catch (err) {
    console.error("[payments/founder-discount] reading the founder seat threw:", err instanceof Error ? err.message : "unknown");
    return null;
  }
}
