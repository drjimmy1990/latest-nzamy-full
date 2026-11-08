/**
 * freeQuestion.ts — owner ٤١٢: «السؤال السريع: 10 نقاط، مع بقاء سؤال يومي مجاني
 * واحد (0 نقطة) لكل حساب فردي موثق برقم جوال.»
 *
 * Controller ruling (batch 2026-11-08, B4): built, and inert until phone
 * verification (OTP, owner question ٤٤٨) exists.
 *   * Eligible: profiles.user_type 'individual' with a VERIFIED phone
 *     (public.verified_phones, written only by the server). profiles.phone is
 *     typed by the user and is never treated as verified.
 *   * One free question per verified PHONE per Riyadh calendar day (Asia/Riyadh,
 *     UTC+3 all year), whichever account it is on: public.ai_free_question_claims,
 *     PRIMARY KEY (phone, day), claimed atomically by public.ai_start_free_question
 *     (20261108_50) with the run itself. A run that failed (refunded) gives it back.
 *   * The page asks for it (`useFreeQuestion`) only when this file's status says it
 *     is available; every other question costs the registry price (10).
 * Nobody is verified yet, so the status is «not available» for everyone and
 * nothing changes on production.
 *
 * Pure (type-only Supabase import), so `node --test` runs it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const FREE_QUESTION_TOOL = "quick-answer";
export const FREE_QUESTION_USER_TYPE = "individual";
/** The shape public.verified_phones accepts (a Saudi mobile in E.164, as profiles.phone). */
const VERIFIED_PHONE = /^\+9665\d{8}$/;
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/** The Riyadh calendar day of `now` as YYYY-MM-DD (Saudi Arabia keeps UTC+3 all year; midnight there is 21:00 UTC). */
export function riyadhDay(now: Date): string {
  return new Date(now.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** An individual account whose phone the server verified. Anything else is not eligible. */
export function freeQuestionEligible(a: { userType: unknown; verifiedPhone: unknown }): boolean {
  return a.userType === FREE_QUESTION_USER_TYPE && typeof a.verifiedPhone === "string" && VERIFIED_PHONE.test(a.verifiedPhone);
}

export interface FreeQuestionStatus {
  available: boolean;
}

const NOT_AVAILABLE: FreeQuestionStatus = Object.freeze({ available: false });

/**
 * Is today's free question open to this user? Read with the service client.
 * Any read error — the tables not created yet (20261108_50 not run) included —
 * answers «not available»: the page then shows the normal price and offers
 * nothing (never a promise that cannot be kept).
 */
export async function freeQuestionStatusWith(admin: SupabaseClient, userId: string, now: Date = new Date()): Promise<FreeQuestionStatus> {
  try {
    const profile = await admin.from("profiles").select("user_type").eq("id", userId).maybeSingle();
    if (profile.error || (profile.data as { user_type?: unknown } | null)?.user_type !== FREE_QUESTION_USER_TYPE) return NOT_AVAILABLE;

    const phone = await admin.from("verified_phones").select("phone_e164").eq("user_id", userId).maybeSingle();
    const verifiedPhone = (phone.data as { phone_e164?: unknown } | null)?.phone_e164;
    if (phone.error || !freeQuestionEligible({ userType: FREE_QUESTION_USER_TYPE, verifiedPhone })) return NOT_AVAILABLE;

    const claim = await admin
      .from("ai_free_question_claims")
      .select("run_id")
      .eq("phone_e164", verifiedPhone as string)
      .eq("riyadh_day", riyadhDay(now))
      .maybeSingle();
    if (claim.error) return NOT_AVAILABLE;
    if (!claim.data) return { available: true };
    const runId = (claim.data as { run_id?: unknown }).run_id;
    if (typeof runId !== "string") return NOT_AVAILABLE;
    // A claim whose run failed (refunded) is free again; ai_start_free_question agrees.
    const run = await admin.from("ai_runs").select("status").eq("id", runId).maybeSingle();
    if (run.error) return NOT_AVAILABLE;
    return { available: (run.data as { status?: unknown } | null)?.status === "failed" };
  } catch {
    return NOT_AVAILABLE;
  }
}

export const FREE_QUESTION_COPY = {
  badge: "سؤالك المجاني اليوم",
  price: "مجاناً — سؤالك المجاني اليوم",
  used: "استُخدم سؤالك المجاني لهذا اليوم — أعد الإرسال ليُحتسب بالنقاط",
  notEligible: "السؤال المجاني اليومي غير متاح لحسابك — أعد الإرسال ليُحتسب بالنقاط",
  unavailable: "السؤال المجاني غير متاح الآن — أعد الإرسال ليُحتسب بالنقاط",
} as const;

/** A free question's failure gave no points back: it gave the free question back. */
export function freeRunRefundText(message: string, free: boolean): string {
  return free ? message.replace("وأُعيدت نقاطك", "ولم يُحتسب سؤالك المجاني").replace("أُعيدت نقاطك", "لم يُحتسب سؤالك المجاني") : message;
}
