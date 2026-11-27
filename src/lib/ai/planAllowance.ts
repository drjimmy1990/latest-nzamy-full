/**
 * planAllowance.ts — owner ق٢٦-٦ (package 26 Nov 2026, batch l19 «plans»):
 * the fair use of the individual's smart plan `ind-ai` (249 SAR a year).
 *
 * Every CALENDAR MONTH by Riyadh time, with no carry-over, the plan includes:
 *   * 30 questions — «المجيب القانوني السريع» (registry tool quick-answer);
 *   * 2 works      — «صائغ العقود المبسّط» (simple-contract), the only AI
 *     drafting tool an individual has («صائغ الخطابات» builds letters from a
 *     template and calls no model, so it has nothing to count).
 * Inside the allowance the run starts at price 0; past it, the normal price
 * in points, and a subscriber without enough points is told to top up (the
 * 100 / 250 packs). The individual's 5 free questions of the floating window
 * («مساعد نظامي», owner Q181) are a separate, lifetime allowance — untouched.
 *
 * The counter is the database's (SQL 20261209_70): public.ai_plan_allowance_status
 * reads it, public.ai_start_plan_allowance_run starts a run from it under
 * ai_start_run's lock (one use per run — the run id is the key — and a failed,
 * refunded run gives its use back). The limits are platform_settings
 * 'ind_ai_fair_use' (default 30 / 2).
 *
 * FAIL-OPEN (the owner's rule: a paying subscriber is never refused because
 * the counter broke): when the counter cannot answer — the SQL not run yet, a
 * read error, the start function failing with anything but its own two
 * refusals — and the app has read the subscriber's ind-ai row DIRECTLY, the
 * run starts at price 0, UNCOUNTED, and the server logs it. If even that
 * direct read fails, nothing is known: the normal path (points) applies, as
 * before this batch. The tool's daily limit still bounds an outage.
 *
 * Pure (type-only Supabase import), so `node --test` runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const IND_AI_PLAN_ID = "ind-ai";
export const IND_AI_FAIR_USE_SETTING = "ind_ai_fair_use";
/** The owner's numbers (ق٢٦-٦): the defaults when the setting is missing or malformed. */
export const IND_AI_QUESTIONS_PER_MONTH = 30;
export const IND_AI_WORKS_PER_MONTH = 2;

export type PlanAllowanceKind = "question" | "work";

/** The same map as public.ai_plan_allowance_kind (20261209_70). */
export function planAllowanceKindFor(toolId: unknown): PlanAllowanceKind | null {
  if (toolId === "quick-answer") return "question";
  if (toolId === "simple-contract") return "work";
  return null;
}

export type PlanAllowanceState =
  /** not an active ind-ai subscriber (or nothing could be read): the normal path */
  | { state: "none" }
  /** uses left this month */
  | { state: "left"; left: number; limit: number }
  /** this month's allowance is used: the normal price in points */
  | { state: "used"; limit: number }
  /** an ind-ai subscriber read directly while the counter could not answer: fail open */
  | { state: "degraded" };

const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

/** One row of public.ai_plan_allowance_status → this kind's state; anything malformed → null. */
export function planAllowanceStateFrom(data: unknown, kind: PlanAllowanceKind): PlanAllowanceState | null {
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  if (!row || typeof row !== "object") return null;
  if (row.plan_active !== true) return row.plan_active === false ? { state: "none" } : null;
  const limit = kind === "question" ? row.questions_limit : row.works_limit;
  const used = kind === "question" ? row.questions_used : row.works_used;
  if (!isCount(limit) || !isCount(used)) return null;
  return used < limit ? { state: "left", left: limit - used, limit } : { state: "used", limit };
}

/**
 * Is `userId` an active, unexpired ind-ai subscriber? Read straight from
 * subscriptions (the same rule as public.ind_ai_plan_active), for the
 * fail-open path and the quick-answer tier opener. null = could not read.
 */
