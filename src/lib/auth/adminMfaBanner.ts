/**
 * adminMfaBanner.ts — when the admin console shows that two-step sign-in is
 * NOT enforced (batch l14; owner package of 23 Nov, 00 §٢-٣ and 11 §٦:
 * «المصادقة الثنائية للأدمن مبنية، لكن الإلزام بمتغير ADMIN_MFA_ENFORCE=required
 * وهو افتراضيًا غير مُلزِم»). The switch itself is unchanged (staffMfa.ts,
 * server env); this only makes its OFF state impossible to miss: a banner on
 * the console's home and on «الأمان والحماية», read from
 * GET /api/v1/auth/mfa/status.
 *
 * Pure, no imports: `node --test` loads it.
 */

export const ADMIN_MFA_OFF_TITLE_AR = "إلزام التحقق بخطوتين لحسابات الإدارة متوقف";
export const ADMIN_MFA_OFF_BODY_AR =
  "أي حساب إدارة لم يربط تطبيق مصادقة يدخل إلى اللوحة بكلمة المرور وحدها. " +
  "يُشغَّل الإلزام من إعداد الخادم ADMIN_MFA_ENFORCE=required، بعد أن يفعّل كل مسؤول التحقق بخطوتين لحسابه.";
export const ADMIN_MFA_PAGE_HREF = "/dashboard/admin/security?tab=two_factor";

/**
 * The status body → whether the banner shows: only for a staff caller, and
 * only when the server says the mode is not "required". An unreadable body
 * shows nothing (no guess either way).
 */
export function adminMfaOffBannerShown(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as { isStaff?: unknown; mode?: unknown };
  if (b.isStaff !== true) return false;
  return b.mode === "rollout";
}
