/**
 * The lawyer signup decision table (owner decisions ٢٠–٢١). Pure.
 *
 * Instant approval ONLY when all of these hold:
 *   - an advocate (consultants are not in the lawyers' registry);
 *   - the registry has his licence, valid today in Riyadh, not archived;
 *   - the four-part name he typed matches the registry name (exact, or four or
 *     more words all in a longer registry name);
 *   - no other VERIFIED account holds the licence;
 *   - the licence photo is uploaded and the AI check read it as a MATCH
 *     (skipped / doubt / mismatch / error → human review);
 *   - the code sent to the REGISTRY mobile was confirmed, for the licence that
 *     is still on his file;
 *   - he did not report «رقمي تغيّر», his e-mail is not a throwaway address;
 *   - LAWYER_INSTANT_APPROVAL=on.
 * Everything else ends in «سجّلنا بياناتك وسنتواصل معك» (review) — never a
 * dead end — or in the next step he still has to do.
 *
 * Order: the photo is mandatory, so it is always asked first. No code is ever
 * sent while a hard reason already holds the account: the code goes to the
 * real lawyer's phone, and someone whose name or licence does not match is not
 * him.
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
  hasRegistryMobile: boolean;
  licenceImageUploaded: boolean;
  aiStatus: AiStatus | null;
  identityOtpVerified: boolean;
  /** The licence the code proved is the licence on his file now. */
  identityOtpLicenceMatches: boolean;
  identityChannelAvailable: boolean;
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
  | "no_registry_mobile"
  | "otp_unavailable"
  | "licence_changed"
  | "instant_approval_off";

export type Decision =
  | { outcome: "verified"; next: null; reasons: [] }
  | { outcome: "pending"; next: "upload_licence" | "identity_otp"; reasons: ReasonCode[] }
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

  if (!i.identityOtpVerified) {
    if (!i.hasRegistryMobile) return { outcome: "review", next: null, reasons: ["no_registry_mobile"] };
    if (!i.identityChannelAvailable) return { outcome: "review", next: null, reasons: ["otp_unavailable"] };
    return { outcome: "pending", next: "identity_otp", reasons: [] };
  }
  if (!i.identityOtpLicenceMatches) return { outcome: "review", next: null, reasons: ["licence_changed"] };

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
  mobile_change: "أبلغ أن رقمه تغيّر — يُراجع يدوياً",
  throwaway_email: "بريد من نطاق مؤقت",
  ai_mismatch: "الفحص الآلي للصورة: لا تطابق",
  ai_doubt: "الفحص الآلي للصورة: غير متأكد",
  ai_error: "الفحص الآلي للصورة: تعذّر",
  ai_skipped: "لم يُفحص آلياً — تُراجع الصورة يدوياً",
  no_registry_mobile: "لا يوجد جوال صالح في السجل",
  otp_unavailable: "لا توجد قناة إرسال رمز مفعّلة (واتساب/SMS)",
  licence_changed: "تغيّر رقم الترخيص بعد التحقق بالرمز",
  instant_approval_off: "الاعتماد الفوري غير مفعّل — كل الشروط متحققة",
};

/** The one line the lawyer sees whenever his account is held (decision ٢١). */
export const HOLD_MESSAGE_AR = "سجّلنا بياناتك وسنتواصل معك";
