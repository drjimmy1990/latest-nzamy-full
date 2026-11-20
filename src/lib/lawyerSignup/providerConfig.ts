/**
 * Which outside providers the lawyer signup may use — read from the
 * environment, pure (the env object is passed in, so it is testable).
 *
 * EVERY provider needs an explicit switch `=on` IN ADDITION to its
 * credentials. Credentials alone are not enough on purpose: GEMINI_API_KEY is
 * already the embeddings fallback (src/lib/ai/embeddingClient.ts) and the
 * mail settings are shared with other mail, so keying on them alone would start
 * sending licence photos to a model, or codes to inboxes, the moment this
 * code is deployed — before the owner has approved the provider and its
 * terms (decision ٢١: an API that does not train on the data).
 *
 *   e-mail code — the ONLY code (decision ٢٧ / batch l7 decision 12: no
 *              WhatsApp, no SMS, no registry-mobile code):
 *              LAWYER_OTP_PEPPER (≥ 32 characters) + LAWYER_OTP_EMAIL=on +
 *              e-mail set up (src/lib/email/emailConfig.ts: SMTP, else Resend)
 *   AI check:  LAWYER_LICENCE_AI=on + GEMINI_API_KEY (GEMINI_LICENCE_MODEL optional)
 *   instant approval: LAWYER_INSTANT_APPROVAL=on (default off)
 */

import { otpPepper } from "./otpCode.ts";
import { emailConfigured } from "../email/emailConfig.ts";

export type Env = Record<string, string | undefined>;

export const DEFAULT_GEMINI_LICENCE_MODEL = "gemini-2.5-flash";

export type SignupProviderConfig = {
  pepper: string | null;
  email: boolean;
  ai: boolean;
  aiModel: string;
  instantApproval: boolean;
};

const on = (v: string | undefined) => (v ?? "").trim().toLowerCase() === "on";
const has = (v: string | undefined) => (v ?? "").trim() !== "";

export function readSignupProviderConfig(env: Env): SignupProviderConfig {
  const pepper = otpPepper(env.LAWYER_OTP_PEPPER);
  return {
    pepper,
    email: pepper !== null && on(env.LAWYER_OTP_EMAIL) && emailConfigured(env),
    ai: on(env.LAWYER_LICENCE_AI) && has(env.GEMINI_API_KEY),
    aiModel: (env.GEMINI_LICENCE_MODEL ?? "").trim() || DEFAULT_GEMINI_LICENCE_MODEL,
    instantApproval: on(env.LAWYER_INSTANT_APPROVAL),
  };
}
