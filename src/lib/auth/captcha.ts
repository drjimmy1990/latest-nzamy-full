/**
 * CAPTCHA (Cloudflare Turnstile) for the password flows — owner item
 * OWNER-SEC-01, 2026-10-30. Pure: no React, no DOM, no process.env, so
 * `node --test` loads it as it is (captcha.test.ts).
 *
 * WHERE THE PROTECTION ACTUALLY LIVES. Not here. The browser cannot prove
 * anything to itself: a script can call GoTrue directly and skip this whole
 * page. The check that matters is GoTrue's own (`verifyCaptcha` in
 * supabase/auth internal/api/middleware.go), switched on with
 * GOTRUE_SECURITY_CAPTCHA_ENABLED/_PROVIDER/_SECRET on the auth server
 * (docs/security/captcha-turnstile-operator-guide.md). Once it is on, GoTrue
 * refuses — before it even looks at the password — every request to
 *   POST /token?grant_type=password   (email AND phone sign-in)
 *   POST /signup, /recover, /otp, /resend, /magiclink
 * that does not carry `gotrue_meta_security.captcha_token` accepted by
 * Cloudflare's siteverify. supabase-js puts `options.captchaToken` there.
 *
 * What GoTrue deliberately does NOT check (isIgnoreCaptchaRoute):
 *   - grant_type=refresh_token → a live session refreshing itself never
 *     meets a challenge (CAP-10);
 *   - grant_type=pkce / id_token and GET /authorize → Google OAuth is NOT
 *     covered by this token (CAP-11; see the guide);
 *   - requests carrying the service-role key (admin API) → server-side code
 *     only; there is no account-based bypass of any kind.
 *
 * This module only does the bookkeeping the browser needs: one token per
 * attempt, never reused (Turnstile tokens are single-use and live 300 s),
 * and a GoTrue captcha refusal told apart from a wrong password.
 */

/**
 * The widget's state. `token` is present only in "ready" — there is no other
 * place a submit can read one from, so a spent or expired token cannot leak
 * into a second attempt.
 */
export type CaptchaState =
  | { status: "off" } // no site key in this build: render nothing, send nothing
  | { status: "loading" } // script loading / challenge running
  | { status: "ready"; token: string }
  | { status: "expired" } // token outlived its 300 s; Turnstile refreshes it
  | { status: "error"; reason: CaptchaErrorReason };

export type CaptchaErrorReason =
  | "script" // api.js failed to load or timed out (blocked, offline)
  | "challenge" // Turnstile's error-callback
  | "unsupported" // browser Turnstile does not support
  | "timeout"; // interactive challenge not solved in time

export type CaptchaEvent =
  | { type: "load" } // (re)render started
  | { type: "token"; token: string }
  | { type: "expired" }
  | { type: "error"; reason: CaptchaErrorReason }
  | { type: "spent" }; // the token was sent to GoTrue: it is gone either way

export function initialCaptchaState(siteKey: string | null): CaptchaState {
  return siteKey ? { status: "loading" } : { status: "off" };
}

export function captchaReducer(state: CaptchaState, event: CaptchaEvent): CaptchaState {
  // "off" is decided at build time by the site key; nothing turns it on.
  if (state.status === "off") return state;
  switch (event.type) {
    case "load":
    case "spent":
      // After a spend the widget is reset and runs a fresh challenge.
      return { status: "loading" };
    case "token": {
      const token = event.token.trim();
      return token ? { status: "ready", token } : { status: "loading" };
    }
    case "expired":
      return { status: "expired" };
    case "error":
      return { status: "error", reason: event.reason };
  }
}

/**
 * The site key as the build inlined it, or null. Takes the raw value so the
 * caller keeps the literal `process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY`
 * (Next only inlines literal references).
 */
export function normalizeSiteKey(raw: string | undefined | null): string | null {
  const key = (raw ?? "").trim();
  return key ? key : null;
}

/**
 * May the form submit now? With no site key the answer is always yes — the
 * auth server is then the only judge (and with its check on, it refuses).
 * With a key, only a live token unlocks the button: there is no "skip".
 */
export function canSubmitWithCaptcha(state: CaptchaState): boolean {
  return state.status === "off" || state.status === "ready";
}

