/**
 * pointsSettings.ts — the points numbers the owner set on 18 Nov 2026 (batch
 * l7, decisions 5–9), read from platform_settings so an admin can change them
 * without a deploy (/api/v1/admin/settings validates and audits each write).
 * The code defaults below are what migration 20261127_40 seeds; they apply
 * when a row is missing or unreadable (the SQL not run yet, a read error).
 *
 *   library_plan_points            points with each library plan, for the
 *                                  library assistant only (library_agent
 *                                  wallet), ending with the plan's grant
 *   gift_valid_days                admin gifts / grants expire after this many days
 *   min_topup_by_account_type      the lowest top-up price (SAR, before any
 *                                  discount and VAT) per profiles.user_type;
 *                                  a type not named has no minimum
 *   free_questions_by_account_type the library assistant's free questions,
 *                                  ONCE per account (read by the SQL itself
 *                                  in ai_free_question_status; listed here for
 *                                  the admin validator and the status copy)
 *
 * Pure apart from the client it is handed (type-only Supabase import), so
 * `node --test` runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const LIBRARY_PLAN_POINTS_KEY = "library_plan_points";
export const GIFT_VALID_DAYS_KEY = "gift_valid_days";
export const MIN_TOPUP_KEY = "min_topup_by_account_type";
export const FREE_QUESTIONS_KEY = "free_questions_by_account_type";

export const DEFAULT_LIBRARY_PLAN_POINTS: Readonly<Record<string, number>> = Object.freeze({
  "lib-q1": 50,
  "lib-q2": 120,
  "lib-annual": 300,
});
export const DEFAULT_GIFT_VALID_DAYS = 90;
/**
 * Batch l12 (owner Q87, 20 Nov 2026, RAW[16][50][57] — his raw log beats
 * register 14 item 7): individual 100, every other type 500 (1 point = 1 SAR
 * before VAT). The 50 of batch l9 is the LIBRARY's opening balance only, never
 * a top-up minimum; topup-50 is retired. 20261202_10 writes this map (a value
 * an admin changed after l9 is kept).
 */
export const DEFAULT_MIN_TOPUP_SAR: Readonly<Record<string, number>> = Object.freeze({
  lawyer: 500,
  firm: 500,
  corporate: 500,
  micro: 500,
  government: 500,
  ngo: 500,
  provider: 500,
  individual: 100,
});
export const DEFAULT_FREE_QUESTIONS: Readonly<Record<string, number>> = Object.freeze({ lawyer: 10, individual: 5 });

const MAX_POINTS = 1_000_000;
const MAX_DAYS = 3650;
const MAX_SAR = 1_000_000;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A {key: whole number 0..max} map, or the reason it is not one. */
function countMapIssue(name: string, value: unknown, max: number, keys?: readonly string[]): string | null {
  if (!isPlainObject(value)) return `قيمة ${name} يجب أن تكون كائناً من الشكل {"المفتاح": عدد صحيح}`;
  for (const [k, n] of Object.entries(value)) {
    if (keys && !keys.includes(k)) return `مفتاح غير معروف في ${name}: "${k}" — المسموح: ${keys.join(", ")}`;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > max) {
      return `قيمة "${k}" في ${name} يجب أن تكون عدداً صحيحاً بين 0 و${max}`;
    }
  }
  return null;
}

/**
 * Batch l9 (owner file 15 row 13): the plan cards (/pricing library mode and
 * /laws/subscribe) state the points a library plan includes — the code
 * default of library_plan_points (what 20261127_40 seeded; an admin's change
 * of the setting must be followed by this default). Arabic-Indic digits.
 */
export function libraryPlanPointsLine(planId: string, lang: "ar" | "en"): string {
  const n = Object.hasOwn(DEFAULT_LIBRARY_PLAN_POINTS, planId) ? DEFAULT_LIBRARY_PLAN_POINTS[planId] : 0;
  if (lang === "en") return `${n} points for the library's smart assistant, ending with the plan`;
  return `${n.toLocaleString("ar-SA-u-nu-arab")} نقطة لمساعد المكتبة الذكي، تنتهي بانتهاء الاشتراك`;
}

