/**
 * «نسيت كلمة المرور» by a WhatsApp code (batch l17) — the core of
 * POST /api/v1/auth/password-reset/whatsapp/{start,verify}.
 *
 * Every outside effect is injected (ResetDeps), so `node --test` runs the
 * real decisions with fakes (whatsappReset.test.ts). The server half that
 * builds the deps from the service client is ./whatsappResetServer.ts.
 * Relative ".ts" imports only, for the same reason.
 *
 * What the code may and may not say:
 *   - start answers the SAME 200 whenever the address is well formed, the
 *     channel is configured and the security check passed — whether or not
 *     the address has an account, a confirmed mobile, is staff, suspended or
 *     frozen, or hit a limit. The lookup and the send run AFTER the answer
 *     (`background`, handed to next/server after()), so the time of the
 *     answer does not depend on the account either.
 *   - verify answers one refusal (WHATSAPP_CODE_INVALID_AR) for a wrong,
 *     expired, used or locked code and for an address with no account, and
 *     every refusal is held to the same minimum time.
 *   - the code, the number and the address are never logged or returned.
 *   - batch l18 (LIVE-06): the person may type the confirmed Saudi mobile
 *     instead of the e-mail ({ phone } in place of { email }). The account is
 *     the ONE account that has that number confirmed (public.
 *     pw_reset_target_by_phone, 20261208_20, which then applies every rule of
 *     the e-mail lookup); a number shared by two accounts gets nothing. The
 *     answers stay the same words, and the limits key on the E.164 number.
 *   - verify sets the password with the auth admin API and ends the account's
 *     sessions; it never signs anyone in.
 */

import {
  cleanOtpInput,
  generateOtpCode,
  hashOtpCode,
  hashOtpTarget,
  otpPepper,
} from "../lawyerSignup/otpCode.ts";
import { maskSaudiMobile } from "../phoneOtp/phoneOtpRules.ts";
import { normalizeSaudiMobile } from "../services/saudiMobile.ts";
import { isSuspendedUser } from "../auth/accountSuspension.ts";
import { freezeStateFromUser } from "../auth/accountFreeze.ts";
import { validateNewPassword } from "../../app/settings/components/tabs/_securityFields.ts";
import {
  normalizeResetEmail,
  WHATSAPP_CAPTCHA_AR,
  WHATSAPP_CODE_INVALID_AR,
  WHATSAPP_CODE_INVALID_CODE,
  WHATSAPP_INVALID_EMAIL_AR,
  WHATSAPP_INVALID_PHONE_AR,
  WHATSAPP_PASSWORD_NOT_SET_AR,
  WHATSAPP_START_SENT_AR,
  WHATSAPP_TOO_MANY_AR,
  WHATSAPP_UNAVAILABLE_AR,
} from "./passwordResetRules.ts";

/**
 * An account that may receive a reset code: its id, its confirmed mobile in
 * E.164 (hashed and sent to) and the value exactly as profiles.phone holds it
 * (what pw_reset_verify compares; the same string on every row that passes
 * the E.164 check).
 */
export type ResetTarget = { userId: string; phone: string; storedPhone?: string };

