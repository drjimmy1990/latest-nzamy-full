import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RESET_PASSWORD_PATH,
  RESET_LINK_ERROR_PATH,
  recoveryRedirectTo,
  planAuthCallback,
  recoveryLandingAfterExchange,
  classifyRecoverError,
  isPlausibleEmail,
  linkErrorInUrl,
  resetPasswordProblem,
  resetPasswordErrorMessage,
} from "./passwordRecovery.ts";

const params = (q: string) => new URLSearchParams(q);

test("the reset email points at the callback, which then sends the person to /reset-password", () => {
  const url = new URL(recoveryRedirectTo("https://nezamy.sa"));
  assert.equal(url.origin, "https://nezamy.sa");
  assert.equal(url.pathname, "/auth/callback");
  assert.equal(url.searchParams.get("next"), RESET_PASSWORD_PATH);
  assert.equal(RESET_PASSWORD_PATH, "/reset-password");
});

test("callback plan: a PKCE code is exchanged, with the recovery hint when next is /reset-password", () => {
  assert.deepEqual(planAuthCallback(params("code=abc")), { kind: "exchange_code", code: "abc", recoveryHint: false });
  assert.deepEqual(planAuthCallback(params("code=abc&next=/reset-password")), {
    kind: "exchange_code",
    code: "abc",
    recoveryHint: true,
  });
  assert.deepEqual(planAuthCallback(params("code=abc&next=%2Freset-password")), {
    kind: "exchange_code",
    code: "abc",
    recoveryHint: true,
  });
});

test("callback plan: a token_hash is verified only for type=recovery", () => {
  assert.deepEqual(planAuthCallback(params("token_hash=h1&type=recovery")), {
    kind: "verify_recovery_hash",
    tokenHash: "h1",
  });
  for (const t of ["signup", "magiclink", "invite", "email_change", "email", ""]) {
    assert.deepEqual(planAuthCallback(params(`token_hash=h1&type=${t}`)), { kind: "fail" }, t);
  }
});

test("callback plan: a recovery link GoTrue already refused (no code) goes to the honest error, not to /login", () => {
  assert.deepEqual(
    planAuthCallback(params("next=/reset-password&error=access_denied&error_code=otp_expired")),
    { kind: "recovery_link_error" },
  );
  assert.deepEqual(planAuthCallback(params("type=recovery")), { kind: "recovery_link_error" });
  // Nothing at all, or an OAuth error with no recovery hint: the old /login path.
  assert.deepEqual(planAuthCallback(params("")), { kind: "fail" });
  assert.deepEqual(planAuthCallback(params("error=access_denied")), { kind: "fail" });
});

test("callback plan: an off-site or smuggled next never counts as the reset page", () => {
  for (const n of [
    "https://evil.example/reset-password",
    "//evil.example/reset-password",
    "/\\evil.example/reset-password",
    "/%09/evil.example",
    "/reset-password-not",
    "/reset-passwordx",
  ]) {
    assert.deepEqual(planAuthCallback(params(`code=c&next=${encodeURIComponent(n)}`)), {
      kind: "exchange_code",
      code: "c",
      recoveryHint: false,
    }, n);
  }
  // A query on the reset page itself is still the reset page.
  assert.equal(
    (planAuthCallback(params(`code=c&next=${encodeURIComponent("/reset-password?x=1")}`)) as { recoveryHint: boolean }).recoveryHint,
    true,
  );
});

test("after the exchange: a recovery session always lands on /reset-password, never a dashboard", () => {
  assert.equal(recoveryLandingAfterExchange({ ok: true, redirectType: "recovery", recoveryHint: false }), RESET_PASSWORD_PATH);
  assert.equal(recoveryLandingAfterExchange({ ok: true, redirectType: null, recoveryHint: true }), RESET_PASSWORD_PATH);
  assert.equal(recoveryLandingAfterExchange({ ok: false, redirectType: null, recoveryHint: true }), RESET_LINK_ERROR_PATH);
  // Ordinary OAuth: not this helper's business — the route carries on as before.
  assert.equal(recoveryLandingAfterExchange({ ok: true, redirectType: null, recoveryHint: false }), null);
  assert.equal(recoveryLandingAfterExchange({ ok: false, redirectType: null, recoveryHint: false }), null);
  assert.equal(RESET_LINK_ERROR_PATH, "/reset-password?error=link");
});

