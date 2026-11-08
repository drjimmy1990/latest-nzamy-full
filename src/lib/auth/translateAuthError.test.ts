import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MIN_PASSWORD_LENGTH, translateAuthError } from "./translateAuthError.ts";

const hasLatin = (s: string) => /[A-Za-z]/.test(s);
const signupAr = (err: unknown) => translateAuthError(err, { context: "signup", isAr: true });

// ── BUG-09: the GoTrue messages a sign-up actually receives ─────────────────

test("sign-up: every known GoTrue failure reads in Arabic, with no Latin letters", () => {
  const cases: Array<[unknown, RegExp]> = [
    [{ code: "user_already_exists", status: 422, message: "User already registered" }, /مسجل بالفعل/],
    [{ status: 400, message: "User already registered" }, /مسجل بالفعل/],
    [{ code: "weak_password", status: 422, message: "Password should be at least 8 characters.", reasons: ["length"] }, /ألا تقل عن/],
    [{ code: "weak_password", status: 422, message: "Password is known to be weak", reasons: ["pwned"] }, /تسريبات/],
    [{ code: "weak_password", status: 422, message: "Password should contain at least one character of each", reasons: ["characters"] }, /ضعيفة/],
    [{ status: 422, message: "Password should be at least 6 characters." }, /ألا تقل عن/],
    [{ code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" }, /عدد المحاولات/],
    [{ status: 429, message: "For security purposes, you can only request this after 30 seconds." }, /عدد المحاولات/],
    [{ code: "email_address_invalid", status: 400, message: "Email address \"x@y\" is invalid" }, /البريد الإلكتروني غير صحيحة/],
    [{ code: "validation_failed", status: 400, message: "Unable to validate email address: invalid format" }, /البريد الإلكتروني غير صحيحة/],
    [{ code: "validation_failed", status: 400, message: "Invalid phone number format (E.164 required)" }, /الجوال غير صحيح/],
    [{ code: "signup_disabled", status: 422, message: "Signups not allowed for this instance" }, /غير متاح/],
    [{ status: 422, message: "Signups not allowed for this instance" }, /غير متاح/],
    [{ code: "email_provider_disabled", status: 422, message: "Email signups are disabled" }, /غير متاح/],
    [{ code: "phone_exists", status: 422, message: "Phone number already registered" }, /الجوال مسجل/],
    [{ code: "unexpected_failure", status: 500, message: "Database error saving new user" }, /خطأ في الخادم/],
    [{ status: 500, message: "Database error saving new user" }, /خطأ في الخادم/],
    [{ status: 500, message: "Error sending confirmation email" }, /رسالة التأكيد/],
    [{ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" }, /الاتصال بالخادم/],
    [new TypeError("Failed to fetch"), /الاتصال بالخادم/],
  ];
  for (const [err, expected] of cases) {
    const msg = signupAr(err);
    assert.match(msg, expected, JSON.stringify(err));
    assert.ok(!hasLatin(msg), `raw English leaked for ${JSON.stringify(err)}: ${msg}`);
  }
});

test("sign-up: an unknown English message falls back to one Arabic sentence, never the raw text", () => {
  const msg = signupAr({ status: 400, message: "Something nobody has seen before" });
  assert.equal(msg, "تعذّر إنشاء الحساب. حاول مرة أخرى بعد قليل.");
  assert.equal(signupAr(null), "تعذّر إنشاء الحساب. حاول مرة أخرى بعد قليل.");
  assert.equal(signupAr("boom"), "تعذّر إنشاء الحساب. حاول مرة أخرى بعد قليل.");
  assert.equal(signupAr({ status: 503, message: "upstream unavailable" }), "حدث خطأ في الخادم. حاول مرة أخرى بعد قليل.");
});

test("an already-Arabic message passes through on an Arabic screen only", () => {
  assert.equal(signupAr({ message: "رسالة عربية من الخادم" }), "رسالة عربية من الخادم");
  const en = translateAuthError({ message: "رسالة عربية من الخادم" }, { context: "signup", isAr: false });
  assert.equal(en, "The account could not be created. Please try again shortly.");
});

test("the CAPTCHA refusal keeps captcha.ts's own wording", () => {
  assert.match(signupAr({ code: "captcha_failed", status: 400, message: "captcha protection" }), /التحقق الأمني/);
  assert.match(translateAuthError({ code: "captcha_failed", status: 400 }, { context: "login", isAr: true }), /التحقق الأمني/);
});

test("the English screen gets English, never Arabic", () => {
  const en = (err: unknown) => translateAuthError(err, { context: "signup", isAr: false });
  assert.equal(en({ status: 400, message: "User already registered" }), "This email is already registered");
  assert.equal(en({ code: "over_request_rate_limit", status: 429 }), "Too many attempts. Wait a moment, then try again.");
  assert.equal(en({ code: "weak_password", reasons: ["length"] }), `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
});

// ── Sign-in: CAP-06, one message for every credential failure ───────────────

test("sign-in never tells a wrong password from an unknown account", () => {
  const login = (err: unknown) => translateAuthError(err, { context: "login", isAr: true });
  assert.equal(login({ code: "invalid_credentials", status: 400, message: "Invalid login credentials" }), "بيانات الدخول غير صحيحة");
  assert.equal(login({ code: "user_not_found", status: 400, message: "User not found" }), "بيانات الدخول غير صحيحة");
  assert.equal(login({ status: 400, message: "User already registered" }), "بيانات الدخول غير صحيحة");
  assert.equal(login({ status: 400, message: "anything else" }), "بيانات الدخول غير صحيحة");
});

test("sign-in names only what says nothing about the account", () => {
  const login = (err: unknown) => translateAuthError(err, { context: "login", isAr: true });
  assert.match(login({ code: "over_request_rate_limit", status: 429 }), /عدد المحاولات/);
  assert.match(login({ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" }), /الاتصال بالخادم/);
  assert.match(login({ code: "email_not_confirmed", status: 400, message: "Email not confirmed" }), /لم يُؤكَّد بريدك/);
});

// ── Password change / reset: the Settings table is unchanged ────────────────

test("password context keeps the Settings sentences", () => {
  const pwd = (err: unknown) => translateAuthError(err, { context: "password", isAr: true });
  assert.match(pwd(new Error("New password should be different from the old password.")), /تختلف/);
  assert.match(pwd(new Error("Auth session missing!")), /انتهت الجلسة/);
  assert.equal(pwd(new Error("Some unrecognized GoTrue error")), "تعذّر تحديث كلمة المرور. حاول مرة أخرى.");
  assert.match(translateAuthError({ code: "otp_expired", message: "Token has expired or is invalid" }, { context: "otp", isAr: true }), /انتهت صلاحية الرمز/);
});

// ── Wiring: no auth form prints a raw GoTrue message ────────────────────────

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("both registration forms translate the sign-up error and never render error.message", () => {
  for (const p of ["../../app/register/client/page.tsx", "../../app/register/provider/page.tsx"]) {
    const src = read(p);
    assert.match(src, /translateAuthError\(error, \{ context: "signup", isAr \}\)/, p);
    assert.doesNotMatch(src, /:\s*error\.message\b/, p);
    assert.doesNotMatch(src, /"User already registered"/, p);
    // The button can never stay spinning: every path ends in the finally.
    assert.match(src, /finally \{\s*setAuthLoading\(false\);/, p);
  }
});

test("sign-in, Settings and the reset page go through the same translator", () => {
  assert.match(read("../../app/login/page.tsx"), /translateAuthError\(authError, \{ context: "login", isAr \}\)/);
  assert.match(read("../../app/settings/components/tabs/_securityFields.ts"), /translateAuthError\(err, \{ context: "password"/);
  assert.match(read("./passwordRecovery.ts"), /translateAuthError\(error, \{ context: "password", isAr \}\)/);
});
