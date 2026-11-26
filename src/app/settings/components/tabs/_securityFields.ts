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
 * GoTrue stores a bcrypt hash, and bcrypt reads at most 72 bytes: a longer
 * password is refused by the auth server. Counted in UTF-8 bytes, so an
 * Arabic letter (2 bytes) counts twice.
 */
export const MAX_PASSWORD_BYTES = 72;
export const PASSWORD_TOO_LONG_AR = "كلمة المرور طويلة جدًا. اختر كلمة أقصر.";

/** The UTF-8 length of a password (TextEncoder: the browser and Node alike). */
export function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length;
}

/**
 * Client-side validation before calling Supabase. Returns the Arabic error to
 * show, or `null` when the pair is ready to submit.
 */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (!password) return "أدخل كلمة المرور الجديدة.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `كلمة المرور يجب ألا تقل عن ${toArabicDigits(MIN_PASSWORD_LENGTH)} أحرف.`;
  }
  if (passwordByteLength(password) > MAX_PASSWORD_BYTES) return PASSWORD_TOO_LONG_AR;
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
// `user_settings.session_timeout_minutes` is enforced since l11 (T5): the
// root layout's SessionIdleGuard (src/hooks/useSessionIdleGuard.ts) signs an
// idle session out after this many minutes, with a warning first. It applies
// once the user has SAVED a choice here (the save also writes
// preferences.sessionTimeoutChosen — src/lib/auth/idleSignOut.ts); until then
// nothing signs a session out, as before.

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
