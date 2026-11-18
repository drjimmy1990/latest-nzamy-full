/**
 * The lawyer signup decision table (owner decisions ٢٠–٢١, amended by ٢٧ /
 * batch l7 decision 12: e-mail only). Pure.
 *
 * Instant approval ONLY when all of these hold:
 *   - an advocate (consultants are not in the lawyers' registry);
 *   - the registry has his licence, valid today in Riyadh, not archived;
 *   - the four-part name he typed matches the registry name (exact, or four or
 *     more words all in a longer registry name);
 *   - no other VERIFIED account holds the licence;
 *   - the licence photo is uploaded and the AI check read it as a MATCH
 *     (skipped / doubt / mismatch / error → human review);
 *   - the code sent to the account's OWN e-mail was confirmed (no WhatsApp,
 *     no SMS, no registry-mobile code any more);
 *   - his e-mail is not a throwaway address;
 *   - LAWYER_INSTANT_APPROVAL=on.
 * Everything else ends in «سجّلنا بياناتك وسنتواصل معك» (review) — never a
 * dead end — or in the next step he still has to do.
 *
 * Order: the photo is mandatory, so it is always asked first. A hard reason
 * holds the account before the e-mail step is offered: the reviewer decides.
 */

import { nameMatchAccepted, type NameMatch } from "./nameLicence.ts";

export type RegistryStatus =
  | "valid"
  | "expired"
  | "unverifiable"
  | "not_found"
  | "no_licence"
  | "unavailable"
  | "not_checked";

export type AiStatus = "pending" | "match" | "doubt" | "mismatch" | "skipped" | "error";

export type DecisionInput = {
  alreadyVerified: boolean;
  /** rejected / suspended by an admin: never approved automatically. */
  accountBlocked: boolean;
  practiceKind: "advocate" | "consultant";
  registryStatus: RegistryStatus;
  nameMatch: NameMatch | null;
  otherVerifiedClaims: number;
  licenceImageUploaded: boolean;
  aiStatus: AiStatus | null;
  /** The code sent to the account's own e-mail was confirmed. */
  emailOtpVerified: boolean;
  /** The e-mail code can be sent (LAWYER_OTP_EMAIL=on + Resend + pepper). */
  emailChannelAvailable: boolean;
  /**
   * A «رقمي تغيّر» request recorded before the e-mail-only change (the
   * column stays). Still a hold: a human looks at those accounts.
   */
  mobileChangeRequested: boolean;
  emailThrowaway: boolean;
  instantApprovalEnabled: boolean;
};

export type ReasonCode =
  | "account_not_pending"
  | "consultant_not_in_registry"
  | "registry_expired"
  | "registry_unverifiable"
  | "registry_not_found"
  | "registry_no_licence"
  | "registry_unavailable"
  | "registry_not_checked"
  | "name_mismatch"
  | "licence_claimed"
  | "mobile_change"
  | "throwaway_email"
  | "ai_mismatch"
  | "ai_doubt"
  | "ai_error"
  | "ai_skipped"
  | "email_unavailable"
  | "instant_approval_off";

export type Decision =
  | { outcome: "verified"; next: null; reasons: [] }
  | { outcome: "pending"; next: "upload_licence" | "email_otp"; reasons: ReasonCode[] }
  | { outcome: "review"; next: null; reasons: ReasonCode[] }
  | { outcome: "approve"; next: null; reasons: [] };

