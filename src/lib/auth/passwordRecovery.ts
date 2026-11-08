/**
 * Password recovery ("forgot password") — the pure part. Owner package
 * 2026-11-02, slice A §1.5: the old /forgot-password page only moved between
 * local steps and announced «تم بنجاح» without calling anything.
 *
 * The real flow, end to end:
 *   1. /forgot-password calls supabase.auth.resetPasswordForEmail(email,
 *      { redirectTo: recoveryRedirectTo(origin), captchaToken }).
 *      The browser client is PKCE (@supabase/ssr createBrowserClient), so
 *      supabase-js stores a code verifier tagged "/recovery" in this
 *      browser's cookies.
 *   2. GoTrue emails a link; following it verifies the token and redirects to
 *      /auth/callback?next=/reset-password&code=….
 *   3. /auth/callback exchanges the code and sends the person to
 *      /reset-password — never to a dashboard (planAuthCallback,
 *      recoveryLandingAfterExchange). It works only in the browser that
 *      asked: the PKCE verifier is there. token_hash links are deliberately
 *      not verified (login CSRF — see the note in the callback route).
 *   4. /reset-password requires that session and calls
 *      supabase.auth.updateUser({ password }) — the SecurityTab pattern.
 *
 * Pure: no React, no DOM, no process.env, so `node --test` loads it as it is
 * (passwordRecovery.test.ts). Relative ".ts" imports for the same reason.
 */

import { safeLocalPath } from "./safeLocalPath.ts";
import { isCaptchaAuthError } from "./captcha.ts";
import { translateAuthError } from "./translateAuthError.ts";
import {
  MIN_PASSWORD_LENGTH,
  validateNewPassword,
} from "../../app/settings/components/tabs/_securityFields.ts";

export const FORGOT_PASSWORD_PATH = "/forgot-password";
/** The Settings rule's minimum, re-exported for the reset form. */
export const MIN_RESET_PASSWORD_LENGTH = MIN_PASSWORD_LENGTH;
export const RESET_PASSWORD_PATH = "/reset-password";
/** Where a refused, expired or already-used recovery link ends up. */
export const RESET_LINK_ERROR_PATH = `${RESET_PASSWORD_PATH}?error=link`;

/**
 * The `redirectTo` sent with resetPasswordForEmail. GoTrue only honours it
 * when it matches GOTRUE_SITE_URL's host or GOTRUE_URI_ALLOW_LIST; otherwise
 * it silently falls back to the site URL (ops, see the task report).
 */
export function recoveryRedirectTo(origin: string): string {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("next", RESET_PASSWORD_PATH);
  return url.toString();
}

/** Is this (already validated) `next` the reset page? */
function nextIsResetPage(rawNext: string | null): boolean {
  const safe = safeLocalPath(rawNext, "");
  if (!safe) return false;
  const pathname = new URL(safe, "https://same-origin.invalid").pathname;
  return pathname === RESET_PASSWORD_PATH;
}

export type AuthCallbackPlan =
  /** PKCE: OAuth sign-in or a recovery link. `recoveryHint` = the URL says recovery. */
  | { kind: "exchange_code"; code: string; recoveryHint: boolean }
  /**
   * A recovery link with no code: GoTrue already refused it (expired / used),
   * or it is a token_hash link, which this app never verifies.
   */
  | { kind: "recovery_link_error" }
  /** Nothing usable — the route's old /login?error=… answer. */
  | { kind: "fail" };

/**
 * What /auth/callback should do with this query string. Only a PKCE `code` is
 * ever exchanged; a `token_hash` of any type is never verified (review ruling
 * R2: an attacker's own hash would sign the victim's browser into the
 * attacker's account).
 */
export function planAuthCallback(params: URLSearchParams): AuthCallbackPlan {
  const type = params.get("type");
  const recoveryHint = type === "recovery" || nextIsResetPage(params.get("next"));

  const code = params.get("code");
  if (code) return { kind: "exchange_code", code, recoveryHint };

  return recoveryHint ? { kind: "recovery_link_error" } : { kind: "fail" };
}

/**
 * After exchangeCodeForSession: where a recovery outcome lands, or null to let
 * the route carry on with its OAuth routing unchanged. `redirectType` is
 * supabase-js's own answer ("recovery" when the verifier was stored by
 * resetPasswordForEmail); the URL hint is the fallback.
 */
export function recoveryLandingAfterExchange(input: {
  ok: boolean;
  redirectType: string | null | undefined;
  recoveryHint: boolean;
}): string | null {
  const isRecovery = input.redirectType === "recovery" || input.recoveryHint;
  if (!isRecovery) return null;
  return input.ok ? RESET_PASSWORD_PATH : RESET_LINK_ERROR_PATH;
}

export type RecoverOutcome = "sent" | "captcha" | "network" | "server" | "invalid_email";

