/**
 * checkoutCaptcha.ts — S6b (owner package 17 Nov): Cloudflare Turnstile in
 * front of the founder seat reservation. POST /api/v1/payments/checkout
 * verifies the body's `turnstileToken` for the founder membership ONLY,
 * before startCheckoutWith reads or writes anything (checkoutCore.ts, step
 * 0d): no order, no founder_reserve_seat, no intent for a refused check.
 * Every other item is never gated, so a plan / library / top-up checkout is
 * exactly as before.
 *
 * WHY A MISSING KEY ALLOWS THE SALE (deliberate, unlike the registry lookup).
 * turnstilePolicy (src/lib/auth/turnstileServer.ts) answers 'misconfigured'
 * in production when TURNSTILE_SECRET_KEY is unset, and the guest registry
 * lookup refuses on it: that route reads personal data. Here the caller is a
 * signed-in, licence-verified lawyer paying money; the seat is still capped
 * by founder_reserve_seat's advisory lock, held for 15 minutes, and the proxy
 * limits checkout starts to 3 per 10 minutes per user (S5). A lost env line
 * must never stop paying customers, so 'misconfigured' is LOGGED LOUDLY
 * (console.error on every founder checkout until fixed) and the sale goes on.
 * The same holds when the server has the secret but the build has no site
 * key (NEXT_PUBLIC_TURNSTILE_SITE_KEY is inlined at build time, in the
 * server bundle as in the browser's): the browser then cannot produce a token
 * at all, so verifying would refuse every founder buyer.
 *
 * With both keys present a missing, spent, forged or expired token is refused
 * (403 {code: "captcha"}) — and so is a Cloudflare siteverify outage or
 * timeout (verifyTurnstileToken answers false): the buyer presses again.
 *
 * Pure apart from the injected fetch / log: relative imports only, no
 * process.env (the route passes the values in), so `node --test` loads it.
 */

import { turnstilePolicy, verifyTurnstileToken, type TurnstilePolicy } from "../auth/turnstileServer.ts";

/** The checkout's refusal (S6b brief, verbatim). */
export const CHECKOUT_CAPTCHA_REFUSED_AR = "تعذّر اجتياز التحقق الأمني — أكمله مرة أخرى";
/** The reply's `code`: the browser tells a captcha refusal (retry) from an audience 403 (final). */
export const CHECKOUT_CAPTCHA_CODE = "captcha";
/** The widget's action label (Cloudflare dashboard analytics). */
export const CHECKOUT_TURNSTILE_ACTION = "founder_checkout";

const MAX_TOKEN_LENGTH = 4096;

/** The body's `turnstileToken`, or null (absent, not a string, empty, too long). */
export function parseCheckoutTurnstileToken(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const token = (raw as { turnstileToken?: unknown }).turnstileToken;
  if (typeof token !== "string") return null;
  const t = token.trim();
  return t && t.length <= MAX_TOKEN_LENGTH ? t : null;
}

/**
 * turnstilePolicy, plus the site-key rule above: 'verify' only when the
 * server holds the secret AND the build carries a site key.
 */
export function checkoutCaptchaPolicy(
  secret: string | null | undefined,
  siteKey: string | null | undefined,
  nodeEnv: string | undefined,
): TurnstilePolicy {
  const base = turnstilePolicy(secret, nodeEnv);
  if (base !== "verify") return base;
  if ((siteKey ?? "").trim()) return "verify";
  return nodeEnv === "production" ? "misconfigured" : "skip";
}

type FetchImpl = Parameters<typeof verifyTurnstileToken>[0]["fetchImpl"];

/**
 * May this founder checkout go on? 'skip' (local work) and 'misconfigured'
 * (logged) → true; 'verify' → Cloudflare's answer for this token.
 */
export async function checkoutCaptchaPasses(input: {
  policy: TurnstilePolicy;
  secret: string | null | undefined;
  token: string | null;
  remoteIp?: string | null;
  fetchImpl: FetchImpl;
  logError?: (message: string) => void;
}): Promise<boolean> {
  if (input.policy === "skip") return true;
  if (input.policy === "misconfigured") {
    (input.logError ?? console.error)(
      "[payments/checkout] S6b MISCONFIGURED: Turnstile is not verifying founder checkouts — set TURNSTILE_SECRET_KEY " +
        "(server) and NEXT_PUBLIC_TURNSTILE_SITE_KEY (build) and redeploy. The sale is ALLOWED meanwhile on purpose.",
    );
    return true;
  }
  return verifyTurnstileToken({
    secret: input.secret ?? "",
    token: input.token,
    remoteIp: input.remoteIp ?? null,
    fetchImpl: input.fetchImpl,
  });
}
