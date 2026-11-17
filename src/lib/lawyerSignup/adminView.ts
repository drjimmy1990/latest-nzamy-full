/**
 * The admin queue's «توثيق التسجيل» line for a lawyer (owner decisions
 * ٢٠–٢١) — the pure half: shaping the rows the server read into the fields
 * the page shows, and the Arabic lines. Pure (relative imports only).
 *
 * The admin sees what the lawyer never does: the reasons, the AI result, the
 * code status and the new mobile of a «رقمي تغيّر» request. Never the
 * registry mobile (last two digits only) and never a code.
 */

import { REASON_AR, type ReasonCode } from "./decision.ts";

export type SignupVerificationView = {
  decision: "pending" | "review" | "approved";
  decidedBy: "system" | "admin" | null;
  reasons: string[];
  registryStatus: string;
  nameMatch: string | null;
  fullNameInput: string | null;
  mobileHint: string | null;
  identity: { verifiedAt: string | null; channel: string | null; lastSentAt: string | null; lastDelivery: string | null };
  email: { verifiedAt: string | null; hint: string | null; throwaway: boolean };
  mobileChange: { requestedAt: string | null; newMobile: string | null };
  image: {
    url: string | null;
    purpose: string;
    aiStatus: string;
    aiChecks: Record<string, string> | null;
    aiRead: { name: string | null; licenceNumber: string | null; expiry: string | null } | null;
    uploadedAt: string;
  } | null;
};

const s = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export function shapeSignupView(
  row: Record<string, unknown>,
  image: Record<string, unknown> | null,
  imageUrl: string | null,
  lastChallenge: Record<string, unknown> | null,
): SignupVerificationView {
  const decision = row.decision === "review" || row.decision === "approved" ? row.decision : "pending";
  const ai = (image?.ai_result ?? null) as Record<string, unknown> | null;
  const extracted = (ai?.extracted ?? null) as Record<string, unknown> | null;
  const checks = ai?.checks && typeof ai.checks === "object" ? (ai.checks as Record<string, string>) : null;
  return {
    decision,
    decidedBy: row.decided_by === "system" || row.decided_by === "admin" ? row.decided_by : null,
    reasons: Array.isArray(row.decision_reasons) ? row.decision_reasons.filter((r): r is string => typeof r === "string") : [],
    registryStatus: s(row.registry_status) ?? "not_checked",
    nameMatch: s(row.name_match),
    fullNameInput: s(row.full_name_input),
    mobileHint: s(row.mobile_hint),
    identity: {
      verifiedAt: s(row.identity_otp_verified_at),
      channel: s(row.identity_otp_channel),
      lastSentAt: s(lastChallenge?.created_at),
      lastDelivery: s(lastChallenge?.delivery),
    },
    email: { verifiedAt: s(row.email_otp_verified_at), hint: s(row.email_otp_hint), throwaway: row.email_throwaway === true },
    mobileChange: { requestedAt: s(row.mobile_change_requested_at), newMobile: s(row.mobile_change_new_mobile) },
    image: image
      ? {
          url: imageUrl,
          purpose: s(image.purpose) ?? "signup",
          aiStatus: s(image.ai_status) ?? "pending",
          aiChecks: checks,
          aiRead: extracted
            ? { name: s(extracted.name), licenceNumber: s(extracted.licenceNumber), expiry: s(extracted.expiry) }
            : null,
          uploadedAt: s(image.created_at) ?? "",
        }
      : null,
  };
}

const AI_AR: Record<string, string> = {
  match: "الفحص الآلي: مطابق",
  doubt: "الفحص الآلي: غير متأكد",
  mismatch: "الفحص الآلي: غير مطابق",
  skipped: "لم يُفحص آلياً (غير مفعّل)",
  error: "الفحص الآلي تعذّر",
  pending: "الفحص الآلي لم يكتمل",
};

const CHANNEL_AR: Record<string, string> = { whatsapp: "واتساب", sms: "رسالة نصية" };

export type Tone = "good" | "warn" | "bad";

export function describeSignupView(v: SignupVerificationView): { headline: string; tone: Tone; lines: string[] } {
  const headline =
    v.decision === "approved"
      ? v.decidedBy === "system" ? "اعتُمد فورياً بعد التحقق" : "معتمد"
      : v.decision === "review" ? "محجوز للمراجعة البشرية" : "التوثيق لم يكتمل بعد";
  const tone: Tone = v.decision === "approved" ? "good" : v.decision === "review" ? "warn" : "warn";
  const lines: string[] = [];
  for (const r of v.reasons) lines.push(REASON_AR[r as ReasonCode] ?? r);
  if (v.fullNameInput) lines.push(`الاسم المُدخل: ${v.fullNameInput}`);
  lines.push(
    v.identity.verifiedAt
      ? `رمز جوال السجل: مؤكَّد${v.identity.channel ? ` (${CHANNEL_AR[v.identity.channel] ?? v.identity.channel})` : ""}`
      : v.identity.lastSentAt
        ? `رمز جوال السجل: أُرسل${v.identity.lastDelivery === "failed" ? " وتعذّر التسليم" : ""} ولم يُؤكَّد`
        : "رمز جوال السجل: لم يُرسل",
  );
  if (v.mobileHint) lines.push(`جوال السجل ينتهي بـ ${v.mobileHint}`);
  lines.push(v.email.verifiedAt ? "البريد: مؤكَّد بالرمز" : v.email.throwaway ? "البريد: نطاق مؤقت" : "البريد: لم يُؤكَّد بالرمز");
  if (v.mobileChange.requestedAt) lines.push(`طلب «رقمي تغيّر»: الجوال الجديد ${v.mobileChange.newMobile ?? "—"}`);
  if (v.image) {
    lines.push(AI_AR[v.image.aiStatus] ?? v.image.aiStatus);
    if (v.image.aiRead) {
      const r = v.image.aiRead;
      lines.push(`قرأ النموذج: ${r.name ?? "—"} · ${r.licenceNumber ?? "—"} · ${r.expiry ?? "—"}`);
    }
  } else {
    lines.push("لا توجد صورة ترخيص مرفوعة من التسجيل");
  }
  return { headline, tone, lines };
}
