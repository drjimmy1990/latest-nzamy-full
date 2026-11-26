/**
 * Break-glass access to a restricted firm case (owner decision س٢١٦,
 * migration 20261206_12). Pure helpers shared by the admin routes:
 * the status of a grant row, and the Arabic answer for each database refusal.
 * No I/O here (unit-tested in breakGlass.test.ts).
 */

export type BreakGlassStatus = "pending" | "active" | "expired" | "rejected" | "revoked" | "lapsed";

export interface BreakGlassGrantRow {
  requested_at: string;
  approved_at: string | null;
  expires_at: string | null;
  rejected_at: string | null;
  revoked_at: string | null;
}

/** A pending request lapses after this long without a second approval. */
export const BREAK_GLASS_PENDING_HOURS = 24;
export const BREAK_GLASS_MIN_MINUTES = 15;
export const BREAK_GLASS_MAX_MINUTES = 240;
export const BREAK_GLASS_REASON_MIN = 20;
export const BREAK_GLASS_REASON_MAX = 1000;

export function breakGlassStatus(row: BreakGlassGrantRow, now: number = Date.now()): BreakGlassStatus {
  if (row.rejected_at) return "rejected";
  if (row.approved_at) {
    if (row.revoked_at) return "revoked";
    return row.expires_at && Date.parse(row.expires_at) > now ? "active" : "expired";
  }
  if (row.revoked_at) return "lapsed";
  return Date.parse(row.requested_at) + BREAK_GLASS_PENDING_HOURS * 3600_000 > now ? "pending" : "lapsed";
}

export const BREAK_GLASS_STATUS_AR: Record<BreakGlassStatus, string> = {
  pending: "بانتظار موافقة مسؤول ثانٍ",
  active: "وصول طارئ نافذ",
  expired: "انتهت المدة",
  rejected: "مرفوض",
  revoked: "أُنهي الوصول",
  lapsed: "سقط لعدم الموافقة خلال ٢٤ ساعة",
};

/** Not installed yet: the RPC or the table is missing (migration not run). */
export function isBreakGlassMissing(code: string | undefined | null): boolean {
  return code === "PGRST202" || code === "42883" || code === "42P01" || code === "PGRST205";
}

export const BREAK_GLASS_NOT_READY_AR = "الوصول الطارئ قيد التفعيل.";

/**
 * Map a database refusal of the restricted_case_access_* functions to an HTTP
 * status and an Arabic sentence. The functions raise 42501 (who), 22023
 * (what), P0002 (missing).
 */
export function breakGlassErrorResponse(err: { code?: string | null; message?: string | null }): {
  status: number;
  error: string;
} {
  const code = err.code ?? "";
  const msg = err.message ?? "";
  if (isBreakGlassMissing(code)) return { status: 503, error: BREAK_GLASS_NOT_READY_AR };
  if (code === "P0002") return { status: 404, error: "غير موجود." };
  if (code === "42501") {
    if (/another super admin/.test(msg)) {
      return { status: 403, error: "الموافقة الثانية يجب أن تكون من مسؤول أعلى آخر غير مقدّم الطلب." };
    }
    if (/no live break-glass grant/.test(msg)) {
      return { status: 403, error: "لا يوجد وصول طارئ نافذ لك على هذه القضية." };
    }
    return { status: 403, error: "هذا الإجراء لمسؤول أعلى في المنصة فقط، بعد الدخول بالتحقق الثنائي إن كان مفعّلاً." };
  }
  if (code === "22023") {
    if (/not a restricted firm case|no longer a restricted/.test(msg)) {
      return { status: 409, error: "القضية ليست قضية مكتب مقيّدة." };
    }
    if (/written reason/.test(msg)) {
      return { status: 400, error: `اكتب سبباً واضحاً (من ${BREAK_GLASS_REASON_MIN} إلى ${BREAK_GLASS_REASON_MAX} حرف).` };
    }
    if (/duration/.test(msg)) {
      return { status: 400, error: `المدة من ${BREAK_GLASS_MIN_MINUTES} إلى ${BREAK_GLASS_MAX_MINUTES} دقيقة.` };
    }
    if (/lapsed/.test(msg)) return { status: 409, error: "سقط الطلب لعدم الموافقة عليه خلال ٢٤ ساعة." };
    if (/already decided/.test(msg)) return { status: 409, error: "بُتّ في هذا الطلب من قبل." };
    if (/not live/.test(msg)) return { status: 409, error: "الوصول غير نافذ." };
    if (/nobody to notify/.test(msg)) {
      return { status: 409, error: "لا يوجد في المكتب من يُبلَّغ بالوصول، فلا يُمنح." };
    }
    if (/no longer a super admin/.test(msg)) return { status: 409, error: "مقدّم الطلب لم يعد مسؤولاً أعلى." };
    return { status: 400, error: "الطلب غير صالح." };
  }
  return { status: 500, error: "تعذّر إتمام العملية، حاول مرة أخرى." };
}