/**
 * Batch l14: the ERP + library bundle's card. Each cycle brings what the
 * matching library pass brings (lib-q1 / lib-q2 / lib-annual — grantPurchase
 * credits by the library plan's id), so the card names all three.
 */
export function bundleLibraryPointsLine(lang: "ar" | "en"): string {
  const n = (id: string) => (Object.hasOwn(DEFAULT_LIBRARY_PLAN_POINTS, id) ? DEFAULT_LIBRARY_PLAN_POINTS[id] : 0);
  if (lang === "en") {
    return `Library assistant points as with the library alone: ${n("lib-q1")} quarterly, ${n("lib-q2")} half-yearly, ${n("lib-annual")} yearly`;
  }
  const ar = (v: number) => v.toLocaleString("ar-SA-u-nu-arab");
  return `نقاط لمساعد المكتبة الذكي كالمكتبة وحدها: ${ar(n("lib-q1"))} للربع سنوي، ${ar(n("lib-q2"))} للنصف سنوي، ${ar(n("lib-annual"))} للسنوي`;
}

// ── validators for /api/v1/admin/settings (null = acceptable) ──────────────
export function libraryPlanPointsIssue(value: unknown): string | null {
  return countMapIssue(LIBRARY_PLAN_POINTS_KEY, value, MAX_POINTS, Object.keys(DEFAULT_LIBRARY_PLAN_POINTS));
}
export function giftValidDaysIssue(value: unknown): string | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_DAYS
    ? null
    : `قيمة ${GIFT_VALID_DAYS_KEY} يجب أن تكون عدد أيام صحيحاً بين 1 و${MAX_DAYS}`;
}
export function minTopupIssue(value: unknown): string | null {
  return countMapIssue(MIN_TOPUP_KEY, value, MAX_SAR);
}
export function freeQuestionsIssue(value: unknown): string | null {
  return countMapIssue(FREE_QUESTIONS_KEY, value, 1000);
}

// ── parsers: a malformed value falls back to the default, never to 0 ──────
export function parseLibraryPlanPoints(value: unknown): Record<string, number> {
  return value !== undefined && value !== null && libraryPlanPointsIssue(value) === null
    ? { ...DEFAULT_LIBRARY_PLAN_POINTS, ...(value as Record<string, number>) }
    : { ...DEFAULT_LIBRARY_PLAN_POINTS };
}
export function parseGiftValidDays(value: unknown): number {
  return giftValidDaysIssue(value) === null ? (value as number) : DEFAULT_GIFT_VALID_DAYS;
}
/** A stored map REPLACES the defaults (an admin may remove a type's minimum). */
export function parseMinTopup(value: unknown): Record<string, number> {
  return value !== undefined && value !== null && minTopupIssue(value) === null
    ? { ...(value as Record<string, number>) }
    : { ...DEFAULT_MIN_TOPUP_SAR };
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

/** The points a library plan brings (0 for an id the setting does not name). */
export async function readLibraryPlanPoints(admin: SupabaseClient, planId: string): Promise<number> {
  const map = parseLibraryPlanPoints(await readSetting(admin, LIBRARY_PLAN_POINTS_KEY));
  return Object.hasOwn(map, planId) ? map[planId] : 0;
}

export async function readGiftValidDays(admin: SupabaseClient): Promise<number> {
  return parseGiftValidDays(await readSetting(admin, GIFT_VALID_DAYS_KEY));
}

export async function readMinTopupByType(admin: SupabaseClient): Promise<Record<string, number>> {
  return parseMinTopup(await readSetting(admin, MIN_TOPUP_KEY));
}

/** now + days, as a Date (an admin gift's end). */
export function giftExpiry(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 86_400_000);
}
