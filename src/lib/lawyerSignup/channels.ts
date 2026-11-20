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
 *   e-mail — through the shared sender src/lib/email/sendEmail.ts: the
 *            operator's SMTP mailbox, else Resend (emailConfig.ts decides).
 *            The adapter keeps its old name «resendEmailAdapter» / "resend_email".
 */

import type { Env, SignupProviderConfig } from "./providerConfig.ts";
import { otpMessageAr, OTP_TTL_MINUTES } from "./otpCode.ts";
import { sendEmail } from "../email/sendEmail.ts";
import { emailConfigured } from "../email/emailConfig.ts";

export type SendResult = "sent" | "unavailable" | "failed";
export type Locale = "ar" | "en";

export interface OtpChannelAdapter {
  readonly name: "resend_email";
  sendOtp(to: string, code: string, locale: Locale): Promise<SendResult>;
}

const TIMEOUT_MS = 8000;

/** The e-mail code, through the shared sender (SMTP or Resend). */
export function resendEmailAdapter(
  env: Env,
  config: Pick<SignupProviderConfig, "email">,
  fetchImpl: typeof fetch = fetch,
): OtpChannelAdapter {
  return {
    name: "resend_email",
    async sendOtp(to, code, locale) {
      if (!config.email || !emailConfigured(env)) return "unavailable";
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
