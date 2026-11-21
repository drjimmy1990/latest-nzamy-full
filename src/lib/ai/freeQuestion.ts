/**
 * freeQuestion.ts — owner ٣٠ (18 Nov 2026, batch l7 decision 6): the free
 * questions are given ONCE per account — 10 for a lawyer, 5 for an individual —
 * from platform_settings free_questions_by_account_type. They replace owner
 * ٤١٢'s daily free quick question (one a day per verified phone, inert since
 * no phone OTP exists).
 *
 * Each account type has ONE tool for them (owner register 14 rows 4 / 36,
 * batch l9; SQL 20261129_60): an individual's are on the GENERAL assistant
 * (quick-answer, «المجيب القانوني السريع»), every other type's on the LIBRARY
 * assistant — freeQuestionToolFor(). The library being locked for a type
 * takes away only library-assistant questions.
 *
 *   * The allowance and the count are the database's
 *     (public.ai_free_question_status, 20261127_40): the allowance by
 *     profiles.user_type, the used ones = the account's free runs that did not
 *     fail (a failed, refunded run gives its question back). Another account
 *     type has none.
 *   * No opt-in: while some are left, runCore starts the question at price 0
 *     through public.ai_start_free_question, which recounts under the start
 *     lock. If it refuses (the last one was taken meanwhile, or the SQL has not
 *     run yet) the same request goes the normal way — the founder's library
 *     credit, else the price the screen showed. A free run is never started
 *     without that lock.
 *   * Any read error answers «none left», so nothing is promised that the
 *     server would not keep.
 *
 * Q121 (batch l12, 20261202_50): which tool carries an INDIVIDUAL's questions
 * is a setting (free_question_tool_by_account_type; quick-answer by default,
 * «المساعد المتقدم» the other choice). A lawyer's 10 are reachable in the
 * library assistant: while some are left they open its professional-plan
 * rule (runs/route.ts), and its sources stay the 100-character preview for
 * an account without the library (source-preview).
 *
 * Pure (type-only Supabase import), so `node --test` runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Retrieved } from "./retrieval.ts";
import { LOCKED_PREVIEW_CHARS } from "./sourcePreview.ts";

export const FREE_QUESTION_TOOL = "library-assistant";
/** The individual's free-question tool (register 4 / 36): the general assistant. */
export const GENERAL_FREE_QUESTION_TOOL = "quick-answer";
/** Q121's other choice for an individual: «المساعد المتقدم» (journal question 7, open). */
export const ADVANCED_FREE_QUESTION_TOOL = "assistant";

export type FreeQuestionTool = typeof FREE_QUESTION_TOOL | typeof GENERAL_FREE_QUESTION_TOOL | typeof ADVANCED_FREE_QUESTION_TOOL;
export type IndividualFreeQuestionTool = typeof GENERAL_FREE_QUESTION_TOOL | typeof ADVANCED_FREE_QUESTION_TOOL;

/**
 * Q121 (batch l12, 20261202_50): WHICH tool carries an individual's free
 * questions is a setting — platform_settings 'free_question_tool_by_account_type'
 * = {"individual": "quick-answer" | "assistant"}. Default: quick-answer (today's
 * tool, kept until the owner answers journal question 7). Every other type:
 * the library assistant (a lawyer's 10), not a setting.
 */
export const FREE_QUESTION_TOOL_SETTING = "free_question_tool_by_account_type";
export const INDIVIDUAL_FREE_QUESTION_TOOLS: readonly IndividualFreeQuestionTool[] = Object.freeze([
  GENERAL_FREE_QUESTION_TOOL,
  ADVANCED_FREE_QUESTION_TOOL,
]);

/** The stored setting → the individual's tool; anything else → quick-answer. */
export function parseIndividualFreeQuestionTool(value: unknown): IndividualFreeQuestionTool {
  const t = value && typeof value === "object" && !Array.isArray(value) ? (value as { individual?: unknown }).individual : undefined;
  return (INDIVIDUAL_FREE_QUESTION_TOOLS as readonly unknown[]).includes(t) ? (t as IndividualFreeQuestionTool) : GENERAL_FREE_QUESTION_TOOL;
}

/** The admin settings validator: exactly {"individual": "quick-answer" | "assistant"}. */
export function freeQuestionToolSettingIssue(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 'قيمة free_question_tool_by_account_type يجب أن تكون كائناً بالشكل {"individual":"quick-answer"}';
  }
  const keys = Object.keys(value as Record<string, unknown>);
  const t = (value as { individual?: unknown }).individual;
  if (keys.length !== 1 || keys[0] !== "individual" || !(INDIVIDUAL_FREE_QUESTION_TOOLS as readonly unknown[]).includes(t)) {
    return 'الأداة المسموحة لأسئلة الفرد المجانية: "quick-answer" (المجيب القانوني السريع) أو "assistant" (المساعد المتقدم)';
  }
  return null;
}

