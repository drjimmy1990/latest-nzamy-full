import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildPasswordCredentials,
  canSubmitWithCaptcha,
  captchaBlockedMessage,
  captchaReducer,
  captchaSubmitError,
  captchaTokenFor,
  initialCaptchaState,
  isCaptchaAuthError,
  normalizeSiteKey,
  withSignupCaptcha,
  type CaptchaState,
} from "./captcha.ts";

const READY: CaptchaState = { status: "ready", token: "tok-1" };

test("no site key → captcha off: nothing rendered, nothing sent, submit allowed", () => {
  for (const raw of [undefined, null, "", "   "]) {
    const state = initialCaptchaState(normalizeSiteKey(raw));
    assert.deepEqual(state, { status: "off" }, String(raw));
    assert.equal(canSubmitWithCaptcha(state), true);
    assert.equal(captchaTokenFor(state), undefined);
  }
});

test("a site key starts in loading, and loading locks the submit", () => {
  const state = initialCaptchaState(normalizeSiteKey(" 0x4AAA "));
  assert.deepEqual(state, { status: "loading" });
  assert.equal(canSubmitWithCaptcha(state), false);
  assert.equal(captchaTokenFor(state), undefined);
});

test("only a ready token unlocks the submit and is the token sent", () => {
  const state = captchaReducer({ status: "loading" }, { type: "token", token: " tok-1 " });
  assert.deepEqual(state, READY);
  assert.equal(canSubmitWithCaptcha(state), true);
  assert.equal(captchaTokenFor(state), "tok-1");
});

test("an empty token from the widget is not a token", () => {
  assert.deepEqual(captchaReducer({ status: "loading" }, { type: "token", token: "  " }), { status: "loading" });
});

test("a spent token is gone: the next attempt needs a fresh challenge (no reuse)", () => {
  const spent = captchaReducer(READY, { type: "spent" });
  assert.deepEqual(spent, { status: "loading" });
  assert.equal(canSubmitWithCaptcha(spent), false);
  assert.equal(captchaTokenFor(spent), undefined);
});

test("expiry drops the token and locks the submit until Turnstile refreshes it", () => {
  const expired = captchaReducer(READY, { type: "expired" });
  assert.deepEqual(expired, { status: "expired" });
  assert.equal(canSubmitWithCaptcha(expired), false);
  assert.equal(captchaTokenFor(expired), undefined);
  assert.deepEqual(captchaReducer(expired, { type: "token", token: "tok-2" }), { status: "ready", token: "tok-2" });
});

test("every error locks the submit (fail closed) and a retry goes back to loading", () => {
  for (const reason of ["script", "challenge", "unsupported", "timeout"] as const) {
    const errored = captchaReducer(READY, { type: "error", reason });
    assert.deepEqual(errored, { status: "error", reason });
    assert.equal(canSubmitWithCaptcha(errored), false, reason);
    assert.equal(captchaTokenFor(errored), undefined, reason);
    assert.ok(captchaBlockedMessage(errored, true), reason);
    assert.ok(captchaBlockedMessage(errored, false), reason);
    assert.deepEqual(captchaReducer(errored, { type: "load" }), { status: "loading" });
  }
});

test("a blocked submit explains itself once: pending/expired in the form, errors only in the widget", () => {
  assert.equal(captchaSubmitError({ status: "loading" }, true), "أكمل التحقق الأمني أولاً");
  assert.ok(captchaSubmitError({ status: "expired" }, false));
  assert.equal(captchaSubmitError({ status: "error", reason: "script" }, true), "");
  assert.equal(captchaSubmitError(READY, true), "");
});

test("off stays off whatever the widget reports (no key → no widget to report)", () => {
  const off: CaptchaState = { status: "off" };
  for (const ev of [{ type: "token", token: "x" }, { type: "spent" }, { type: "error", reason: "script" }] as const) {
    assert.deepEqual(captchaReducer(off, ev), off);
  }
});