export function decideLawyerSignup(i: DecisionInput): Decision {
  if (i.alreadyVerified) return { outcome: "verified", next: null, reasons: [] };

  const hard: ReasonCode[] = [];
  if (i.accountBlocked) hard.push("account_not_pending");
  if (i.practiceKind === "consultant") hard.push("consultant_not_in_registry");
  else if (i.registryStatus !== "valid") hard.push(`registry_${i.registryStatus}` as ReasonCode);
  else {
    if (!nameMatchAccepted(i.nameMatch)) hard.push("name_mismatch");
    if (i.otherVerifiedClaims > 0) hard.push("licence_claimed");
  }
  if (i.mobileChangeRequested) hard.push("mobile_change");
  if (i.emailThrowaway) hard.push("throwaway_email");
  if (i.aiStatus === "mismatch") hard.push("ai_mismatch");
  if (i.aiStatus === "doubt") hard.push("ai_doubt");
  if (i.aiStatus === "error" || i.aiStatus === "pending") hard.push("ai_error");

  // The photo is mandatory for everyone, held or not: the reviewer needs it.
  if (!i.licenceImageUploaded) return { outcome: "pending", next: "upload_licence", reasons: hard };
  if (hard.length > 0) return { outcome: "review", next: null, reasons: hard };

  if (!i.emailOtpVerified) {
    if (!i.emailChannelAvailable) return { outcome: "review", next: null, reasons: ["email_unavailable"] };
    return { outcome: "pending", next: "email_otp", reasons: [] };
  }

  const soft: ReasonCode[] = [];
  if (i.aiStatus !== "match") soft.push("ai_skipped");
  if (!i.instantApprovalEnabled) soft.push("instant_approval_off");
  if (soft.length > 0) return { outcome: "review", next: null, reasons: soft };
  return { outcome: "approve", next: null, reasons: [] };
}

/** Arabic lines for the ADMIN queue (the lawyer only ever sees the hold message). */
export const REASON_AR: Record<ReasonCode, string> = {
  account_not_pending: "الحساب مرفوض أو موقوف من الإدارة",
  consultant_not_in_registry: "مستشار قانوني — ليس في سجل المحامين، يُراجع يدوياً",
  registry_expired: "الترخيص منتهٍ في السجل",
  registry_unverifiable: "تعذّر التحقق من السجل (مؤرشف أو بلا تاريخ انتهاء)",
  registry_not_found: "رقم الترخيص غير موجود في السجل",
  registry_no_licence: "لا يوجد رقم ترخيص في الملف",
  registry_unavailable: "السجل غير متاح وقت الفحص",
  registry_not_checked: "لم يُفحص السجل بعد",
  name_mismatch: "الاسم المُدخل لا يطابق اسم السجل",
  licence_claimed: "رقم الترخيص نفسه لحساب محامٍ آخر موثّق",
  mobile_change: "طلب قديم «رقمي تغيّر» (قبل التوثيق بالبريد) — يُراجع يدوياً",
  throwaway_email: "بريد من نطاق مؤقت",
  ai_mismatch: "الفحص الآلي للصورة: لا تطابق",
  ai_doubt: "الفحص الآلي للصورة: غير متأكد",
  ai_error: "الفحص الآلي للصورة: تعذّر",
  ai_skipped: "لم يُفحص آلياً — تُراجع الصورة يدوياً",
  email_unavailable: "رمز البريد غير مفعّل (مزوّد البريد غير مضبوط) — يُراجع يدوياً",
  instant_approval_off: "الاعتماد الفوري غير مفعّل — كل الشروط متحققة",
};

/**
 * Reasons recorded before the e-mail-only change (decision_reasons rows that
 * the next evaluation has not rewritten yet), plus the service's own
 * approval_error. Kept so the admin never sees a
 * bare English code.
 */
export const LEGACY_REASON_AR: Record<string, string> = {
  no_registry_mobile: "لا يوجد جوال صالح في السجل (قاعدة قديمة: رمز جوال السجل)",
  otp_unavailable: "لا توجد قناة إرسال رمز للجوال (قاعدة قديمة: واتساب/SMS)",
  licence_changed: "تغيّر رقم الترخيص بعد التحقق برمز الجوال (قاعدة قديمة)",
  approval_error: "تعذّر الاعتماد الآلي وقت التنفيذ — يُراجع يدوياً",
};

/** The admin's Arabic line for any recorded reason, current or legacy. */
export function reasonLineAr(code: string): string {
  return (REASON_AR as Record<string, string>)[code] ?? LEGACY_REASON_AR[code] ?? code;
}

/** The one line the lawyer sees whenever his account is held (decision ٢١). */
export const HOLD_MESSAGE_AR = "سجّلنا بياناتك وسنتواصل معك";
