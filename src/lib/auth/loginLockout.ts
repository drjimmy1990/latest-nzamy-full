/**
 * loginLockout.ts — the per-account password lockout (owner file 10 ب23,
 * batch l12-access), the pure half. The reads and writes are SQL
 * (supabase/migrations/20261202_20_access_login_lockout_test_kinds.sql); the
 * route is POST /api/v1/auth/sign-in.
 *
 *   - The typed identifier (an e-mail, lower-cased; or a Saudi mobile in E.164)
 *     is hashed into the counter key, so the table never holds an address.
 *   - The counter runs whether or not an account exists: an unknown address
 *     locks after the same number of tries with the same message, so the
 *     lock says nothing about existence (CAP-06).
 *   - Only a credential failure counts — not a captcha refusal, a network
 *     error, an unconfirmed address or a suspension.
 *
 * Pure, no imports: the login page (a client component) imports the
 * messages, so the hashing lives in ./loginLockoutKey.ts (node:crypto).
 */

export const LOGIN_LOCKED_CODE = "login_locked";

/** The refusal while locked (the same words as the GoTrue hook's). */
export const LOGIN_LOCKED_AR =
  "أُوقف الدخول إلى هذا الحساب مؤقتاً بعد محاولات دخول غير صحيحة متتالية. حاول لاحقاً، أو أعد تعيين كلمة المرور.";
export const LOGIN_LOCKED_EN =
  "Sign-in to this account is paused after several wrong attempts in a row. Try again later, or reset your password.";

/** A fragment of the hook's message, to recognise its refusal coming back through GoTrue. */
export const LOGIN_LOCKED_MARKER = "أُوقف الدخول إلى هذا الحساب مؤقتاً";

export type LoginIdentifier = { kind: "email"; value: string } | { kind: "phone"; value: string };

const EMAIL_MAX = 320;
const E164_SA = /^\+9665\d{8}$/;

/** The identifier the counter keys on, or null for a body that names none. */
export function loginIdentifier(body: { email?: unknown; phone?: unknown }): LoginIdentifier | null {
  if (typeof body.email === "string") {
    const v = body.email.trim().toLowerCase();
    if (v.length >= 3 && v.length <= EMAIL_MAX && v.includes("@")) return { kind: "email", value: v };
    return null;
  }
  if (typeof body.phone === "string") {
    const v = body.phone.trim();
    if (E164_SA.test(v)) return { kind: "phone", value: v };
  }
  return null;
}

/** Did GoTrue refuse the PASSWORD (the one failure that counts)? */
export function isCredentialFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, status, message } = error as { code?: unknown; status?: unknown; message?: unknown };
  if (typeof code === "string" && code) return code === "invalid_credentials";
  return status === 400 && typeof message === "string" && /invalid login credentials/i.test(message);
}

/** Did the GoTrue hook (20261202_20) refuse a locked account? */
export function isHookLockRefusal(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { message } = error as { message?: unknown };
  return typeof message === "string" && message.includes(LOGIN_LOCKED_MARKER);
}

/** The «حسابك أُوقف مؤقتاً» e-mail, sent once per lock to the account's own address. */
export function loginLockedEmail(lockMinutesText: string): { subject: string; text: string } {
  return {
    subject: "تنبيه أمني: أُوقف الدخول إلى حسابك في منصة نظامي مؤقتاً",
    text: [
      "السلام عليكم،",
      "",
      `جرت عدة محاولات للدخول إلى حسابك في منصة نظامي بكلمة مرور غير صحيحة، فأوقفنا الدخول إليه ${lockMinutesText} حمايةً له.`,
      "إن كانت المحاولات منك فانتظر ثم أعد المحاولة، أو أعد تعيين كلمة المرور من صفحة الدخول.",
      "وإن لم تكن منك فننصحك بتغيير كلمة المرور فور انتهاء الإيقاف، وتفعيل التحقق بخطوتين إن كان متاحاً لحسابك.",
      "",
      "فريق نظامي",
    ].join("\n"),
  };
}

/** The validated sign-in body, or the reason it is refused (400). */
export function parseSignInBody(raw: unknown):
  | { ok: true; id: LoginIdentifier; password: string; captchaToken: string | undefined }
  | { ok: false } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false };
  const b = raw as { email?: unknown; phone?: unknown; password?: unknown; captchaToken?: unknown };
  const id = loginIdentifier(b);
  if (!id) return { ok: false };
  if (typeof b.password !== "string" || b.password.length === 0 || b.password.length > 1024) return { ok: false };
  const captchaToken = typeof b.captchaToken === "string" && b.captchaToken.length > 0 && b.captchaToken.length <= 4096 ? b.captchaToken : undefined;
  return { ok: true, id, password: b.password, captchaToken };
}

/** The setting platform_settings 'auth_login_lockout' (20261202_20). */
export const LOGIN_LOCKOUT_SETTING = "auth_login_lockout";
const LOCKOUT_FIELDS: Record<string, [number, number]> = {
  max_failures: [1, 100],
  window_minutes: [1, 1440],
  lock_minutes: [1, 1440],
};

/** The admin settings validator: {max_failures 1..100, window_minutes 1..1440, lock_minutes 1..1440}, nothing else. */
export function loginLockoutSettingIssue(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 'قيمة auth_login_lockout يجب أن تكون كائناً بالشكل {"max_failures":5,"window_minutes":15,"lock_minutes":15}';
  }
  for (const [k, v] of Object.entries(value)) {
    const range = LOCKOUT_FIELDS[k];
    if (!range) return `حقل غير معروف في auth_login_lockout: ${k}`;
    if (typeof v !== "number" || !Number.isInteger(v) || v < range[0] || v > range[1]) {
      return `قيمة ${k} في auth_login_lockout عدد صحيح بين ${range[0]} و${range[1]}`;
    }
  }
  return null;
}