test("recover errors: only network, server and captcha failures differ from the neutral answer", () => {
  assert.equal(classifyRecoverError(null), "sent");
  assert.equal(classifyRecoverError({ code: "captcha_failed", status: 400, message: "captcha protection: request disallowed" }), "captcha");
  assert.equal(classifyRecoverError({ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" }), "network");
  assert.equal(classifyRecoverError({ name: "AuthRetryableFetchError", status: 503, message: "" }), "server");
  assert.equal(classifyRecoverError({ name: "AuthApiError", status: 500, message: "Error sending recovery email" }), "server");
  assert.equal(classifyRecoverError({ code: "validation_failed", status: 400, message: "Unable to validate email address: invalid format" }), "invalid_email");
  // GoTrue's per-account resend limit only fires for a registered address that
  // was just sent a link — telling it apart would say the account exists.
  assert.equal(classifyRecoverError({ code: "over_email_send_rate_limit", status: 429, message: "For security purposes, you can only request this after 42 seconds." }), "sent");
  assert.equal(classifyRecoverError({ status: 422, message: "something else" }), "sent");
});

test("email shape check", () => {
  for (const ok of ["a@b.co", " lawyer@nezamy.sa ", "x.y+z@sub.example.com"]) assert.equal(isPlausibleEmail(ok), true, ok);
  for (const bad of ["", "a", "a@b", "@b.co", "a b@c.co", "0551234567"]) assert.equal(isPlausibleEmail(bad), false, bad);
});

test("link errors are read from the query (callback) and the fragment (GoTrue implicit redirect)", () => {
  assert.equal(linkErrorInUrl("?error=link", ""), true);
  assert.equal(linkErrorInUrl("", "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid"), true);
  assert.equal(linkErrorInUrl("", "#error_code=otp_expired"), true);
  assert.equal(linkErrorInUrl("", ""), false);
  assert.equal(linkErrorInUrl("?x=1", "#section"), false);
});

test("new password rule: the Settings rule in Arabic, and the same rule in English", () => {
  assert.equal(resetPasswordProblem("", "", true), "أدخل كلمة المرور الجديدة.");
  assert.match(resetPasswordProblem("short", "short", true) ?? "", /لا تقل عن ٨/);
  assert.equal(resetPasswordProblem("longenough", "different1", true), "كلمتا المرور غير متطابقتين.");
  assert.equal(resetPasswordProblem("longenough", "longenough", true), null);
  assert.match(resetPasswordProblem("short", "short", false) ?? "", /at least 8/);
  assert.match(resetPasswordProblem("longenough", "", false) ?? "", /confirm/i);
  assert.match(resetPasswordProblem("longenough", "other-one", false) ?? "", /match/i);
  assert.equal(resetPasswordProblem("longenough", "longenough", false), null);
});

test("a lost recovery session says the link expired and points at /forgot-password, not «سجّل الدخول»", () => {
  const ar = resetPasswordErrorMessage({ name: "AuthSessionMissingError", message: "Auth session missing!" }, true);
  assert.match(ar, /رابط الاستعادة/);
  assert.match(ar, /نسيت كلمة المرور/);
  assert.doesNotMatch(ar, /سجّل الدخول/);
  const en = resetPasswordErrorMessage({ name: "AuthSessionMissingError", message: "Auth session missing!" }, false);
  assert.match(en, /link/i);
  // Everything else reuses the Settings translation.
  assert.match(resetPasswordErrorMessage(new Error("New password should be different from the old password."), true), /تختلف/);
});
