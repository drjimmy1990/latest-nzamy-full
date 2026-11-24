/**
 * The WhatsApp sign-up code (batch l15) — the server flow behind
 * /api/v1/auth/phone-otp/{status,start,verify}. Server-only: every call uses
 * the service client AFTER the route has verified the signed-in user, and
 * only ever acts on that user's own rows.
 *
 * Reused from the lawyer signup (src/lib/lawyerSignup/otpCode.ts): the pepper
 * LAWYER_OTP_PEPPER (≥ 32 characters; without it no code is issued), the
 * six-digit generator, the keyed hashes of the code and of the number, the
 * 10-minute TTL, 5 attempts and the 60 s resend. The codes live in their own
 * table, public.phone_otp_challenges (20261205_10), and a hit stamps
 * profiles.phone_verified_at inside the database (phone_otp_verify), only
 * while profiles.phone is still the number the code went to.
 *
 * Nothing here logs a code, a number or a key.
 */

import type { User } from "@supabase/supabase-js";
import type { createServiceClient } from "@/lib/supabase/server";
import {
  generateOtpCode,
  hashOtpCode,
  hashOtpTarget,
  otpPepper,
  OTP_RESEND_SECONDS,
  OTP_TTL_MINUTES,
} from "@/lib/lawyerSignup/otpCode";
import { normalizeSaudiMobile, saudiMobileMessage } from "@/lib/services/saudiMobile";
import { needsOnboarding } from "@/lib/auth/onboardingGate";
import { dashboardPathFor } from "@/lib/auth/userTypes";
import { rateLimit } from "@/lib/rateLimit";
import { readZernioConfig, sendWhatsAppCode } from "./zernioWhatsApp";
import { maskSaudiMobile, PHONE_SEND_FAILED_AR } from "./phoneOtpRules";

type Svc = Awaited<ReturnType<typeof createServiceClient>>;

export class PhoneOtpUnavailable extends Error {}

const MISSING = new Set(["42P01", "42883", "PGRST202", "PGRST205", "42703", "PGRST204"]);

/** Per-process ceiling per number (the database also caps 10 per 24 h across accounts). */
const PER_TARGET = { limit: 5, windowMs: 10 * 60_000 };

type ProfileRow = {
  phone: string | null;
  phone_verified_at: string | null;
  user_type: string | null;
  onboarding_completed: boolean | null;
};

async function readProfile(svc: Svc, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await svc
    .from("profiles")
    .select("phone, phone_verified_at, user_type, onboarding_completed")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    if (MISSING.has(error.code ?? "")) throw new PhoneOtpUnavailable("schema");
    throw new Error(`profiles read failed: ${error.code}`);
  }
  return (data as ProfileRow | null) ?? null;
}

function channelReady(): { pepper: string | null; ready: boolean } {
  const pepper = otpPepper(process.env.LAWYER_OTP_PEPPER);
  return { pepper, ready: pepper !== null && readZernioConfig(process.env).ready };
}

/** Where the user goes once the mobile is confirmed: the wizard if unfinished, else the dashboard. */
export function homeAfterVerify(p: Pick<ProfileRow, "user_type" | "onboarding_completed" | "phone"> | null): string {
  const userType = p?.user_type ?? "";
  if (needsOnboarding({ userType, onboardingCompleted: p?.onboarding_completed, hasPhone: normalizeSaudiMobile(p?.phone ?? "").ok })) {
    return "/onboarding";
  }
  return dashboardPathFor(userType);
}

export type PhoneStatus = {
  /** This account is held until its mobile is confirmed (the switch is on and it is new). */
  required: boolean;
  verified: boolean;
  masked: string | null;
  hasPhone: boolean;
  /** WhatsApp can send right now (key + account + pepper set). */
  available: boolean;
  /** A code was asked for before (the security check is asked only before the first). */
  sentBefore: boolean;
  lastSentAt: string | null;
  home: string;
};

async function lastChallenge(svc: Svc, userId: string): Promise<{ created_at: string; delivery: string } | null> {
  const { data, error } = await svc
    .from("phone_otp_challenges")
    .select("created_at, delivery")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (MISSING.has(error.code ?? "")) throw new PhoneOtpUnavailable("schema");
    throw new Error(`phone_otp_challenges read failed: ${error.code}`);
  }
  return (data as { created_at: string; delivery: string } | null) ?? null;
}