/** The token to send for this attempt, or undefined when captcha is off. */
export function captchaTokenFor(state: CaptchaState): string | undefined {
  return state.status === "ready" ? state.token : undefined;
}

export type PasswordCredentials =
  | { email: string; password: string; options?: { captchaToken: string } }
  | { phone: string; password: string; options?: { captchaToken: string } };

/**
 * The argument for `supabase.auth.signInWithPassword`, for both login modes.
 * One function so the email and the phone branch cannot drift apart: the
 * phone path carries the same token as the email path (CAP-02).
 * `phoneE164` is the already-normalised number, or null when it was invalid.
 */
export function buildPasswordCredentials(input: {
  mode: "email" | "phone";
  identifier: string;
  phoneE164: string | null;
  password: string;
  captchaToken: string | undefined;
}): PasswordCredentials | null {
  const options = input.captchaToken ? { options: { captchaToken: input.captchaToken } } : {};
  if (input.mode === "email") {
    return { email: input.identifier.trim(), password: input.password.trim(), ...options };
  }
  if (!input.phoneE164) return null;
  return { phone: input.phoneE164, password: input.password.trim(), ...options };
}

/**
 * `options` for `supabase.auth.signUp`, with the token beside the metadata.
 * The metadata object is passed through untouched.
 */
export function withSignupCaptcha<T extends Record<string, unknown>>(
  data: T,
  captchaToken: string | undefined,
): { data: T; captchaToken?: string } {
  return captchaToken ? { data, captchaToken } : { data };
}

/**
 * Was this auth error GoTrue's captcha refusal? By `code` only — the message
 * text ("captcha protection: request disallowed (…)") is not a contract.
 */
export function isCaptchaAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: unknown }).code === "captcha_failed";
}

const MESSAGES = {
  ar: {
    captchaRejected: "تعذّر اجتياز التحقق الأمني — أكمل التحقق مرة أخرى ثم أعد المحاولة",
    captchaPending: "أكمل التحقق الأمني أولاً",
    captchaExpired: "انتهت صلاحية التحقق الأمني — يجري تجديده، انتظر لحظة",
    script: "تعذّر تحميل التحقق الأمني — تحقق من الاتصال ثم اضغط «إعادة المحاولة»",
    challenge: "تعذّر إكمال التحقق الأمني — اضغط «إعادة المحاولة»",
    unsupported: "متصفحك لا يدعم التحقق الأمني — حدّثه أو جرّب متصفحاً آخر",
    timeout: "انتهى وقت التحقق الأمني — اضغط «إعادة المحاولة»",
    retry: "إعادة المحاولة",
    loading: "جارٍ تحميل التحقق الأمني…",
  },
  en: {
    captchaRejected: "The security check was not accepted — complete it again, then retry",
    captchaPending: "Complete the security check first",
    captchaExpired: "The security check expired — it is refreshing, wait a moment",
    script: "The security check could not load — check your connection, then press Retry",
    challenge: "The security check could not be completed — press Retry",
    unsupported: "Your browser does not support the security check — update it or try another browser",
    timeout: "The security check timed out — press Retry",
    retry: "Retry",
    loading: "Loading security check…",
  },
} as const;

export type CaptchaMessageKey = keyof (typeof MESSAGES)["en"];

export function captchaMessage(key: CaptchaMessageKey, isAr: boolean): string {
  return (isAr ? MESSAGES.ar : MESSAGES.en)[key];
}

/**
 * The form's own error line when a submit is refused for want of a token.
 * Empty for an error: the widget's alert (with its focused retry button)
 * already says it, and saying it twice reads as two problems.
 */
export function captchaSubmitError(state: CaptchaState, isAr: boolean): string {
  if (state.status === "error") return "";
  return captchaBlockedMessage(state, isAr) ?? "";
}

/** Why the submit button is locked, for the hint under the widget. */
export function captchaBlockedMessage(state: CaptchaState, isAr: boolean): string | null {
  switch (state.status) {
    case "off":
    case "ready":
      return null;
    case "loading":
      return captchaMessage("captchaPending", isAr);
    case "expired":
      return captchaMessage("captchaExpired", isAr);
    case "error":
      return captchaMessage(state.reason, isAr);
  }
}
