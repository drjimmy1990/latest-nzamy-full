/**
 * The server half of the WhatsApp password reset (batch l17): builds the
 * ResetDeps of ./whatsappReset.ts from the service client. Server-only.
 *
 *   lookup         public.pw_reset_target (20261207_10: e-mail → an account
 *                  with a confirmed mobile, not staff / banned / deleted),
 *                  then the account's own app_metadata through the auth admin
 *                  API: a suspended (isSuspendedUser) or frozen
 *                  (freezeStateFromUser) account gets no code — the same
 *                  rules the proxy and requireApiUser apply.
 *   issue / verify public.pw_reset_issue / pw_reset_verify (service_role only).
 *   setPassword    auth.admin.updateUserById(id, { password }).
 *   revokeSessions public.admin_revoke_user_sessions (20261124_60): every
 *                  session of the account ends, so a device signed in with
 *                  the old password is signed out on its next request.
 *   audit          one admin_audit_events row, actor_type "user" (the
 *                  pattern of the user's own onboarding claim / redemption):
 *                  no address, no number.
 *
 * Nothing here logs a code, a number or an address.
 */

import type { createServiceClient } from "@/lib/supabase/server";
import { otpPepper } from "@/lib/lawyerSignup/otpCode";
import { readZernioConfig, sendWhatsAppCode } from "@/lib/phoneOtp/zernioWhatsApp";
import { loadSignupPhoneOtpSetting } from "@/lib/phoneOtp/phoneGateServer";
import { normalizeSaudiMobile } from "@/lib/services/saudiMobile";
import { rateLimit } from "@/lib/rateLimit";
import { turnstilePolicy } from "@/lib/auth/turnstileServer";
import { FORGOT_PASSWORD_PATH } from "@/lib/auth/passwordRecovery";
import { renderEmailAr, sendEmail, siteLink } from "@/lib/email/sendEmail";
import {
  PASSWORD_CHANGED_MAIL_ACTION_AR,
  PASSWORD_CHANGED_MAIL_BODY_AR,
  PASSWORD_CHANGED_MAIL_SUBJECT_AR,
  PASSWORD_CHANGED_MAIL_TAG,
  whatsappResetAvailable,
} from "./passwordResetRules";
import { authUserMayReset, type ResetDeps, type ResetTarget } from "./whatsappReset";

type Svc = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * Is the WhatsApp choice on right now? Never throws (off on any error). Off
 * as well when the security check of «start» is not configured in production
 * (turnstilePolicy "misconfigured"): a button every press of which would
 * answer 503 is not shown.
 */
export async function whatsappResetIsAvailable(): Promise<boolean> {
  try {
    if (turnstilePolicy(process.env.TURNSTILE_SECRET_KEY, process.env.NODE_ENV) === "misconfigured") return false;
    const setting = await loadSignupPhoneOtpSetting();
    return whatsappResetAvailable({
      switchOn: setting.enabled,
      zernioReady: readZernioConfig(process.env).ready,
      pepperReady: otpPepper(process.env.LAWYER_OTP_PEPPER) !== null,
    });
  } catch {
    return false;
  }
}

async function lookup(svc: Svc, email: string): Promise<ResetTarget | null> {
  const { data, error } = await svc.rpc("pw_reset_target", { p_email: email });
  if (error) throw new Error(`pw_reset_target failed: ${error.code ?? "error"}`);
  const j = (data ?? {}) as { ok?: unknown; user_id?: unknown; phone?: unknown };
  if (j.ok !== true || typeof j.user_id !== "string") return null;
  const stored = typeof j.phone === "string" ? j.phone : "";
  const phone = normalizeSaudiMobile(stored);
  if (!phone.ok) return null;
  const { data: got, error: userError } = await svc.auth.admin.getUserById(j.user_id);
  // Fail closed: an account whose standing cannot be read gets no code.
  if (userError || !got?.user || !authUserMayReset(got.user)) return null;
  return { userId: j.user_id, phone: phone.e164, storedPhone: stored };
}

