/**
 * accountTypeConvert.ts — l16 C14 (owner package 25 Nov, §٣.٣), first slice:
 * the admin account-type converter's vocabulary and the checks the route runs
 * before it calls public.admin_change_account_type (20261206_80).
 *
 * The three moves of this slice: lawyer advocate ↔ consultant, individual →
 * lawyer (advocate | consultant), individual → provider (notary | arbitrator |
 * bailiff). Every other move stays on the old «تغيير نوع الحساب» control.
 *
 * Pure (no imports), so `node --test` loads it and the client page can too.
 */

export const CONVERT_TARGETS = ["advocate", "consultant", "notary", "arbitrator", "bailiff"] as const;
export type ConvertTarget = (typeof CONVERT_TARGETS)[number];

export const CONVERT_TARGET_LABEL_AR: Record<ConvertTarget, string> = {
  advocate: "محامٍ مترافع",
  consultant: "مستشار قانوني",
  notary: "موثّق",
  arbitrator: "محكّم",
  bailiff: "مراجع حكومي",
};

export function isConvertTarget(v: unknown): v is ConvertTarget {
  return typeof v === "string" && (CONVERT_TARGETS as readonly string[]).includes(v);
}

export const REASON_MIN = 5;
export const REASON_MAX = 1000;

const BASE_LABEL_AR: Record<string, string> = {
  individual: "عميل فرد",
  lawyer: "محامٍ",
  firm: "مكتب محاماة",
  corporate: "شركة",
  micro: "منشأة صغيرة",
  provider: "مزوّد خدمة",
  government: "جهة حكومية",
  ngo: "منظمة غير ربحية",
  admin: "مسؤول",
};

/**
 * The account's FULL type for the admin page: «محامٍ — مستشار قانوني»,
 * «مزوّد خدمة — موثّق», or the base label when the type has no kind.
 */
export function fullAccountTypeLabelAr(userType: unknown, kind: unknown): string {
  const base = typeof userType === "string" ? BASE_LABEL_AR[userType] ?? "نوع غير معروف" : "نوع غير معروف";
  if ((userType === "lawyer" || userType === "provider") && isConvertTarget(kind)) {
    return `${base} — ${CONVERT_TARGET_LABEL_AR[kind]}`;
  }
  return base;
}

/** The commitments that refuse a conversion (admin_account_type_blockers). */
export const BLOCKER_LABEL_AR: Record<string, string> = {
  paid_plan: "اشتراك مدفوع ساري",
  firm_membership: "عضوية في مكتب محاماة أو ملكية مكتب",
  open_cases: "طلب أو قضية مفتوحة",
  founder_seat: "مقعد في حملة المؤسس",
};

export function blockerLabelsAr(blockers: unknown): string[] {
  if (!Array.isArray(blockers)) return [];
  return blockers.filter((b): b is string => typeof b === "string").map((b) => BLOCKER_LABEL_AR[b] ?? "التزام قائم");
}

/** Reads and checks the POST body; the reason is trimmed. */
export function readConvertBody(
  body: unknown,
): { ok: true; target: ConvertTarget; reason: string } | { ok: false; error: string } {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!b) return { ok: false, error: "بيانات غير صالحة" };
  if (!isConvertTarget(b.target)) return { ok: false, error: "اختر النوع الجديد من القائمة." };
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    return { ok: false, error: `اكتب سبب التحويل (من ${REASON_MIN} أحرف إلى ${REASON_MAX} حرف).` };
  }
  return { ok: true, target: b.target, reason };
}

/** The converter's refusal code → HTTP status and Arabic text. */
export function convertRefusal(result: unknown): { status: number; error: string; blockers?: string[] } {
  const r = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
  switch (r.code) {
    case "open_commitments": {
      const labels = blockerLabelsAr(r.blockers);
      return {
        status: 409,
        error: `لا يمكن تحويل هذا الحساب الآن لوجود التزامات قائمة: ${labels.join("، ")}. تُعالج هذه الالتزامات أولاً.`,
        blockers: labels,
      };
    }
    case "not_supported":
      return { status: 400, error: "هذا التحويل غير متاح من هنا. المتاح: محامٍ مترافع ↔ مستشار قانوني، ومن عميل فرد إلى محامٍ أو مزوّد خدمة." };
    case "reason_required":
      return { status: 400, error: `اكتب سبب التحويل (من ${REASON_MIN} أحرف إلى ${REASON_MAX} حرف).` };
    case "bad_target":
      return { status: 400, error: "اختر النوع الجديد من القائمة." };
    case "self":
      return { status: 400, error: "لا يمكنك تحويل حسابك من لوحة الإدارة." };
    case "actor_not_admin":
      return { status: 403, error: "هذا الإجراء لحسابات الإدارة فقط." };
    case "not_found":
      return { status: 404, error: "المستخدم غير موجود." };
    default:
      return { status: 500, error: "تعذّر تحويل نوع الحساب. لم يُحفظ أي تغيير." };
  }
}

/** A Postgres / PostgREST error meaning «20261206_80 has not run yet». */
export function isConverterMissing(code: unknown): boolean {
  return code === "42883" || code === "PGRST202" || code === "42P01";
}
