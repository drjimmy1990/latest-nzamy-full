/**
 * phoneSignIn.ts — signing in with a Saudi mobile and a password (batch l18,
 * LIVE-05), the pure half. The route is POST /api/v1/auth/sign-in.
 *
 * Every account signs up by e-mail, so GoTrue holds no phone for anyone; the
 * confirmed mobile lives in profiles. The route therefore asks the database
 * which account has the number confirmed (public.phone_sign_in_target,
 * 20261208_20 — exactly one account, or none) and runs the ordinary e-mail +
 * password sign-in for that account's address. The lockout, the security
 * check (Turnstile, verified by GoTrue), the suspension, the staff two-step
 * and the one refusal message are the e-mail path's own.
 *
 * What must not leak — whether a number belongs to an account:
 *   - an unknown or shared number still goes to GoTrue, with the visitor's
 *     security-check token and a throw-away address nobody can own (a fresh
 *     random id under the reserved «.invalid» domain). So a bad token is
 *     refused as a bad token whatever the number, and the answer takes a
 *     GoTrue round trip either way;
 *   - every other refusal on the phone path (wrong password, an unconfirmed
 *     address, a ban, anything) becomes the one wrong-password answer, and is
 *     counted by the lockout like a wrong password;
 *   - a sign-in that lands on any account but the one the number named is
 *     undone and refused.
 * Passed through unchanged, as on the e-mail path: the security-check
 * refusal, a rate limit, a network failure and the lockout hook's refusal —
 * none of them depends on the number.
 *
 * Pure, relative ".ts" imports only, so `node --test` loads it.
 */
import { isCaptchaAuthError } from "./captcha.ts";
import { isHookLockRefusal } from "./loginLockout.ts";

/** The account a confirmed mobile names (from public.phone_sign_in_target). */
export type PhoneSignInTarget = { userId: string; email: string };

/** The reserved domain of the throw-away address (RFC 2606: «.invalid» never resolves or registers). */
export const PHONE_SIGN_IN_SINK_DOMAIN = "phone-sign-in.invalid";

/** A throw-away address for a number with no single account: a fresh random id each time. */
export function phoneSignInSinkAddress(randomId: string): string {
  const id = String(randomId).toLowerCase().replace(/[^0-9a-f-]/g, "");
  if (id.length < 32) throw new Error("phoneSignInSinkAddress: a random id is required");
  return `${id}@${PHONE_SIGN_IN_SINK_DOMAIN}`;
}

/** The e-mail path's wrong-password refusal, exactly as GoTrue words it. */
export const UNIFORM_CREDENTIALS_REFUSAL = Object.freeze({
  message: "Invalid login credentials",
  code: "invalid_credentials",
  status: 400,
});

/** The database answer → the account, or null (no account, shared, malformed, any error). */
export function phoneTargetFromRpc(data: unknown): PhoneSignInTarget | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as { ok?: unknown; user_id?: unknown; email?: unknown };
  if (d.ok !== true || typeof d.user_id !== "string" || typeof d.email !== "string") return null;
  const email = d.email.trim().toLowerCase();
  if (!d.user_id || !email.includes("@")) return null;
  return { userId: d.user_id, email };
}

function passesThrough(error: unknown): boolean {
  if (isHookLockRefusal(error) || isCaptchaAuthError(error)) return true;
  const e = error as { name?: unknown; status?: unknown; code?: unknown };
  if (e.status === 429 || e.code === "over_request_rate_limit") return true;
  // The network: GoTrue was never reached, so nothing about the number is in it.
  if (e.name === "AuthRetryableFetchError" && (e.status === 0 || e.status === undefined)) return true;
  return false;
}

export type PhoneSignInVerdict =
  | { ok: true }
  /** `undo`: a session was made and must be ended before answering. */
  | { ok: false; error: unknown; undo: boolean };

/**
 * GoTrue's answer for the phone path → signed in, or the refusal to give.
 * `target` is the account the number named (null: the throw-away address
 * was used); `signedInUserId` is the user GoTrue signed in, if any.
 */
export function phoneSignInVerdict(input: {
  target: PhoneSignInTarget | null;
  error: unknown;
  signedInUserId: string | null;
}): PhoneSignInVerdict {
  const { target, error, signedInUserId } = input;
  if (error) {
    return passesThrough(error)
      ? { ok: false, error, undo: false }
      : { ok: false, error: { ...UNIFORM_CREDENTIALS_REFUSAL }, undo: false };
  }
  if (!signedInUserId) return { ok: false, error: { ...UNIFORM_CREDENTIALS_REFUSAL }, undo: false };
  if (!target || signedInUserId !== target.userId) {
    return { ok: false, error: { ...UNIFORM_CREDENTIALS_REFUSAL }, undo: true };
  }
  return { ok: true };
}
