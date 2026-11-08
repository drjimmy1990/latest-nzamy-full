/**
 * translateAuthError.ts — one translator for every Supabase Auth (GoTrue)
 * failure a form shows: sign-up, sign-in, password change/reset and OTP.
 *
 * Owner package 2026-11-06, BUG-09: the two registration pages mapped only
 * «User already registered» and printed every other GoTrue message raw, so a
 * visitor read "email rate limit exceeded" or "Signup is disabled" in English
 * on an Arabic screen. The Settings tab (arabicAuthError) and /reset-password
 * each had a smaller translator of their own; this file is the one they now
 * share.
 *
 * The rule: a raw English GoTrue message never reaches an Arabic screen.
 *   1. the CAPTCHA refusal (captcha.ts owns that wording);
 *   2. the network (a fetch that never reached GoTrue arrives as an
 *      AuthRetryableFetchError with status 0, inside `error`, not as a throw);
 *   3. GoTrue's machine `code` (stable across versions);
 *   4. HTTP 429;
 *   5. the message text, for older servers that send no code;
 *   6. a message that is already Arabic is passed through;
 *   7. a 5xx says the server failed, not the person;
 *   8. a fallback sentence per context — never the raw text.
 *
 * Sign-in keeps ONE message for every credential failure (CAP-06): GoTrue
 * answers invalid_credentials for a wrong password and an unknown account
 * alike, and the screen must not tell them apart. Only failures that say
 * nothing about whether the account exists get their own sentence there
 * (rate limit, network, an unconfirmed address — GoTrue checks the password
 * before it reports that one).
 *
 * Pure: relative ".ts" imports only, so `node --test` loads it
 * (translateAuthError.test.ts).
 */

import { toArabicDigits } from "../services/arabicCount.ts";
import { captchaMessage, isCaptchaAuthError } from "./captcha.ts";

/** The app's own minimum password length (the forms check it before GoTrue does). */
export const MIN_PASSWORD_LENGTH = 8;

export type AuthErrorContext = "signup" | "login" | "password" | "otp";

type MessageId =
  | "network"
  | "rateLimit"
  | "emailExists"
  | "phoneExists"
  | "tooShort"
  | "weakPassword"
  | "pwnedPassword"
  | "samePassword"
  | "sessionMissing"
  | "invalidEmail"
  | "invalidPhone"
  | "emailNotConfirmed"
  | "phoneNotConfirmed"
  | "signupDisabled"
  | "otpExpired"
  | "emailSendFailed"
  | "invalidCredentials"
  | "server";

const MIN_AR = toArabicDigits(MIN_PASSWORD_LENGTH);

