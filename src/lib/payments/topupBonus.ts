/**
 * topupBonus.ts — batch l12 (owner answers of 20 Nov 2026, Q88a and ١٥٢).
 *
 * Q88a (decided, RAW[44][73]): the campaign bonus table (500 → 700 …
 * 10,000 → 30,000) is cancelled — a top-up grants exactly its price in
 * points (1 point = 1 SAR before VAT). Whether a replacement table comes
 * (١٦٢: 0 / 0 / 5 / 8 / 12 / 16 / 20 %) is still his call, so the bonus is
 * an ADMIN SETTING, never code:
 *
 *   platform_settings 'topup_bonus_pct' = {"topup-500": 0, …}
 *     whole percent 0–100 per pack id; a pack the map does not name has
 *     no bonus. Default (absent row, malformed value, failed read): every
 *     pack 0 — never a bonus the owner did not set.
 *
 * Read once at checkout (checkoutCore step 3e) and FROZEN in the order
 * (payment_orders.metadata.topup = {base_points, bonus_pct, bonus_points,
 * points}); the grant credits that frozen number (grantPurchase), so a
 * setting changed between payment and fulfilment never changes what was
 * bought.
 *
 * ١٥٢ (open: his files disagree — item ٤٤ «both» vs 22:44 «the higher only»):
 *
 *   platform_settings 'founder_bonus_rule' = {"mode": "higher_only" | "both"}
 *     default "higher_only" (F02 §5 item 67(ج), the newest). With
 *     "higher_only" a founder member whose top-up carries both a founder
 *     discount and a bonus gets the LARGER one, valued at 1 point = 1 SAR
 *     (100 halalas); a tie goes to the discount (cash, the same tie rule as
 *     founderDiscount.bestDiscount). With "both" he keeps both.
 *
 * Pure apart from the client it is handed (type-only Supabase import), so
 * `node --test` loads it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const TOPUP_BONUS_KEY = "topup_bonus_pct";
export const FOUNDER_BONUS_RULE_KEY = "founder_bonus_rule";

export type FounderBonusMode = "higher_only" | "both";
export const FOUNDER_BONUS_MODES: readonly FounderBonusMode[] = Object.freeze(["higher_only", "both"] as const);
export const DEFAULT_FOUNDER_BONUS_MODE: FounderBonusMode = "higher_only";

/** The highest bonus an admin may set on one pack (percent of its points). */
export const MAX_TOPUP_BONUS_PCT = 100;

