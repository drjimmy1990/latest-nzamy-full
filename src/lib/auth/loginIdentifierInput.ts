/**
 * loginIdentifierInput.ts — the one «البريد الإلكتروني أو رقم الجوال» field
 * (batch l18, LIVE-16 / LIVE-06). Pure and client-safe: /login and
 * /forgot-password import it, and so do the servers' tests.
 *
 *   - Anything with an «@» is an e-mail (trimmed, lower-cased).
 *   - Anything else must be a Saudi mobile (05…, 5…, 9665…, +9665…, 009665…,
 *     Arabic-Indic digits too) and becomes E.164 (+9665XXXXXXXX).
 *   - A number from outside the Kingdom, letters without an «@», a landline
 *     or a 920 number are refused with a clear sentence — never sent.
 *
 * Which account a mobile belongs to is decided on the server only
 * (public.phone_sign_in_target, 20261208_20); this file never guesses.
 */
import { normalizeSaudiMobile, toAsciiDigits } from "../services/saudiMobile.ts";

export type LoginInput =
  | { ok: true; kind: "email"; value: string }
  | { ok: true; kind: "phone"; value: string }
  | { ok: false; reason: "empty" | "email" | "not_saudi_mobile" | "neither" };

/** The field's label, placeholder and hint. */
export const LOGIN_ID_LABEL_AR = "البريد الإلكتروني أو رقم الجوال";
export const LOGIN_ID_LABEL_EN = "Email or mobile number";
export const LOGIN_ID_PLACEHOLDER = "example@email.com · 05xxxxxxxx";
export const LOGIN_ID_HINT_AR = "إن استعملت رقم الجوال، فيُقبل الرقم السعودي المؤكَّد في حسابك فقط.";
export const LOGIN_ID_HINT_EN = "If you use your mobile, only the Saudi number confirmed on your account is accepted.";

const MESSAGES = {
  empty: {
    ar: "أدخل بريدك الإلكتروني أو رقم جوالك.",
    en: "Enter your email or mobile number.",
  },
  email: {
    ar: "أدخل بريداً إلكترونياً صحيحاً.",
    en: "Enter a valid email address.",
  },
  not_saudi_mobile: {
    ar: "أدخل رقم جوال سعودياً صحيحاً يبدأ بـ 05، مثل 0512345678. لا تُقبل أرقام من خارج المملكة.",
    en: "Enter a valid Saudi mobile starting with 05, e.g. 0512345678. Numbers from outside Saudi Arabia are not accepted.",
  },
  neither: {
    ar: "أدخل بريداً إلكترونياً، أو رقم جوال سعودياً يبدأ بـ 05.",
    en: "Enter an email address, or a Saudi mobile starting with 05.",
  },
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;
/** Digits (any script), spaces and the separators people type inside a number. */
const NUMBERISH_RE = /^[+0-9٠-٩۰-۹\s()._/ ​‎‏-]+$/;

/** What the one field holds: an e-mail, a Saudi mobile in E.164, or why it is neither. */
export function classifyLoginInput(raw: unknown): LoginInput {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };
  const s = raw.trim();
  if (s === "") return { ok: false, reason: "empty" };
  if (s.includes("@")) {
    const v = s.toLowerCase();
    return v.length <= EMAIL_MAX && EMAIL_RE.test(v) ? { ok: true, kind: "email", value: v } : { ok: false, reason: "email" };
  }
  if (!NUMBERISH_RE.test(s)) return { ok: false, reason: "neither" };
  const mobile = normalizeSaudiMobile(s);
  return mobile.ok ? { ok: true, kind: "phone", value: mobile.e164 } : { ok: false, reason: "not_saudi_mobile" };
}

/** The sentence for a refused value. */
export function loginInputMessage(input: LoginInput, isAr: boolean): string {
  if (input.ok) return "";
  const m = MESSAGES[input.reason];
  return isAr ? m.ar : m.en;
}

/**
 * /forgot-password's ONE button (batch l19, POST-L18-06): the typed value
 * decides. A Saudi mobile while the WhatsApp choice is on → a code on
 * WhatsApp; an e-mail → the e-mail link (with the choice off, the field takes
 * an e-mail only, as before); anything else → why (loginInputMessage).
 */
export type RecoveryChannel =
  | { ok: true; via: "email"; email: string }
  | { ok: true; via: "whatsapp"; phone: string }
  | { ok: false; input: LoginInput };

export function recoveryChannel(raw: unknown, whatsappOn: boolean): RecoveryChannel {
  const typed = classifyLoginInput(raw);
  if (typed.ok && typed.kind === "email") return { ok: true, via: "email", email: typed.value };
  if (!whatsappOn) return { ok: false, input: typed.ok || typed.reason !== "empty" ? { ok: false, reason: "email" } : typed };
  if (typed.ok) return { ok: true, via: "whatsapp", phone: typed.value };
  return { ok: false, input: typed };
}

/** Does the text typed so far look like a number (to pick the field's icon)? Display only. */
export function looksLikePhoneInput(raw: string): boolean {
  const s = toAsciiDigits(raw).trim();
  return s !== "" && !s.includes("@") && /^[+0-9\s()-]+$/.test(s);
}