export type ResetDeps = {
  /** The code pepper (LAWYER_OTP_PEPPER), raw — checked here with otpPepper. */
  pepperRaw: string | undefined;
  /** Is the WhatsApp choice on right now (switch on + Zernio configured)? */
  available: () => Promise<boolean>;
  /** In-process limiter: true = allowed. Keys never hold more than the normalised address. */
  allow: (key: string, limit: number, windowMs: number) => boolean;
  /** Cloudflare Turnstile for start: "ok" | "failed" | "misconfigured". */
  captcha: () => Promise<"ok" | "failed" | "misconfigured">;
  /** null for every address that must not receive a code (any reason). */
  lookup: (email: string) => Promise<ResetTarget | null>;
  /** The same, found by a confirmed Saudi mobile (E.164): null unless exactly one account has it confirmed and may reset. */
  lookupByPhone: (e164: string) => Promise<ResetTarget | null>;
  issue: (args: { userId: string; targetHash: string; hint: string | null; codeHash: string }) => Promise<{ id: string } | null>;
  send: (e164: string, code: string) => Promise<"sent" | "unavailable" | "failed">;
  markDelivery: (id: string, sent: boolean) => Promise<void>;
  /** pw_reset_verify: true only on a hit (the database consumes the codes). */
  verify: (args: { userId: string; targetHash: string; phone: string; codeHash: string }) => Promise<boolean>;
  setPassword: (userId: string, password: string) => Promise<{ ok: true } | { ok: false; code: string }>;
  /** Ends every session of the account; the number ended, or null when it failed. */
  revokeSessions: (userId: string) => Promise<number | null>;
  audit: (row: { userId: string; sessionsEnded: number | null }) => Promise<void>;
  /** The «your password was changed» e-mail to the account's own address. Best effort. */
  notify: (userId: string) => Promise<"sent" | "sunk" | "unavailable" | "failed" | "no_address">;
  log: (message: string) => void;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

export type RouteAnswer = { status: number; body: Record<string, unknown> };
export type StartAnswer = RouteAnswer & { background: (() => Promise<void>) | null };
export type VerifyAnswer = RouteAnswer & { background?: (() => Promise<void>) | null };

/**
 * Per-process limits keyed on the normalised address, on top of the proxy's
 * per-visitor / per-IP bucket and the database's per-account limits.
 */
export const START_PER_EMAIL = { limit: 5, windowMs: 10 * 60_000 };
export const VERIFY_PER_EMAIL = { limit: 10, windowMs: 10 * 60_000 };
/** Every verify refusal takes at least this long, found account or not. */
export const VERIFY_FAILURE_FLOOR_MS = 600;

const unavailable = (): RouteAnswer => ({
  status: 503,
  body: { ok: false, code: "unavailable", error: WHATSAPP_UNAVAILABLE_AR },
});

/** The one answer start gives once the request itself is acceptable. */
export const START_UNIFORM_BODY = Object.freeze({ ok: true, message: WHATSAPP_START_SENT_AR });

/**
 * The app's half of "may this account receive a reset code?" — the GoTrue
 * user (auth.admin.getUserById) is neither suspended (the ban or the
 * app_metadata copy) nor frozen for deletion. The database half (staff,
 * confirmed mobile, banned, deleted) is public.pw_reset_target.
 */
export function authUserMayReset(user: unknown): boolean {
  if (!user || typeof user !== "object") return false;
  return !isSuspendedUser(user) && !freezeStateFromUser(user).frozen;
}

/** What the person typed: an e-mail or a Saudi mobile (E.164). */
export type ResetIdentifier = { kind: "email"; value: string } | { kind: "phone"; value: string };

/**
 * The identifier of a start / verify body, or the 400 to answer. A body with
 * a `phone` string is the mobile path; anything else is the e-mail path as
 * before (l17).
 */
export function resetIdentifierFrom(input: { email?: unknown; phone?: unknown }):
  | { ok: true; id: ResetIdentifier }
  | { ok: false; answer: RouteAnswer } {
  if (typeof input.phone === "string" && input.email === undefined) {
    const mobile = normalizeSaudiMobile(input.phone);
    if (!mobile.ok) return { ok: false, answer: { status: 400, body: { ok: false, code: "invalid_phone", error: WHATSAPP_INVALID_PHONE_AR } } };
    return { ok: true, id: { kind: "phone", value: mobile.e164 } };
  }
  const email = normalizeResetEmail(input.email);
  if (!email) return { ok: false, answer: { status: 400, body: { ok: false, code: "invalid_email", error: WHATSAPP_INVALID_EMAIL_AR } } };
  return { ok: true, id: { kind: "email", value: email } };
}

/** The in-process limiter key: the e-mail as before, or the E.164 number. */
function limitKey(step: "start" | "verify", id: ResetIdentifier): string {
  return id.kind === "email" ? `pwreset:${step}:${id.value}` : `pwreset:${step}:phone:${id.value}`;
}

function lookupFor(deps: ResetDeps, id: ResetIdentifier): Promise<ResetTarget | null> {
  return id.kind === "email" ? deps.lookup(id.value) : deps.lookupByPhone(id.value);
}

function errorName(err: unknown): string {
  return err instanceof Error ? err.name || "Error" : typeof err;
}

export async function startWhatsAppReset(deps: ResetDeps, input: { email?: unknown; phone?: unknown }): Promise<StartAnswer> {
  const parsed = resetIdentifierFrom(input);
  if (!parsed.ok) return { ...parsed.answer, background: null };
  const id = parsed.id;

  const pepper = otpPepper(deps.pepperRaw);
  if (!pepper || !(await deps.available())) return { ...unavailable(), background: null };

  const check = await deps.captcha();
  if (check === "misconfigured") {
    deps.log("[password-reset whatsapp start] the security check is not configured — refused");
    return { ...unavailable(), background: null };
  }
  if (check !== "ok") return { status: 403, body: { ok: false, code: "captcha", error: WHATSAPP_CAPTCHA_AR }, background: null };

  const uniform: StartAnswer = { status: 200, body: { ...START_UNIFORM_BODY }, background: null };
  // Over the per-address (or per-number) limit: the same answer, and nothing is sent.
  if (!deps.allow(limitKey("start", id), START_PER_EMAIL.limit, START_PER_EMAIL.windowMs)) return uniform;

  uniform.background = async () => {
    try {
      const target = await lookupFor(deps, id);
      if (!target) return;
      const code = generateOtpCode();
      const issued = await deps.issue({
        userId: target.userId,
        targetHash: hashOtpTarget(pepper, target.phone),
        hint: maskSaudiMobile(target.phone),
        codeHash: hashOtpCode(pepper, target.userId, "password_reset", code),
      });
      if (!issued) return;
      const sent = await deps.send(target.phone, code);
      await deps.markDelivery(issued.id, sent === "sent");
      if (sent !== "sent") deps.log(`[password-reset whatsapp start] delivery did not go out: ${sent}`);
    } catch (err) {
      deps.log(`[password-reset whatsapp start] background step failed: ${errorName(err)}`);
    }
  };
  return uniform;
}

export async function verifyWhatsAppReset(
  deps: ResetDeps,
  input: { email?: unknown; phone?: unknown; code: unknown; password: unknown; confirm: unknown },
): Promise<VerifyAnswer> {
  const startedAt = deps.now();
  const refuse = async (): Promise<RouteAnswer> => {
    const wait = startedAt + VERIFY_FAILURE_FLOOR_MS - deps.now();
    if (wait > 0) await deps.sleep(wait);
    return { status: 400, body: { ok: false, code: WHATSAPP_CODE_INVALID_CODE, error: WHATSAPP_CODE_INVALID_AR } };
  };

  const parsed = resetIdentifierFrom(input);
  if (!parsed.ok) return parsed.answer;
  const id = parsed.id;

  const password = typeof input.password === "string" ? input.password : "";
  const confirm = typeof input.confirm === "string" ? input.confirm : "";
  const problem = validateNewPassword(password, confirm);
  if (problem) return { status: 400, body: { ok: false, code: "weak_password", error: problem } };

  const pepper = otpPepper(deps.pepperRaw);
  if (!pepper || !(await deps.available())) return unavailable();

  if (!deps.allow(limitKey("verify", id), VERIFY_PER_EMAIL.limit, VERIFY_PER_EMAIL.windowMs)) {
    return { status: 429, body: { ok: false, code: "rate_limited", error: WHATSAPP_TOO_MANY_AR } };
  }

  const code = cleanOtpInput(input.code);
  if (!code) return refuse();

  let target: ResetTarget | null;
  let hit: boolean;
  try {
    target = await lookupFor(deps, id);
    if (!target) return refuse();
    hit = await deps.verify({
      userId: target.userId,
      targetHash: hashOtpTarget(pepper, target.phone),
      phone: target.storedPhone ?? target.phone,
      codeHash: hashOtpCode(pepper, target.userId, "password_reset", code),
    });
  } catch (err) {
    deps.log(`[password-reset whatsapp verify] check failed: ${errorName(err)}`);
    return unavailable();
  }
  if (!hit) return refuse();

  // The code is spent now (single use, in the database). If the password
  // cannot be saved, the honest answer is a new code.
  const saved = await deps.setPassword(target.userId, password);
  if (!saved.ok) {
    deps.log(`[password-reset whatsapp verify] password update refused: ${saved.code}`);
    return { status: 503, body: { ok: false, code: "password_not_set", error: WHATSAPP_PASSWORD_NOT_SET_AR } };
  }

  let sessionsEnded: number | null = null;
  try {
    sessionsEnded = await deps.revokeSessions(target.userId);
  } catch {
    sessionsEnded = null;
  }
  if (sessionsEnded === null) deps.log("[password-reset whatsapp verify] ending the open sessions failed");
  try {
    await deps.audit({ userId: target.userId, sessionsEnded });
  } catch {
    deps.log("[password-reset whatsapp verify] audit row failed");
  }
  const userId = target.userId;
  // The account's own address is told, after the answer; a failed mail never
  // undoes or fails the reset.
  const background = async () => {
    try {
      const sent = await deps.notify(userId);
      if (sent !== "sent" && sent !== "sunk") deps.log(`[password-reset whatsapp verify] notice e-mail not sent: ${sent}`);
    } catch (err) {
      deps.log(`[password-reset whatsapp verify] notice e-mail failed: ${errorName(err)}`);
    }
  };
  return { status: 200, body: { ok: true }, background };
}