/** The packs the admin screen lists (the price book's on-sale top-ups, cheapest first). */
export const TOPUP_BONUS_PACK_IDS: readonly string[] = Object.freeze([
  "topup-100",
  "topup-250",
  "topup-500",
  "topup-1000",
  "topup-2500",
  "topup-5000",
  "topup-10000",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** null = acceptable, else the Arabic reason (PATCH /api/v1/admin/settings). */
export function topupBonusIssue(value: unknown): string | null {
  if (!isPlainObject(value)) return `قيمة ${TOPUP_BONUS_KEY} يجب أن تكون كائناً من الشكل {"topup-500": نسبة مئوية}`;
  for (const [k, n] of Object.entries(value)) {
    if (!/^topup-[0-9]{2,6}$/.test(k)) return `مفتاح غير معروف في ${TOPUP_BONUS_KEY}: "${k}" — المفاتيح معرّفات حزم الشحن مثل topup-500`;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_TOPUP_BONUS_PCT) {
      return `نسبة "${k}" في ${TOPUP_BONUS_KEY} يجب أن تكون عدداً صحيحاً بين 0 و${MAX_TOPUP_BONUS_PCT}`;
    }
  }
  return null;
}

export function founderBonusRuleIssue(value: unknown): string | null {
  const mode = isPlainObject(value) ? value.mode : undefined;
  return isPlainObject(value) && Object.keys(value).length === 1 && (FOUNDER_BONUS_MODES as readonly unknown[]).includes(mode)
    ? null
    : `قيمة ${FOUNDER_BONUS_RULE_KEY} يجب أن تكون {"mode": "higher_only"} (الأعلى فقط) أو {"mode": "both"} (الاثنان معاً)`;
}

/** A stored map, or {} (no bonus anywhere) when absent or malformed. */
export function parseTopupBonus(value: unknown): Record<string, number> {
  return value !== undefined && value !== null && topupBonusIssue(value) === null ? { ...(value as Record<string, number>) } : {};
}

export function parseFounderBonusMode(value: unknown): FounderBonusMode {
  return founderBonusRuleIssue(value) === null ? ((value as { mode: FounderBonusMode }).mode) : DEFAULT_FOUNDER_BONUS_MODE;
}

/** The bonus percent of one pack (0 when the map does not name it). */
export function bonusPctFor(map: Readonly<Record<string, number>>, itemId: string): number {
  if (!Object.hasOwn(map, itemId)) return 0;
  const n = map[itemId];
  return Number.isInteger(n) && n >= 0 && n <= MAX_TOPUP_BONUS_PCT ? n : 0;
}

/** floor(points × pct / 100): whole bonus points, never negative. */
export function bonusPoints(basePoints: number, pct: number): number {
  if (!Number.isSafeInteger(basePoints) || basePoints <= 0) return 0;
  if (!Number.isInteger(pct) || pct <= 0 || pct > MAX_TOPUP_BONUS_PCT) return 0;
  return Math.floor((basePoints * pct) / 100);
}

/** What the order freezes in metadata.topup and the grant credits. */
export interface TopupGrantMeta {
  base_points: number;
  bonus_pct: number;
  bonus_points: number;
  points: number;
}

export function topupGrantMeta(basePoints: number, pct: number): TopupGrantMeta {
  const bonus = bonusPoints(basePoints, pct);
  return { base_points: basePoints, bonus_pct: bonus > 0 ? pct : 0, bonus_points: bonus, points: basePoints + bonus };
}

/**
 * ١٥٢: the founder discount (halalas off the net) against the bonus (points
 * worth 100 halalas each). "both" keeps both; "higher_only" keeps the larger,
 * a tie going to the discount.
 */
export function founderVsBonus(
  mode: FounderBonusMode,
  founderDiscountHalalas: number,
  bonus: number,
): { keepDiscount: boolean; keepBonus: boolean } {
  const d = Number.isSafeInteger(founderDiscountHalalas) && founderDiscountHalalas > 0 ? founderDiscountHalalas : 0;
  const b = Number.isSafeInteger(bonus) && bonus > 0 ? bonus : 0;
  if (mode === "both" || d === 0 || b === 0) return { keepDiscount: d > 0, keepBonus: b > 0 };
  return d >= b * 100 ? { keepDiscount: true, keepBonus: false } : { keepDiscount: false, keepBonus: true };
}

/**
 * The points a paid top-up order grants: metadata.topup.points when the order
 * froze a sane number (at least the pack's own points, at most double — the
 * 100 % cap), else the catalog's points (an order from before l12).
 */
export function grantedTopupPoints(catalogPoints: number, metadata: unknown): number {
  if (!isPlainObject(metadata) || !isPlainObject(metadata.topup)) return catalogPoints;
  const t = metadata.topup;
  const points = t.points;
  if (typeof points !== "number" || !Number.isSafeInteger(points)) return catalogPoints;
  if (points < catalogPoints || points > catalogPoints * 2) return catalogPoints;
  return points;
}

async function readSetting(admin: SupabaseClient, key: string): Promise<unknown> {
  try {
    const { data, error } = await admin.from("platform_settings").select("value").eq("key", key).maybeSingle();
    if (error) return undefined;
    return (data as { value?: unknown } | null)?.value;
  } catch {
    return undefined;
  }
}

/** The bonus percent of one pack from the setting; 0 on any failure. Never throws. */
export async function readTopupBonusPct(admin: SupabaseClient, itemId: string): Promise<number> {
  return bonusPctFor(parseTopupBonus(await readSetting(admin, TOPUP_BONUS_KEY)), itemId);
}

/** The founder rule from the setting; "higher_only" on any failure. Never throws. */
export async function readFounderBonusMode(admin: SupabaseClient): Promise<FounderBonusMode> {
  return parseFounderBonusMode(await readSetting(admin, FOUNDER_BONUS_RULE_KEY));
}
