/**
 * WhatsApp delivery of the sign-up code through Zernio (batch l15).
 * Server-only — never import it from a client component.
 *
 * Zernio's own "Verify" product is SMS-only, so the code goes out as our own
 * approved WhatsApp AUTHENTICATION template:
 *   POST https://zernio.com/api/v1/inbox/conversations
 *   Authorization: Bearer <ZERNIO_API_KEY>
 *   { accountId, participantId, templateName, templateLanguage, templateParams }
 * participantId is the number with its country code and no «+». templateParams
 * is ONE flat array — header variables, then body variables, then dynamic
 * URL-button variables. The approved template has the code once in the body
 * and once in its copy-code button, so the array is [code, code].
 *
 * Environment (the server's .env.local; never NEXT_PUBLIC_):
 *   ZERNIO_API_KEY               required
 *   ZERNIO_WHATSAPP_ACCOUNT_ID   required (the WhatsApp account in Zernio)
 *   ZERNIO_OTP_TEMPLATE          optional, default "nezamy_otp"
 *   ZERNIO_OTP_TEMPLATE_LANG     optional, default "ar"
 *   ZERNIO_RESET_OTP_TEMPLATE    optional (batch l18, owner ٢٣١): the template
 *                                of the PASSWORD-RESET code (purpose "reset");
 *                                unset → the sign-up template above, so the
 *                                reset keeps working with nezamy_otp until the
 *                                owner's nezamy_password_reset is approved
 *                                (same shape: the code in the body and in the
 *                                copy-code button). Read at send time.
 * Either required one missing → 'unavailable' (nothing is sent).
 *
 * Answers: 'sent' (a 2xx that does not say success:false) | 'unavailable' |
 * 'failed'. Zernio's HTTP status is returned beside it for the admin's test
 * send only. Nothing here logs the key, the code or the number.
 *
 * Relative / type-only imports and an injected fetch: `node --test` loads it.
 */

export const ZERNIO_SEND_URL = "https://zernio.com/api/v1/inbox/conversations";
export const ZERNIO_DEFAULT_TEMPLATE = "nezamy_otp";
export const ZERNIO_DEFAULT_TEMPLATE_LANG = "ar";
export const ZERNIO_TIMEOUT_MS = 8000;

export type ZernioEnv = Record<string, string | undefined>;
export type WhatsAppSendResult = "sent" | "unavailable" | "failed";

export type ZernioConfig = {
  apiKey: string | null;
  accountId: string | null;
  template: string;
  language: string;
  ready: boolean;
};

const clean = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

/** What the code is for: the sign-up / phone confirmation, or the l17 password reset. */
export type ZernioPurpose = "signup" | "reset";

export function readZernioConfig(env: ZernioEnv, purpose: ZernioPurpose = "signup"): ZernioConfig {
  const apiKey = clean(env.ZERNIO_API_KEY);
  const accountId = clean(env.ZERNIO_WHATSAPP_ACCOUNT_ID);
  const signupTemplate = clean(env.ZERNIO_OTP_TEMPLATE) ?? ZERNIO_DEFAULT_TEMPLATE;
  return {
    apiKey,
    accountId,
    // l18 (٢٣١): the reset's own template when set, else the sign-up one
    template: purpose === "reset" ? clean(env.ZERNIO_RESET_OTP_TEMPLATE) ?? signupTemplate : signupTemplate,
    language: clean(env.ZERNIO_OTP_TEMPLATE_LANG) ?? ZERNIO_DEFAULT_TEMPLATE_LANG,
    ready: apiKey !== null && accountId !== null,
  };
}

/** +9665XXXXXXXX → 9665XXXXXXXX (Zernio's participantId); anything else → null. */
export function zernioParticipantId(e164: string): string | null {
  const s = (e164 ?? "").trim();
  return /^\+9665\d{8}$/.test(s) ? s.slice(1) : null;
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type WhatsAppSendOutcome = { result: WhatsAppSendResult; httpStatus: number | null };

export async function sendWhatsAppCode(input: {
  e164: string;
  code: string;
  env: ZernioEnv;
  fetchImpl: FetchLike;
  timeoutMs?: number;
  /** l18 (٢٣١): "reset" picks ZERNIO_RESET_OTP_TEMPLATE; default "signup". */
  purpose?: ZernioPurpose;
}): Promise<WhatsAppSendOutcome> {
  const config = readZernioConfig(input.env, input.purpose ?? "signup");
  if (!config.ready) return { result: "unavailable", httpStatus: null };
  const participantId = zernioParticipantId(input.e164);
  if (!participantId || !/^\d{6}$/.test(input.code)) return { result: "failed", httpStatus: null };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? ZERNIO_TIMEOUT_MS);
  try {
    const res = await input.fetchImpl(ZERNIO_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        accountId: config.accountId,
        participantId,
        templateName: config.template,
        templateLanguage: config.language,
        templateParams: [input.code, input.code],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { result: "failed", httpStatus: res.status };
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const saysFailed = !!body && typeof body === "object" && (body as { success?: unknown }).success === false;
    return { result: saysFailed ? "failed" : "sent", httpStatus: res.status };
  } catch {
    return { result: "failed", httpStatus: null };
  } finally {
    clearTimeout(timer);
  }
}