export async function readPhoneStatus(svc: Svc, user: User): Promise<PhoneStatus> {
  const profile = await readProfile(svc, user.id);
  const { data: gate, error } = await svc.rpc("phone_otp_gate", { p_user: user.id });
  if (error) {
    if (MISSING.has(error.code ?? "")) throw new PhoneOtpUnavailable("schema");
    throw new Error(`phone_otp_gate failed: ${error.code}`);
  }
  const g = (gate ?? {}) as { gated?: unknown };
  const phone = normalizeSaudiMobile(profile?.phone ?? "");
  const last = await lastChallenge(svc, user.id);
  return {
    required: g.gated === true,
    verified: profile?.phone_verified_at != null,
    masked: phone.ok ? maskSaudiMobile(phone.e164) : null,
    hasPhone: phone.ok,
    available: channelReady().ready,
    sentBefore: last !== null,
    lastSentAt: last && last.delivery !== "failed" ? last.created_at : null,
    home: homeAfterVerify(profile),
  };
}

export type StartOutcome =
  | { ok: true; masked: string | null; resendAfterSec: number; expiresInSec: number }
  | {
      ok: false;
      reason:
        | "unavailable"
        | "failed"
        | "already"
        | "no_phone"
        | "bad_phone"
        | "phone_taken"
        | "cooldown"
        | "user_limit"
        | "daily_limit"
        | "target_limit";
      error: string;
      retryAfterSec?: number;
    };

const LIMIT_AR = "طلبت رموزًا كثيرة. انتظر قليلًا ثم أعد المحاولة.";

/**
 * Sends a code to the profile's mobile — or first moves the profile to
 * `newPhone` (the «تغيير الرقم» on the verify screen; the database clears any
 * earlier confirmation with it).
 */
export async function startPhoneOtp(svc: Svc, user: User, opts: { newPhone?: string | null } = {}): Promise<StartOutcome> {
  const { pepper, ready } = channelReady();
  let profile = await readProfile(svc, user.id);

  if (opts.newPhone != null) {
    const parsed = normalizeSaudiMobile(opts.newPhone);
    if (!parsed.ok) return { ok: false, reason: "bad_phone", error: saudiMobileMessage(parsed) };
    if (parsed.e164 !== profile?.phone) {
      const { error } = await svc.from("profiles").update({ phone: parsed.e164 }).eq("id", user.id);
      if (error) {
        if (error.code === "23505") {
          return { ok: false, reason: "phone_taken", error: "هذا الرقم مستخدم في حساب موثّق آخر. أدخل رقم جوالك أنت." };
        }
        if (error.code === "23514") return { ok: false, reason: "bad_phone", error: "رقم الجوال غير صالح." };
        throw new Error(`profiles phone update failed: ${error.code}`);
      }
      profile = await readProfile(svc, user.id);
    }
  }

  const phone = normalizeSaudiMobile(profile?.phone ?? "");
  if (!phone.ok) return { ok: false, reason: "no_phone", error: "أدخل رقم جوالك السعودي أولًا." };
  if (profile?.phone_verified_at && phone.e164 === profile.phone) {
    return { ok: false, reason: "already", error: "رقم جوالك مؤكَّد." };
  }
  if (!ready || !pepper) return { ok: false, reason: "unavailable", error: PHONE_SEND_FAILED_AR };

  const targetHash = hashOtpTarget(pepper, phone.e164);
  const perTarget = rateLimit(`phone-otp:target:${targetHash}`, PER_TARGET);
  if (!perTarget.ok) return { ok: false, reason: "target_limit", error: LIMIT_AR, retryAfterSec: perTarget.retryAfterSec };

  const code = generateOtpCode();
  const { data, error } = await svc.rpc("phone_otp_issue", {
    p_user: user.id,
    p_target_hash: targetHash,
    p_target_hint: maskSaudiMobile(phone.e164),
    p_code_hash: hashOtpCode(pepper, user.id, "phone", code),
  });
  if (error) {
    if (MISSING.has(error.code ?? "")) throw new PhoneOtpUnavailable("schema");
    console.error("[phone-otp] issue failed:", error.code);
    return { ok: false, reason: "failed", error: PHONE_SEND_FAILED_AR };
  }
  const j = (data ?? {}) as { ok?: boolean; id?: string; reason?: string; retry_after?: number };
  if (!j.ok || !j.id) {
    const reason =
      j.reason === "cooldown" || j.reason === "user_limit" || j.reason === "daily_limit" || j.reason === "target_limit"
        ? j.reason
        : "failed";
    const retryAfterSec = typeof j.retry_after === "number" ? j.retry_after : undefined;
    if (reason === "cooldown") {
      return { ok: false, reason, error: "أُرسل رمز قبل لحظات. انتظر قليلًا قبل طلب رمز جديد.", retryAfterSec };
    }
    return { ok: false, reason, error: reason === "failed" ? PHONE_SEND_FAILED_AR : LIMIT_AR, retryAfterSec };
  }

  const sent = await sendWhatsAppCode({ e164: phone.e164, code, env: process.env, fetchImpl: fetch });
  await svc
    .from("phone_otp_challenges")
    .update(sent.result === "sent" ? { delivery: "sent" } : { delivery: "failed", consumed_at: new Date().toISOString() })
    .eq("id", j.id);
  if (sent.result !== "sent") {
    console.error("[phone-otp] WhatsApp delivery did not go out:", sent.result, sent.httpStatus ?? "-");
    return { ok: false, reason: sent.result === "unavailable" ? "unavailable" : "failed", error: PHONE_SEND_FAILED_AR };
  }
  return { ok: true, masked: maskSaudiMobile(phone.e164), resendAfterSec: OTP_RESEND_SECONDS, expiresInSec: OTP_TTL_MINUTES * 60 };
}

