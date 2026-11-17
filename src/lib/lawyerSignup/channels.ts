/**
 * Code delivery adapters for the lawyer signup (decision ٢١). Server-only.
 *
 * Every adapter has one shape: sendOtp(to, code, locale) → 'sent' |
 * 'unavailable' | 'failed'. 'unavailable' means "this channel is not set up"
 * (switch off, variables missing, adapter not written): the caller then
 * offers the next channel or falls back to «سجّلنا بياناتك وسنتواصل معك» —
 * never a dead end. Nothing here logs a number, an address or a code.
 *
 *   WhatsApp — Zernio (user decision). The HTTP call is not
 *              written yet: it waits for the Zernio API docs. Until then the
 *              adapter answers 'unavailable' and providerConfig.ts keeps
 *              WhatsApp off (ZERNIO_ADAPTER_IMPLEMENTED = false).
 *   SMS      — sender name NEZAMY; no provider chosen yet (the owner has the
 *              quotes). The interface exists; no implementation.
 *   e-mail   — Resend (the e-mail provider the n8n workflows already use).
 */

import type { Env, SignupProviderConfig } from "./providerConfig.ts";
import { otpMessageAr, OTP_TTL_MINUTES } from "./otpCode.ts";

export type SendResult = "sent" | "unavailable" | "failed";
export type Locale = "ar" | "en";

export interface OtpChannelAdapter {
  readonly name: "zernio_whatsapp" | "sms" | "resend_email";
  sendOtp(to: string, code: string, locale: Locale): Promise<SendResult>;
}

const TIMEOUT_MS = 8000;

/** WhatsApp through Zernio. `to` is an E.164 Saudi mobile (+9665XXXXXXXX). */
export function zernioWhatsAppAdapter(env: Env, config: Pick<SignupProviderConfig, "whatsapp">): OtpChannelAdapter {
  return {
    name: "zernio_whatsapp",
    async sendOtp(to, code, locale) {
      if (!config.whatsapp) return "unavailable";
      const baseUrl = env.ZERNIO_BASE_URL;
      const apiKey = env.ZERNIO_API_KEY;
      const sender = env.ZERNIO_WHATSAPP_SENDER;
      if (!baseUrl || !apiKey || !sender) return "unavailable";
      // TODO(zernio): write the Zernio send call here once the API docs are in
      // hand — endpoint, auth header, sender (ZERNIO_WHATSAPP_SENDER) and the
      // approved OTP template (ZERNIO_OTP_TEMPLATE_ID) with `code` and
      // `locale` as its parameters, AbortSignal.timeout(TIMEOUT_MS), 'sent'
      // only on a 2xx that confirms acceptance, else 'failed'. Then set
      // ZERNIO_ADAPTER_IMPLEMENTED = true in providerConfig.ts.
      void to;
      void code;
      void locale;
      return "unavailable";
    },
  };
}

/** SMS (sender NEZAMY). No provider is implemented: always 'unavailable'. */
export function smsAdapter(_env: Env, config: Pick<SignupProviderConfig, "sms">): OtpChannelAdapter {
  return {
    name: "sms",
    async sendOtp() {
      if (!config.sms) return "unavailable";
      // Unreachable while IMPLEMENTED_SMS_PROVIDERS is empty. A provider
      // adapter goes here after the owner approves a quote; sender id NEZAMY.
      return "unavailable";
    },
  };
}

/** E-mail through Resend's REST API. */
export function resendEmailAdapter(
  env: Env,
  config: Pick<SignupProviderConfig, "email">,
  fetchImpl: typeof fetch = fetch,
): OtpChannelAdapter {
  return {
    name: "resend_email",
    async sendOtp(to, code, locale) {
      if (!config.email || !env.RESEND_API_KEY || !env.EMAIL_FROM) return "unavailable";
      const subject = locale === "ar" ? "رمز تأكيد بريدك في منصة نظامي" : "Your Nezamy e-mail code";
      const text =
        locale === "ar"
          ? `${otpMessageAr(code)}\nهذا الرمز لتأكيد بريدك الإلكتروني فقط.`
          : `Your Nezamy code: ${code}\nValid for ${OTP_TTL_MINUTES} minutes. Do not share it.`;
      const from = env.EMAIL_FROM_NAME ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>` : env.EMAIL_FROM;
      try {
        const res = await fetchImpl("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [to], subject, text }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        return res.ok ? "sent" : "failed";
      } catch {
        return "failed";
      }
    },
  };
}
