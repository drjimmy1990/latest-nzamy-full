/**
 * «نسيت كلمة المرور» by a WhatsApp code (batch l17) — the pure part shared by
 * the routes, /forgot-password and /login. No imports, no I/O: the browser,
 * the server and `node --test` all load it.
 *
 * The flow:
 *   1. GET  /api/v1/auth/password-reset/whatsapp/status → { whatsapp } — the
 *      choice is offered only while WhatsApp sending is configured AND the
 *      sign-up WhatsApp switch is on. Otherwise the page is the e-mail page.
 *   2. POST …/start  { email, turnstileToken } → always the same 200 answer
 *      (WHATSAPP_START_SENT_AR) once the address is well formed and the
 *      security check passed; the code goes out, if at all, after the answer.
 *   3. POST …/verify { email, code, password, confirm } → 200 { ok } or the
 *      one uniform refusal (WHATSAPP_CODE_INVALID_AR). The password is set on
 *      the server; no session is created — the person signs in on /login.
 */

export const PASSWORD_RESET_WHATSAPP_API = "/api/v1/auth/password-reset/whatsapp";

/** Rule 1 of the brief: the same words whatever the account. */
export const WHATSAPP_START_SENT_AR =
  "إن كان للحساب جوال مؤكَّد فسيصله رمز عبر واتساب خلال دقيقة. إن لم يصلك، فاستعمل رابط البريد.";
export const WHATSAPP_START_SENT_EN =
  "If the account has a confirmed mobile, a code will reach it on WhatsApp within a minute. If it does not arrive, use the email link.";

/** Wrong, expired, used, locked — or no such account: one answer. */
export const WHATSAPP_CODE_INVALID_AR = "الرمز غير صحيح أو انتهت صلاحيته";
export const WHATSAPP_CODE_INVALID_EN = "The code is incorrect or has expired";
export const WHATSAPP_CODE_INVALID_CODE = "invalid_code";

export const WHATSAPP_UNAVAILABLE_AR = "الخدمة غير متاحة مؤقتًا، حاول بعد قليل.";
export const WHATSAPP_INVALID_EMAIL_AR = "أدخل بريداً إلكترونياً صحيحاً.";
export const WHATSAPP_CAPTCHA_AR = "أكمل التحقق الأمني ثم أعد المحاولة.";
export const WHATSAPP_TOO_MANY_AR = "محاولات كثيرة — حاول بعد قليل.";
export const WHATSAPP_PASSWORD_NOT_SET_AR =
  "تعذّر حفظ كلمة المرور الجديدة، وقد استُعمل الرمز. اطلب رمزًا جديدًا وأعد المحاولة.";

/**
 * The e-mail to the account's own address after a WhatsApp reset (review S2).
 * No number and no code in it — only what happened and the e-mail link.
 */
export const PASSWORD_CHANGED_MAIL_SUBJECT_AR = "تم تغيير كلمة مرور حسابك في نظامي";
export const PASSWORD_CHANGED_MAIL_BODY_AR =
  "تم تغيير كلمة مرور حسابك في نظامي عبر رمز واتساب. إن لم تكن أنت، فاطلب رابط إعادة التعيين على بريدك فورًا وتواصل معنا.";
export const PASSWORD_CHANGED_MAIL_ACTION_AR = "طلب رابط إعادة التعيين";
export const PASSWORD_CHANGED_MAIL_TAG = "password_reset_whatsapp";

/** /login reads these: the success line and the address to prefill. */
export const LOGIN_RESET_REASON = "password_reset";
export const LOGIN_RESET_DONE_AR = "تم تغيير كلمة المرور، ادخل بكلمتك الجديدة";
export const LOGIN_RESET_DONE_EN = "Your password has been changed. Sign in with your new password.";
/**
 * sessionStorage key for the address to prefill on /login — kept out of the
 * URL so the e-mail never lands in a history entry, a log or a Referer.
 */
export const LOGIN_PREFILL_EMAIL_KEY = "nzamy:login-prefill-email";
export const LOGIN_AFTER_RESET_PATH = `/login?reason=${LOGIN_RESET_REASON}`;

/**
 * Whether the WhatsApp choice is offered: the sign-up switch is on, Zernio
 * is configured and the code pepper is set. Any one missing → e-mail only.
 */
export function whatsappResetAvailable(input: { switchOn: boolean; zernioReady: boolean; pepperReady: boolean }): boolean {
  return input.switchOn === true && input.zernioReady === true && input.pepperReady === true;
}

/** The status answer, read defensively by the page: anything but `true` is off. */
export function whatsappFromStatus(body: unknown): boolean {
  return !!body && typeof body === "object" && (body as { whatsapp?: unknown }).whatsapp === true;
}

/** The trimmed, lower-cased address the server keys everything on, or null when malformed. */
export function normalizeResetEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}
