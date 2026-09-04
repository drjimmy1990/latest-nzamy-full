/**
 * _securityFields.ts — pure helpers for SecurityTab: password-change
 * validation, Supabase auth error → Arabic, and the session-timeout options.
 *
 * Split out of the component so these can be unit-tested directly (node
 * --test type-strips .ts, not .tsx — see _securityFields.test.ts).
 */

// Relative, not "@/..." — this file is imported directly by node --test
// (_securityFields.test.ts), which has no path-alias resolver; a bare "@/lib"
// specifier is only safe inside a `import type` (erased by type-stripping).
import { toArabicDigits } from "../../../../lib/services/arabicCount.ts";

// ── Password change ──────────────────────────────────────────────────
//
// There is no "current password" field. supabase.auth.updateUser({ password })
// does not check the old password — an input for it would collect a value
// nobody verifies, which is the same decorative-control problem this tab was
// fixed for. If a re-auth step is ever added, it has to go through
// supabase.auth.signInWithPassword first and this comment should move there.

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Client-side validation before calling Supabase. Returns the Arabic error to
 * show, or `null` when the pair is ready to submit.
 */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (!password) return "أدخل كلمة المرور الجديدة.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `كلمة المرور يجب ألا تقل عن ${toArabicDigits(MIN_PASSWORD_LENGTH)} أحرف.`;
  }
  if (!confirm) return "أعد كتابة كلمة المرور الجديدة في حقل التأكيد.";
  if (password !== confirm) return "كلمتا المرور غير متطابقتين.";
  return null;
}

/** Known Supabase GoTrue messages this screen is likely to see, in Arabic. */
const KNOWN_AUTH_ERRORS: Array<[RegExp, string]> = [
  [/should be at least/i, `كلمة المرور يجب ألا تقل عن ${toArabicDigits(MIN_PASSWORD_LENGTH)} أحرف.`],
  [/different from the old password/i, "كلمة المرور الجديدة يجب أن تختلف عن الحالية."],
  [/session.*missing|not authenticated|not.*logged in/i, "انتهت الجلسة — سجّل الدخول من جديد ثم أعد المحاولة."],
  [/rate limit|too many requests|after \d+ seconds/i, "عدد المحاولات كبير. الرجاء الانتظار قليلاً ثم إعادة المحاولة."],
  [/network/i, "تعذّر الاتصال بالخادم. تحقق من اتصالك وحاول مرة أخرى."],
];

const GENERIC_PASSWORD_ERROR = "تعذّر تحديث كلمة المرور. حاول مرة أخرى.";

/**
 * The Arabic message for a failed `supabase.auth.updateUser` call.
 *
 * Deliberate duplicate of the arabicSettingsError shape in NotificationsTab.tsx
 * (same reasoning documented there): a raw GoTrue message must never reach an
 * Arabic screen, so a known message is translated, an already-Arabic message is
 * passed through, and everything else falls back to one honest sentence.
 */
export function arabicAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  if (!raw) return GENERIC_PASSWORD_ERROR;
  for (const [pattern, message] of KNOWN_AUTH_ERRORS) {
    if (pattern.test(raw)) return message;
  }
  return /[؀-ۿ]/.test(raw) ? raw : GENERIC_PASSWORD_ERROR;
}

// ── Session timeout ──────────────────────────────────────────────────
//
// `user_settings.session_timeout_minutes` is a real column this tab can load
// and save, but nothing in the codebase reads it to actually end a session —
// no proxy.ts check, no auth-helper enforcement (verified by grep). It is a
// stored preference today, not an active control, and the label below says
// exactly that rather than promising an automatic sign-out.

/** The values this tab offers, in minutes. */
export const SESSION_TIMEOUT_OPTIONS_MINUTES = [15, 30, 60, 120, 240] as const;

/** «١٥ دقيقة» — all offered values are 11+, so the singular tamyiz form is correct for every one. */
export function sessionTimeoutLabel(minutes: number): string {
  return `${toArabicDigits(minutes)} دقيقة`;
}

/** The stored value, or the column's own default (60) when nothing was saved yet. */
export function normalizeSessionTimeout(value: number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value);
  return 60;
}
