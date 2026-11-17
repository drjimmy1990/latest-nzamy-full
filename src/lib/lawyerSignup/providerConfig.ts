/**
 * Which outside providers the lawyer signup may use — read from the
 * environment, pure (the env object is passed in, so it is testable).
 *
 * EVERY provider needs an explicit switch `=on` IN ADDITION to its
 * credentials. Credentials alone are not enough on purpose: GEMINI_API_KEY is
 * already the embeddings fallback (src/lib/ai/embeddingClient.ts) and a
 * messaging key may be shared with other jobs, so keying on them alone would
 * start sending licence photos to a model, or codes to phones, the moment
 * this code is deployed — before the owner has approved the provider and its
 * terms (decision ٢١: an API that does not train on the data).
 *
 *   identity / e-mail codes need LAWYER_OTP_PEPPER (≥ 32 characters) first;
 *   WhatsApp:  LAWYER_OTP_WHATSAPP=on + ZERNIO_API_KEY + ZERNIO_BASE_URL +
 *              ZERNIO_WHATSAPP_SENDER (+ ZERNIO_OTP_TEMPLATE_ID when Zernio
 *              needs an approved template) AND the Zernio adapter implemented
 *              (ZERNIO_ADAPTER_IMPLEMENTED below — false until the Zernio API
 *              docs arrive; the HTTP call is a marked TODO in channels.ts).
 *              Evolution is NOT used for the signup codes (user decision).
 *   SMS:       LAWYER_OTP_SMS=on + LAWYER_SMS_PROVIDER naming an IMPLEMENTED adapter
 *              (none yet — the owner has the provider quotes to decide; until
 *              then SMS is always unavailable)
 *   e-mail:    LAWYER_OTP_EMAIL=on + RESEND_API_KEY + EMAIL_FROM
 *   AI check:  LAWYER_LICENCE_AI=on + GEMINI_API_KEY (GEMINI_LICENCE_MODEL optional)
 *   instant approval: LAWYER_INSTANT_APPROVAL=on (default off)
 */

import { otpPepper } from "./otpCode.ts";

export type Env = Record<string, string | undefined>;

/** The SMS adapters that exist in code. Empty until the owner picks a provider. */
export const IMPLEMENTED_SMS_PROVIDERS: readonly string[] = [];

/**
 * Flip to true in the same change that writes the Zernio HTTP call in
 * src/lib/lawyerSignup/channels.ts. Until then WhatsApp is unavailable even
 * with every variable set, and the flow falls back to review.
 */
export const ZERNIO_ADAPTER_IMPLEMENTED = false;

export const DEFAULT_GEMINI_LICENCE_MODEL = "gemini-2.5-flash";

export type SignupProviderConfig = {
  pepper: string | null;
  whatsapp: boolean;
  sms: boolean;
  email: boolean;
  ai: boolean;
  aiModel: string;
  instantApproval: boolean;
};

const on = (v: string | undefined) => (v ?? "").trim().toLowerCase() === "on";
const has = (v: string | undefined) => (v ?? "").trim() !== "";

export function readSignupProviderConfig(env: Env): SignupProviderConfig {
  const pepper = otpPepper(env.LAWYER_OTP_PEPPER);
  const smsProvider = (env.LAWYER_SMS_PROVIDER ?? "").trim().toLowerCase();
  return {
    pepper,
    whatsapp: pepper !== null && on(env.LAWYER_OTP_WHATSAPP) && zernioConfigured(env) && ZERNIO_ADAPTER_IMPLEMENTED,
    sms: pepper !== null && on(env.LAWYER_OTP_SMS) && IMPLEMENTED_SMS_PROVIDERS.includes(smsProvider),
    email: pepper !== null && on(env.LAWYER_OTP_EMAIL) && has(env.RESEND_API_KEY) && has(env.EMAIL_FROM),
    ai: on(env.LAWYER_LICENCE_AI) && has(env.GEMINI_API_KEY),
    aiModel: (env.GEMINI_LICENCE_MODEL ?? "").trim() || DEFAULT_GEMINI_LICENCE_MODEL,
    instantApproval: on(env.LAWYER_INSTANT_APPROVAL),
  };
}

/** The Zernio variables are present (names only; never logged). */
export function zernioConfigured(env: Env): boolean {
  return has(env.ZERNIO_API_KEY) && has(env.ZERNIO_BASE_URL) && has(env.ZERNIO_WHATSAPP_SENDER);
}

/** At least one channel can carry the identity code to the registry mobile. */
export function identityChannelAvailable(c: Pick<SignupProviderConfig, "whatsapp" | "sms">): boolean {
  return c.whatsapp || c.sms;
}
