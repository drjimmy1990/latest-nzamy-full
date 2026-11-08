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
import { MIN_PASSWORD_LENGTH, translateAuthError } from "../../../../lib/auth/translateAuthError.ts";

// ── Password change ──────────────────────────────────────────────────
//
// There is no "current password" field. supabase.auth.updateUser({ password })
// does not check the old password — an input for it would collect a value
// nobody verifies, which is the same decorative-control problem this tab was
// fixed for. If a re-auth step is ever added, it has to go through
// supabase.auth.signInWithPassword first and this comment should move there.

// One constant for the whole app; it lives with the shared auth-error translator.
export { MIN_PASSWORD_LENGTH };

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

/**
 * The Arabic message for a failed `supabase.auth.updateUser` call.
 *
 * A raw GoTrue message must never reach an Arabic screen, so a known message
 * is translated, an already-Arabic message is passed through, and everything
 * else falls back to one honest sentence. The table now lives in the shared
 * translator (src/lib/auth/translateAuthError.ts, BUG-09), which the
 * registration, sign-in and reset screens use too.
 */
export function arabicAuthError(err: unknown): string {
  return translateAuthError(err, { context: "password", isAr: true });
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
