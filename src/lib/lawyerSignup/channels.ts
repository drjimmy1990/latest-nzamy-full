/**
 * Code delivery for the lawyer signup. Server-only.
 *
 * Decision ٢٧ (batch l7 decision 12): the e-mail code is the ONLY code. The
 * WhatsApp (Zernio) and SMS adapters that waited for a provider were removed
 * with the registry-mobile step.
 *
 * The adapter answers 'sent' | 'unavailable' | 'failed'. 'unavailable' means
 * "the channel is not set up" (switch off, variables missing): the caller
 * then falls back to «سجّلنا بياناتك وسنتواصل معك» — never a dead end.
 * Nothing here logs an address or a code.
 *
 *   e-mail — Resend (the e-mail provider the n8n workflows already use),
 *            through the shared sender src/lib/email/sendEmail.ts.
 */

import type { Env, SignupProviderConfig } from "./providerConfig.ts";
import { otpMessageAr, OTP_TTL_MINUTES } from "./otpCode.ts";
import { sendEmail } from "../email/sendEmail.ts";

export type SendResult = "sent" | "unavailable" | "failed";
export type Locale = "ar" | "en";

export interface OtpChannelAdapter {
  readonly name: "resend_email";
  sendOtp(to: string, code: string, locale: Locale): Promise<SendResult>;
}

const TIMEOUT_MS = 8000;

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
          ? `${otpMessageAr(code)}\nأدخل هذا الرمز في صفحة توثيق الترخيص لتأكيد بريدك الإلكتروني.`
          : `Your Nezamy code: ${code}\nValid for ${OTP_TTL_MINUTES} minutes. Do not share it.`;
      // The one shared sender (src/lib/email/sendEmail.ts): never throws,
      // never logs the code or the full address.
      const r = await sendEmail({ to, subject, text, tag: "lawyer_signup_otp" }, { env, fetchImpl, timeoutMs: TIMEOUT_MS });
      // 'sunk' (l9 testinfra): a test address — the code waits in the admin's
      // test mail sink (/dashboard/admin/test-batches), which is its delivery.
      return r === "sunk" ? "sent" : r;
    },
  };
}
