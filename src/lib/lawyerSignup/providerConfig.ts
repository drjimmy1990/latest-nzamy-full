/**
 * Which outside providers the lawyer signup may use — read from the
 * environment, pure (the env object is passed in, so it is testable).
 *
 * EVERY provider needs an explicit switch `=on` IN ADDITION to its
 * credentials. Credentials alone are not enough on purpose: GEMINI_API_KEY is
 * already the embeddings fallback (src/lib/ai/embeddingClient.ts) and the
 * Evolution variables may be shared with n8n, so keying on them alone would
 * start sending licence photos to a model, or codes to phones, the moment
 * this code is deployed — before the owner has approved the provider and its
 * terms (decision ٢١: an API that does not train on the data).
 *
 *   identity / e-mail codes need LAWYER_OTP_PEPPER (≥ 32 characters) first;
 *   WhatsApp:  LAWYER_OTP_WHATSAPP=on + EVOLUTION_API_URL + EVOLUTION_API_KEY + EVOLUTION_INSTANCE_NAME
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
    whatsapp:
      pepper !== null &&
      on(env.LAWYER_OTP_WHATSAPP) &&
      has(env.EVOLUTION_API_URL) &&
      has(env.EVOLUTION_API_KEY) &&
      has(env.EVOLUTION_INSTANCE_NAME),
    sms: pepper !== null && on(env.LAWYER_OTP_SMS) && IMPLEMENTED_SMS_PROVIDERS.includes(smsProvider),
    email: pepper !== null && on(env.LAWYER_OTP_EMAIL) && has(env.RESEND_API_KEY) && has(env.EMAIL_FROM),
    ai: on(env.LAWYER_LICENCE_AI) && has(env.GEMINI_API_KEY),
    aiModel: (env.GEMINI_LICENCE_MODEL ?? "").trim() || DEFAULT_GEMINI_LICENCE_MODEL,
    instantApproval: on(env.LAWYER_INSTANT_APPROVAL),
  };
}

/** At least one channel can carry the identity code to the registry mobile. */
export function identityChannelAvailable(c: Pick<SignupProviderConfig, "whatsapp" | "sms">): boolean {
  return c.whatsapp || c.sms;
}