export type VerifyOutcome =
  | { ok: true; home: string }
  | { ok: false; reason: "wrong" | "expired" | "locked" | "phone_changed" | "no_phone" | "unavailable"; error: string; attemptsLeft?: number };

export async function verifyPhoneOtp(svc: Svc, user: User, code: string): Promise<VerifyOutcome> {
  const pepper = otpPepper(process.env.LAWYER_OTP_PEPPER);
  if (!pepper) return { ok: false, reason: "unavailable", error: "الخدمة غير متاحة مؤقتًا، حاول بعد قليل." };
  const profile = await readProfile(svc, user.id);
  const phone = normalizeSaudiMobile(profile?.phone ?? "");
  if (!phone.ok || !profile?.phone) return { ok: false, reason: "no_phone", error: "أدخل رقم جوالك السعودي أولًا." };
  if (profile.phone_verified_at) return { ok: true, home: homeAfterVerify(profile) };

  const { data, error } = await svc.rpc("phone_otp_verify", {
    p_user: user.id,
    p_target_hash: hashOtpTarget(pepper, phone.e164),
    p_phone: profile.phone,
    p_code_hash: hashOtpCode(pepper, user.id, "phone", code),
  });
  if (error) {
    if (MISSING.has(error.code ?? "")) throw new PhoneOtpUnavailable("schema");
    console.error("[phone-otp] verify failed:", error.code);
    return { ok: false, reason: "unavailable", error: "تعذّر التحقق الآن، حاول بعد قليل." };
  }
  const j = (data ?? {}) as { ok?: boolean; reason?: string; attempts_left?: number };
  if (j.ok) return { ok: true, home: homeAfterVerify(profile) };
  if (j.reason === "wrong") {
    const left = typeof j.attempts_left === "number" ? j.attempts_left : undefined;
    return {
      ok: false,
      reason: "wrong",
      attemptsLeft: left,
      error: left === 0 ? "الرمز غير صحيح، ولم تبقَ محاولات. اطلب رمزًا جديدًا." : "الرمز غير صحيح. أعد كتابته كما وصلك.",
    };
  }
  if (j.reason === "locked") return { ok: false, reason: "locked", error: "تجاوزت عدد المحاولات. اطلب رمزًا جديدًا." };
  if (j.reason === "phone_changed") {
    return { ok: false, reason: "phone_changed", error: "تغيّر رقم جوالك بعد إرسال الرمز. اطلب رمزًا جديدًا للرقم الحالي." };
  }
  return { ok: false, reason: "expired", error: "انتهت صلاحية الرمز. اطلب رمزًا جديدًا." };
}

/**
 * The admin's live probe: a code to the admin's OWN profile mobile through
 * the same template. Nothing is stored (the code confirms nothing); only the
 * outcome and Zernio's HTTP status come back.
 */
export async function sendAdminTestCode(svc: Svc, adminId: string): Promise<{ result: "sent" | "unavailable" | "failed" | "no_phone"; httpStatus: number | null }> {
  const profile = await readProfile(svc, adminId);
  const phone = normalizeSaudiMobile(profile?.phone ?? "");
  if (!phone.ok) return { result: "no_phone", httpStatus: null };
  const out = await sendWhatsAppCode({ e164: phone.e164, code: generateOtpCode(), env: process.env, fetchImpl: fetch });
  return { result: out.result, httpStatus: out.httpStatus };
}