test("email and phone sign-in both carry the same captchaToken (CAP-01/02)", () => {
  assert.deepEqual(
    buildPasswordCredentials({ mode: "email", identifier: " a@b.sa ", phoneE164: null, password: " pw ", captchaToken: "tok" }),
    { email: "a@b.sa", password: "pw", options: { captchaToken: "tok" } },
  );
  assert.deepEqual(
    buildPasswordCredentials({ mode: "phone", identifier: "0555", phoneE164: "+966555555555", password: "pw", captchaToken: "tok" }),
    { phone: "+966555555555", password: "pw", options: { captchaToken: "tok" } },
  );
});

test("an invalid phone builds nothing (no request, so no token is spent)", () => {
  assert.equal(
    buildPasswordCredentials({ mode: "phone", identifier: "12", phoneE164: null, password: "pw", captchaToken: "tok" }),
    null,
  );
});

test("captcha off → credentials without options, exactly as before", () => {
  assert.deepEqual(
    buildPasswordCredentials({ mode: "email", identifier: "a@b.sa", phoneE164: null, password: "pw", captchaToken: undefined }),
    { email: "a@b.sa", password: "pw" },
  );
});

test("signup options keep the metadata object and add the token beside it", () => {
  const data = { user_type: "individual", phone: "+966555555555" };
  const withToken = withSignupCaptcha(data, "tok");
  assert.equal(withToken.data, data);
  assert.equal(withToken.captchaToken, "tok");
  assert.deepEqual(withSignupCaptcha(data, undefined), { data });
});

test("GoTrue's captcha refusal is recognised by code when there is one", () => {
  assert.equal(isCaptchaAuthError({ code: "captcha_failed", status: 400, message: "anything" }), true);
  // A code wins over the message: never re-label a real credential error.
  assert.equal(isCaptchaAuthError({ code: "invalid_credentials", status: 400, message: "captcha protection: request disallowed" }), false);
  assert.equal(isCaptchaAuthError(null), false);
  assert.equal(isCaptchaAuthError("captcha_failed"), false);
});

test("no code (API-version header not exposed): a 400 whose message names captcha", () => {
  assert.equal(isCaptchaAuthError({ status: 400, message: "captcha protection: request disallowed (no captcha response)" }), true);
  assert.equal(isCaptchaAuthError({ code: undefined, status: 400, message: "Captcha verification failed" }), true);
  assert.equal(isCaptchaAuthError({ status: 400, message: "Invalid login credentials" }), false);
  assert.equal(isCaptchaAuthError({ status: 500, message: "captcha verifier unreachable" }), false);
});

// ── Wiring: the three pages that call GoTrue's password endpoints ──────────
// Source checks, like postLoginPath.test.ts: a page that stops passing the
// token would only show up on the live server, as every login refused.

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("login builds its credentials through buildPasswordCredentials and spends the token", () => {
  const src = read("../../app/login/page.tsx");
  assert.match(src, /buildPasswordCredentials\(/);
  assert.match(src, /signInWithPassword\(credentials\)/);
  assert.match(src, /isCaptchaAuthError\(/);
  assert.match(src, /captcha\.spend\(\)/);
});

test("both signup forms send the token and spend it", () => {
  for (const p of ["../../app/register/client/page.tsx", "../../app/register/provider/page.tsx"]) {
    const src = read(p);
    assert.match(src, /withSignupCaptcha\(/, p);
    assert.match(src, /captcha\.spend\(\)/, p);
    assert.match(src, /isCaptchaAuthError\(/, p);
  }
});

test("the site key is read with a literal NEXT_PUBLIC_ reference (inlined at build)", () => {
  const src = read("../../components/auth/useTurnstile.ts");
  assert.match(src, /process\.env\.NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  assert.doesNotMatch(src, /TURNSTILE_SECRET|CAPTCHA_SECRET/);
});