/**
 * How /forgot-password answers a resetPasswordForEmail result.
 *
 * GoTrue answers 200 for an address it does not know, so every answer that
 * could depend on whether the account exists collapses into "sent" (the
 * neutral «إن كان البريد مسجلاً…» message):
 *   - 429 over_email_send_rate_limit is per account: it fires only for a
 *     registered address that was sent a link moments ago — the link is
 *     already on its way, so the neutral message is still true;
 *   - a GoTrue API 5xx ("Error sending recovery email", SMTP down, or a send
 *     hook failing) comes only after GoTrue found the user, so it too is
 *     answered neutrally. A mail outage is therefore invisible here — the
 *     operator watches GoTrue's logs for 5xx on /recover. Nothing is logged
 *     in the browser either: the console would tell the same secret;
 *   - a timeout (504/524, including GoTrue's own request_timeout, which
 *     auth-js raises as a retryable 504): a hanging SMTP send only happens
 *     for a registered address, so a timeout is neutral too;
 *   - any API error this list does not name: unknown means neutral.
 * What is said differently cannot reveal an account:
 *   - captcha: checked before GoTrue looks the address up;
 *   - network (AuthRetryableFetchError, status 0) and validation (malformed
 *     address): no lookup;
 *   - gateway down (AuthRetryableFetchError with 502/503/520-523/530 —
 *     supabase-js raises it for those and for the timeouts above): the
 *     upstream was unreachable, the same for every address;
 *   - AuthUnknownError: the answer was not GoTrue's JSON at all (an HTML 500
 *     from a proxy, a wrong URL) — it never reached the lookup;
 *   - configuration refusals (ACCOUNT_INDEPENDENT_CODES, or a code-less
 *     401/403/404/405 such as the gateway's «Invalid API key»): decided
 *     before or without the lookup, the same for every address.
 */
const ACCOUNT_INDEPENDENT_CODES = new Set([
  "email_provider_disabled",
  "provider_disabled",
  "bad_json",
  "bad_jwt",
  "no_authorization",
]);
const ACCOUNT_INDEPENDENT_STATUSES = new Set([401, 403, 404, 405]);
/** Gateway timeouts: the upstream may have been busy sending a real email. */
const TIMEOUT_STATUSES = new Set([504, 524]);

export function classifyRecoverError(error: unknown): RecoverOutcome {
  if (!error || typeof error !== "object") return "sent";
  if (isCaptchaAuthError(error)) return "captcha";
  const { name, status, code } = error as { name?: unknown; status?: unknown; code?: unknown };
  if (name === "AuthRetryableFetchError") {
    if (status === 0 || status === undefined) return "network";
    return typeof status === "number" && TIMEOUT_STATUSES.has(status) ? "sent" : "server";
  }
  if (name === "AuthUnknownError") return "server";
  if (code === "validation_failed" || code === "email_address_invalid") return "invalid_email";
  if (typeof code === "string" && ACCOUNT_INDEPENDENT_CODES.has(code)) return "server";
  if (!code && typeof status === "number" && ACCOUNT_INDEPENDENT_STATUSES.has(status)) return "server";
  return "sent";
}

/** A cheap shape check before spending a captcha token; GoTrue has the last word. */
export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Did the link arrive broken? `?error=` is set by /auth/callback
 * (RESET_LINK_ERROR_PATH); `#error…` is GoTrue's own fragment, which the
 * browser carries across the callback's redirect and the server never sees.
 */
export function linkErrorInUrl(search: string, hash: string): boolean {
  if (new URLSearchParams(search).has("error")) return true;
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  return fragment.has("error") || fragment.has("error_code");
}

/**
 * The Settings password rule (validateNewPassword, MIN_PASSWORD_LENGTH) —
 * the same rule here, with an English wording for the English UI.
 */
export function resetPasswordProblem(password: string, confirm: string, isAr: boolean): string | null {
  const arabic = validateNewPassword(password, confirm);
  if (isAr || arabic === null) return arabic;
  if (!password) return "Enter a new password.";
  if (password.length < MIN_PASSWORD_LENGTH) return `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (!confirm) return "Type the new password again to confirm it.";
  return "The passwords do not match.";
}

/**
 * A failed updateUser on /reset-password. A missing session here means the
 * recovery link's session is gone (expired, or opened in another browser), so
 * the advice is a new link — not Settings' «سجّل الدخول من جديد».
 */
export function resetPasswordErrorMessage(error: unknown, isAr: boolean): string {
  const { name, message } = (error ?? {}) as { name?: unknown; message?: unknown };
  const raw = typeof message === "string" ? message : "";
  if (name === "AuthSessionMissingError" || /session.*missing|not authenticated|not.*logged in/i.test(raw)) {
    return isAr
      ? "انتهت صلاحية رابط الاستعادة — اطلب رابطاً جديداً من صفحة «نسيت كلمة المرور»."
      : "The reset link has expired — request a new one from the “Forgot password” page.";
  }
  // The shared translator (BUG-09): the same table as Settings, both languages.
  return translateAuthError(error, { context: "password", isAr });
}

/**
 * The Supabase auth cookies in this browser, by name. supabase-js names its
 * storage key `sb-${hostname.split(".")[0]}-auth-token` (so
 * `sb-auth-auth-token` for auth.nezamy.sa); @supabase/ssr splits a long value
 * into `${key}.${i}` chunks, and the PKCE verifier lives at
 * `${key}-code-verifier`. Nothing else of ours starts with "sb-".
 */
export function isSupabaseAuthCookieName(name: string): boolean {
  return /^sb-.+-auth-token(?:-code-verifier)?(?:\.\d+)?$/.test(name);
}

/**
 * The auth cookie names in a `document.cookie` string — what /reset-password
 * expires by hand when both server sign-outs failed. (auth-js signOut, local
 * scope included, calls the server first and keeps the session on a network
 * or 5xx error.) The cookies are httpOnly:false (@supabase/ssr defaults), so
 * the page can expire them.
 */
export function authCookieNamesToClear(cookieString: string): string[] {
  const names = cookieString
    .split(";")
    .map((part) => part.split("=")[0]?.trim() ?? "")
    .filter((name) => name && isSupabaseAuthCookieName(name));
  return [...new Set(names)];
}