export function serverResetDeps(svc: Svc, captcha: ResetDeps["captcha"]): ResetDeps {
  return {
    pepperRaw: process.env.LAWYER_OTP_PEPPER,
    available: whatsappResetIsAvailable,
    allow: (key, limit, windowMs) => rateLimit(key, { limit, windowMs }).ok,
    captcha,
    lookup: (email) => lookup(svc, email),
    issue: async ({ userId, targetHash, hint, codeHash }) => {
      const { data, error } = await svc.rpc("pw_reset_issue", {
        p_user: userId,
        p_target_hash: targetHash,
        p_target_hint: hint,
        p_code_hash: codeHash,
      });
      if (error) throw new Error(`pw_reset_issue failed: ${error.code ?? "error"}`);
      const j = (data ?? {}) as { ok?: unknown; id?: unknown };
      return j.ok === true && typeof j.id === "string" ? { id: j.id } : null;
    },
    send: async (e164, code) => (await sendWhatsAppCode({ e164, code, env: process.env, fetchImpl: fetch })).result,
    markDelivery: async (id, sent) => {
      await svc
        .from("password_reset_challenges")
        .update(sent ? { delivery: "sent" } : { delivery: "failed", consumed_at: new Date().toISOString() })
        .eq("id", id);
    },
    verify: async ({ userId, targetHash, phone, codeHash }) => {
      const { data, error } = await svc.rpc("pw_reset_verify", {
        p_user: userId,
        p_target_hash: targetHash,
        p_phone: phone,
        p_code_hash: codeHash,
      });
      if (error) throw new Error(`pw_reset_verify failed: ${error.code ?? "error"}`);
      return (data as { ok?: unknown } | null)?.ok === true;
    },
    setPassword: async (userId, password) => {
      const { error } = await svc.auth.admin.updateUserById(userId, { password });
      if (error) {
        const e = error as { code?: unknown; status?: unknown };
        return { ok: false, code: typeof e.code === "string" ? e.code : String(e.status ?? "error") };
      }
      return { ok: true };
    },
    revokeSessions: async (userId) => {
      const { data, error } = await svc.rpc("admin_revoke_user_sessions", { p_user: userId });
      if (error) return null;
      return typeof data === "number" ? data : Number(data) || 0;
    },
    audit: async ({ userId, sessionsEnded }) => {
      const { error } = await svc.from("admin_audit_events").insert({
        actor_id: userId,
        actor_type: "user",
        action: "password_reset_whatsapp",
        target_type: "profile",
        target_id: userId,
        before_state: null,
        after_state: null,
        metadata: {
          detail:
            sessionsEnded === null
              ? "غيّر المستخدم كلمة مروره برمز واتساب؛ تعذّر إنهاء جلساته المفتوحة"
              : `غيّر المستخدم كلمة مروره برمز واتساب؛ أُنهيت جلساته المفتوحة (${sessionsEnded})`,
          channel: "whatsapp",
          sessions_ended: sessionsEnded,
        },
      });
      if (error) throw new Error(`audit insert failed: ${error.code ?? "error"}`);
    },
    notify: async (userId) => {
      const { data, error } = await svc.auth.admin.getUserById(userId);
      const to = !error ? data?.user?.email ?? null : null;
      if (!to) return "no_address";
      const href = siteLink(FORGOT_PASSWORD_PATH);
      const rendered = renderEmailAr({
        heading: PASSWORD_CHANGED_MAIL_SUBJECT_AR,
        paragraphs: [PASSWORD_CHANGED_MAIL_BODY_AR],
        action: href ? { label: PASSWORD_CHANGED_MAIL_ACTION_AR, href } : null,
      });
      return sendEmail({
        to,
        subject: PASSWORD_CHANGED_MAIL_SUBJECT_AR,
        text: rendered.text,
        html: rendered.html,
        tag: PASSWORD_CHANGED_MAIL_TAG,
        userIds: [userId],
      });
    },
    log: (message) => console.error(message),
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
