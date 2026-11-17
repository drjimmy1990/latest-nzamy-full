/**
 * One-time codes for the lawyer signup (decision ٢١). Pure apart from
 * node:crypto.
 *
 * Only a keyed hash of a code is ever stored (public.lawyer_otp_challenges,
 * 20261124_70): HMAC-SHA256 with a server pepper (LAWYER_OTP_PEPPER). A bare
 * sha256 of six digits would be reversed in a millisecond by anyone who could
 * read the table; with the pepper it cannot be. No pepper → no code is issued
 * (the flow falls back to «سجّلنا بياناتك وسنتواصل معك»).
 *
 * The hash is bound to the user and the purpose, so a code issued for the
 * e-mail check can never pass the identity check, or another account's.
 */

import { createHmac, randomInt } from "node:crypto";

export type OtpPurpose = "identity" | "email";
export type OtpChannel = "whatsapp" | "sms" | "email";

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
/** Server-side cooldown before the same channel may send again. */
export const OTP_RESEND_SECONDS = 60;
export const PEPPER_MIN_LENGTH = 32;

/** A usable pepper or null (too short counts as none). */
export function otpPepper(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  return s.length >= PEPPER_MIN_LENGTH ? s : null;
}

/** A uniformly random six-digit code, leading zeros kept. */
export function generateOtpCode(rand: (max: number) => number = (max) => randomInt(0, max)): string {
  return String(rand(10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

/** Six ASCII digits from what the user typed (Arabic-Indic digits and spaces accepted), else null. */
export function cleanOtpInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[\s-]/g, "");
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(s) ? s : null;
}

export function hashOtpCode(pepper: string, userId: string, purpose: OtpPurpose, code: string): string {
  return createHmac("sha256", pepper).update(`otp:v1:${userId}:${purpose}:${code}`).digest("hex");
}

/**
 * The per-target key for the cross-account rate limit (many accounts
 * pestering one real lawyer's phone). Keyed too, so the table does not hold a
 * guessable hash of a phone number or an address.
 */
export function hashOtpTarget(pepper: string, target: string): string {
  return createHmac("sha256", pepper).update(`target:v1:${target.trim().toLowerCase()}`).digest("hex");
}

export function otpMessageAr(code: string): string {
  return `رمز التحقق في منصة نظامي: ${code}\nصالح ${OTP_TTL_MINUTES} دقائق. لا تشاركه مع أحد.`;
}