export async function indAiPlanActiveWith(admin: SupabaseClient, userId: string, now: Date = new Date()): Promise<boolean | null> {
  try {
    const { data, error } = await admin
      .from("subscriptions")
      .select("id, current_period_end")
      .eq("user_id", userId)
      .eq("status", "active")
      .eq("plan_id", IND_AI_PLAN_ID)
      .limit(5);
    if (error) {
      console.error("[ai] ind-ai subscription read failed:", error.code);
      return null;
    }
    const rows = (Array.isArray(data) ? data : []) as Array<{ current_period_end?: unknown }>;
    return rows.some((r) => {
      const end = r.current_period_end;
      if (end === null || end === undefined) return true;
      const t = typeof end === "string" ? Date.parse(end) : NaN;
      return Number.isFinite(t) && t > now.getTime();
    });
  } catch (err) {
    console.error("[ai] ind-ai subscription read threw:", (err as { name?: unknown } | null)?.name ?? "error");
    return null;
  }
}

/**
 * The allowance for one run of `kind`: the counter's answer, else (it could
 * not answer) `degraded` for a subscriber read directly, else `none`.
 */
export async function planAllowanceStateWith(
  admin: SupabaseClient,
  userId: string,
  kind: PlanAllowanceKind,
  now: Date = new Date(),
): Promise<PlanAllowanceState> {
  try {
    const { data, error } = await admin.rpc("ai_plan_allowance_status", { p_user: userId });
    if (!error) {
      const state = planAllowanceStateFrom(data, kind);
      if (state) return state;
      console.error("[ai] ai_plan_allowance_status answered an unexpected shape");
    } else {
      console.error("[ai] ai_plan_allowance_status failed:", error.code);
    }
  } catch (err) {
    console.error("[ai] ai_plan_allowance_status threw:", (err as { name?: unknown } | null)?.name ?? "error");
  }
  return (await indAiPlanActiveWith(admin, userId, now)) === true ? { state: "degraded" } : { state: "none" };
}

/** The start function's own refusals: the run goes the normal way (points). */
export function planAllowanceRefused(error: { message?: string } | null | undefined): "used" | "not_eligible" | null {
  if (error?.message === "plan_allowance_used") return "used";
  if (error?.message === "plan_allowance_not_eligible") return "not_eligible";
  return null;
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const ar = (n: number) => String(n).replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]);

/** Where a subscriber whose allowance is used tops up (the 100 / 250 packs). */
export const PLAN_ALLOWANCE_TOPUP_HREF = "/dashboard/client/wallet#topup";

export const PLAN_ALLOWANCE_COPY = {
  /**
   * Beside the price. A label:value form, so the count never heads an
   * agreeing noun phrase (١ / ٢ / ٣–١٠ / ١١+ take different Arabic forms).
   */
  left: (kind: PlanAllowanceKind, left: number, limit: number) =>
    kind === "question"
      ? `أسئلة باقتك الذكية المتبقية هذا الشهر: ${ar(left)} من ${ar(limit)} — لا تُخصم نقاط`
      : `العقود المبسّطة المتبقية في باقتك الذكية هذا الشهر: ${ar(left)} من ${ar(limit)} — لا تُخصم نقاط`,
  /** The month's allowance is used: the run is charged points (the screen says so before). */
  usedNote: (kind: PlanAllowanceKind) =>
    kind === "question"
      ? "استنفدت أسئلة باقتك الذكية لهذا الشهر؛ يُخصم سعر السؤال من نقاطك حتى يتجدد الرصيد أول الشهر القادم"
      : "استنفدت العقود المبسّطة في باقتك الذكية لهذا الشهر؛ يُخصم السعر من نقاطك حتى يتجدد الرصيد أول الشهر القادم",
  /** 402 plan_allowance_used: used, and not enough points either. */
  refused: (kind: PlanAllowanceKind, limit: number) =>
    kind === "question"
      ? `استنفدت أسئلة باقتك الذكية لهذا الشهر (الحد الشهري: ${ar(limit)}، ولا يُرحَّل)، ورصيد نقاطك لا يكفي لهذا السؤال. يتجدد الرصيد أول الشهر القادم بتوقيت الرياض، ويمكنك الآن شحن رصيدك بباقة ١٠٠ أو ٢٥٠ نقطة.`
      : `استنفدت العقود المبسّطة في باقتك الذكية لهذا الشهر (الحد الشهري: ${ar(limit)}، ولا يُرحَّل)، ورصيد نقاطك لا يكفي لهذه العملية. يتجدد الرصيد أول الشهر القادم بتوقيت الرياض، ويمكنك الآن شحن رصيدك بباقة ١٠٠ أو ٢٥٠ نقطة.`,
  topupLink: "اشحن رصيدك",
} as const;