const MESSAGES: Record<MessageId, { ar: string; en: string }> = {
  network: {
    ar: "تعذّر الاتصال بالخادم. تحقق من اتصالك وحاول مرة أخرى.",
    en: "Could not reach the server. Check your connection and try again.",
  },
  rateLimit: {
    ar: "عدد المحاولات كبير. الرجاء الانتظار قليلاً ثم إعادة المحاولة.",
    en: "Too many attempts. Wait a moment, then try again.",
  },
  emailExists: { ar: "البريد الإلكتروني مسجل بالفعل", en: "This email is already registered" },
  phoneExists: { ar: "رقم الجوال مسجل بالفعل", en: "This mobile number is already registered" },
  tooShort: {
    ar: `كلمة المرور يجب ألا تقل عن ${MIN_AR} أحرف.`,
    en: `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  },
  weakPassword: {
    ar: "كلمة المرور ضعيفة — استخدم مزيجاً من الأحرف والأرقام والرموز.",
    en: "The password is too weak — use a mix of letters, numbers and symbols.",
  },
  pwnedPassword: {
    ar: "كلمة المرور هذه ظهرت في تسريبات سابقة — اختر كلمة مرور أخرى.",
    en: "This password has appeared in a data breach — choose another one.",
  },
  samePassword: {
    ar: "كلمة المرور الجديدة يجب أن تختلف عن الحالية.",
    en: "The new password must differ from the current one.",
  },
  sessionMissing: {
    ar: "انتهت الجلسة — سجّل الدخول من جديد ثم أعد المحاولة.",
    en: "Your session has ended — sign in again, then retry.",
  },
  invalidEmail: { ar: "صيغة البريد الإلكتروني غير صحيحة.", en: "The email address is not valid." },
  invalidPhone: { ar: "رقم الجوال غير صحيح.", en: "The mobile number is not valid." },
  emailNotConfirmed: {
    ar: "لم يُؤكَّد بريدك الإلكتروني بعد — افتح رسالة التأكيد في بريدك ثم سجّل الدخول.",
    en: "Your email is not confirmed yet — open the confirmation message, then sign in.",
  },
  phoneNotConfirmed: {
    ar: "لم يُؤكَّد رقم جوالك بعد — أكمل التحقق من الرقم ثم سجّل الدخول.",
    en: "Your mobile number is not confirmed yet — finish verifying it, then sign in.",
  },
  signupDisabled: {
    ar: "التسجيل الجديد غير متاح حالياً. حاول لاحقاً أو تواصل مع الدعم.",
    en: "New sign-ups are not available right now. Try later or contact support.",
  },
  otpExpired: {
    ar: "انتهت صلاحية الرمز أو الرابط — اطلب رمزاً جديداً.",
    en: "The code or link has expired — request a new one.",
  },
  emailSendFailed: {
    ar: "تعذّر إرسال رسالة التأكيد إلى بريدك. تحقق من العنوان أو حاول بعد قليل.",
    en: "The confirmation email could not be sent. Check the address or try again shortly.",
  },
  invalidCredentials: { ar: "بيانات الدخول غير صحيحة", en: "Invalid credentials" },
  server: {
    ar: "حدث خطأ في الخادم. حاول مرة أخرى بعد قليل.",
    en: "A server error occurred. Please try again shortly.",
  },
};

const FALLBACK: Record<AuthErrorContext, { ar: string; en: string }> = {
  signup: { ar: "تعذّر إنشاء الحساب. حاول مرة أخرى بعد قليل.", en: "The account could not be created. Please try again shortly." },
  login: MESSAGES.invalidCredentials,
  password: { ar: "تعذّر تحديث كلمة المرور. حاول مرة أخرى.", en: "The password could not be updated. Please try again." },
  otp: { ar: "تعذّر التحقق من الرمز. حاول مرة أخرى.", en: "The code could not be verified. Please try again." },
};

/** GoTrue error codes (supabase/auth `ErrorCode`), by the sentence they deserve. */
const CODE_MESSAGES: Record<string, MessageId> = {
  user_already_exists: "emailExists",
  email_exists: "emailExists",
  phone_exists: "phoneExists",
  weak_password: "weakPassword",
  same_password: "samePassword",
  session_not_found: "sessionMissing",
  session_expired: "sessionMissing",
  email_address_invalid: "invalidEmail",
  email_not_confirmed: "emailNotConfirmed",
  phone_not_confirmed: "phoneNotConfirmed",
  signup_disabled: "signupDisabled",
  email_provider_disabled: "signupDisabled",
  phone_provider_disabled: "signupDisabled",
  otp_expired: "otpExpired",
  over_request_rate_limit: "rateLimit",
  over_email_send_rate_limit: "rateLimit",
  over_sms_send_rate_limit: "rateLimit",
  email_address_not_authorized: "emailSendFailed",
  invalid_credentials: "invalidCredentials",
  unexpected_failure: "server",
};

/** The same failures, by message text, for a server that sends no code. Order matters. */
const MESSAGE_PATTERNS: Array<[RegExp, MessageId]> = [
  [/already (been )?registered|already exists/i, "emailExists"],
  [/pwned|breach|leaked/i, "pwnedPassword"],
  [/should be at least|at least \d+ characters|password is too short/i, "tooShort"],
  [/weak password|password .*(weak|should contain|characters? (required|must))/i, "weakPassword"],
  [/different from the old password/i, "samePassword"],
  [/session.*missing|not authenticated|not.*logged in|jwt expired|refresh token/i, "sessionMissing"],
  [/rate limit|too many requests|after \d+ seconds/i, "rateLimit"],
  [/email not confirmed/i, "emailNotConfirmed"],
  [/phone not confirmed/i, "phoneNotConfirmed"],
  [/signups? (are |is )?(not allowed|disabled)/i, "signupDisabled"],
  [/expired|invalid.*(otp|token)|token.*invalid/i, "otpExpired"],
  [/unable to validate email|invalid.*email|email.*invalid/i, "invalidEmail"],
  [/invalid.*phone|phone.*invalid/i, "invalidPhone"],
  [/error sending|sending (confirmation|magic link|recovery)/i, "emailSendFailed"],
  [/invalid login credentials|invalid credentials/i, "invalidCredentials"],
  [/database error|internal server error/i, "server"],
  [/failed to fetch|fetch failed|networkerror|network|load failed/i, "network"],
];

interface AuthErrorLike {
  name?: unknown;
  code?: unknown;
  status?: unknown;
  message?: unknown;
  reasons?: unknown;
}

function asErrorLike(err: unknown): AuthErrorLike {
  return err && typeof err === "object" ? (err as AuthErrorLike) : {};
}

function isNetworkError(e: AuthErrorLike, raw: string): boolean {
  if (e.name === "AuthRetryableFetchError") return e.status === 0 || e.status === undefined;
  if (e.name === "TypeError" && /fetch|network|load failed/i.test(raw)) return true;
  return false;
}

/** weak_password carries `reasons` ("length" | "characters" | "pwned"). */
function weakPasswordId(e: AuthErrorLike): MessageId {
  const reasons = Array.isArray(e.reasons) ? e.reasons : [];
  if (reasons.includes("pwned")) return "pwnedPassword";
  if (reasons.includes("length")) return "tooShort";
  return "weakPassword";
}

/** The message id the error carries, or null when nothing in it is recognised. */
function messageIdFor(e: AuthErrorLike, raw: string): MessageId | null {
  if (isNetworkError(e, raw)) return "network";
  const code = typeof e.code === "string" ? e.code : "";
  if (code === "weak_password") return weakPasswordId(e);
  if (code === "validation_failed") {
    if (/phone/i.test(raw)) return "invalidPhone";
    if (/email/i.test(raw)) return "invalidEmail";
  }
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  if (e.status === 429) return "rateLimit";
  for (const [pattern, id] of MESSAGE_PATTERNS) {
    if (pattern.test(raw)) return id;
  }
  return null;
}

const pick = (m: { ar: string; en: string }, isAr: boolean) => (isAr ? m.ar : m.en);

/**
 * The sentence a form shows for a failed Supabase Auth call. Never the raw
 * GoTrue text unless that text is already Arabic (and only on an Arabic screen).
 */
export function translateAuthError(err: unknown, opts: { context: AuthErrorContext; isAr?: boolean }): string {
  const isAr = opts.isAr !== false;
  const { context } = opts;
  if (isCaptchaAuthError(err)) return captchaMessage("captchaRejected", isAr);

  const e = asErrorLike(err);
  const raw = typeof e.message === "string" ? e.message : "";
  const id = messageIdFor(e, raw);

  if (context === "login") {
    // CAP-06: only failures that say nothing about the account's existence.
    if (id === "network" || id === "rateLimit" || id === "emailNotConfirmed" || id === "phoneNotConfirmed") {
      return pick(MESSAGES[id], isAr);
    }
    return pick(MESSAGES.invalidCredentials, isAr);
  }

  // invalid_credentials outside sign-in (e.g. a re-auth) is still a credential failure.
  if (id) return pick(MESSAGES[id], isAr);
  if (isAr && /[؀-ۿ]/.test(raw)) return raw;
  if (typeof e.status === "number" && e.status >= 500) return pick(MESSAGES.server, isAr);
  return pick(FALLBACK[context], isAr);
}