/**
 * The one tool that gives this account type its free questions — the same
 * rule as public.ai_free_question_tool (20261202_50): individual → the
 * setting's tool (quick-answer by default), every other type →
 * library-assistant.
 */
export function freeQuestionToolFor(
  userType: unknown,
  individualTool: IndividualFreeQuestionTool = GENERAL_FREE_QUESTION_TOOL,
): FreeQuestionTool {
  return userType === "individual" ? individualTool : FREE_QUESTION_TOOL;
}

/** A ?tool= value of GET /api/v1/ai/free-question, or null. */
export function parseFreeQuestionTool(value: unknown): FreeQuestionTool | null {
  return value === FREE_QUESTION_TOOL || value === GENERAL_FREE_QUESTION_TOOL || value === ADVANCED_FREE_QUESTION_TOOL ? value : null;
}

/**
 * The individual's tool from the setting, read with the service client. Any
 * error, a missing row or a bad value → quick-answer (today's tool).
 */
export async function readIndividualFreeQuestionTool(admin: SupabaseClient): Promise<IndividualFreeQuestionTool> {
  try {
    const { data, error } = await admin.from("platform_settings").select("value").eq("key", FREE_QUESTION_TOOL_SETTING).maybeSingle();
    if (error) return GENERAL_FREE_QUESTION_TOOL;
    return parseIndividualFreeQuestionTool((data as { value?: unknown } | null)?.value);
  } catch {
    return GENERAL_FREE_QUESTION_TOOL;
  }
}

/**
 * The account's free-question tool: the setting is read only for an
 * individual (one read); everyone else is the library assistant.
 */
export async function freeQuestionToolOf(admin: SupabaseClient, userType: unknown): Promise<FreeQuestionTool> {
  return userType === "individual" ? freeQuestionToolFor(userType, await readIndividualFreeQuestionTool(admin)) : FREE_QUESTION_TOOL;
}

export interface FreeQuestionStatus {
  available: boolean;
  /** Free questions left (0 when none, or unknown). */
  left: number;
  /** The account's allowance (0 when none, or unknown). */
  total: number;
}

const NONE: FreeQuestionStatus = Object.freeze({ available: false, left: 0, total: 0 });

function count(v: unknown): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
}

/** The database's {allowance, used} row as a status; anything malformed is NONE. */
export function freeQuestionStatusFrom(row: unknown): FreeQuestionStatus {
  const r = (Array.isArray(row) ? row[0] : row) as { allowance?: unknown; used?: unknown } | null | undefined;
  const total = count(r?.allowance);
  const used = count(r?.used);
  if (total === null || used === null || total === 0) return NONE;
  const left = Math.max(0, total - used);
  return { available: left > 0, left, total };
}

/**
 * The signed-in user's free questions, read with the service client. Any
 * error — the function not created yet (20261127_40 not run) included — is
 * «none left».
 */
export async function freeQuestionStatusWith(admin: SupabaseClient, userId: string): Promise<FreeQuestionStatus> {
  try {
    const { data, error } = await admin.rpc("ai_free_question_status", { p_user: userId });
    if (error) return NONE;
    return freeQuestionStatusFrom(data);
  } catch {
    return NONE;
  }
}

/**
 * A refusal of ai_start_free_question after which the request goes the normal
 * way: the allowance used meanwhile or not this account's, the SQL not run yet
 * (missing function / table), or the old 20261108_50 function that served
 * quick-answer only (22023).
 */
export function freeQuestionFallsBack(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.message === "free_question_used" || error.message === "free_question_not_eligible") return true;
  return ["22023", "42883", "PGRST202", "42P01", "PGRST205"].includes(error.code ?? "");
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const ar = (n: number) => String(n).replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]);

export const FREE_QUESTION_COPY = {
  /** «أسئلتك المجانية المتبقية: ٣ من ١٠» — shown only when the server says some are left. */
  left: (left: number, total: number) => `أسئلتك المجانية المتبقية: ${ar(left)} من ${ar(total)} — تُستخدم قبل النقاط`,
} as const;

/**
 * Q121 (batch l12): a library-assistant question opened ONLY by the account's
 * free questions (no professional plan, no library grant — the lawyer's 10)
 * answers from the sources' locked preview, never their full text: each
 * source the model receives is cut to LOCKED_PREVIEW_CHARS (100), the reader's
 * locked preview. The source map (titles, links) is unchanged.
 */
export function previewOnlySources(retrieved: Retrieved, limit = LOCKED_PREVIEW_CHARS): Retrieved {
  return {
    ...retrieved,
    sources: retrieved.sources.map((s) => (s.text.length > limit ? { ...s, text: `${s.text.slice(0, limit)}…` } : s)),
  };
}
