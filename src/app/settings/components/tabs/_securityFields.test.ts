import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_PASSWORD_LENGTH,
  validateNewPassword,
  arabicAuthError,
  SESSION_TIMEOUT_OPTIONS_MINUTES,
  sessionTimeoutLabel,
  normalizeSessionTimeout,
} from "./_securityFields.ts";

// ── validateNewPassword ──────────────────────────────────────────────

test("validateNewPassword rejects an empty password", () => {
  assert.equal(validateNewPassword("", ""), "أدخل كلمة المرور الجديدة.");
});

test("validateNewPassword rejects a password shorter than the minimum", () => {
  const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
  const msg = validateNewPassword(short, short);
  assert.match(msg ?? "", /٨ أحرف/);
});

test("validateNewPassword rejects a missing confirmation", () => {
  const pwd = "a".repeat(MIN_PASSWORD_LENGTH);
  assert.equal(validateNewPassword(pwd, ""), "أعد كتابة كلمة المرور الجديدة في حقل التأكيد.");
});

test("validateNewPassword rejects a mismatched confirmation", () => {
  const pwd = "a".repeat(MIN_PASSWORD_LENGTH);
  assert.equal(validateNewPassword(pwd, pwd + "x"), "كلمتا المرور غير متطابقتين.");
});

test("validateNewPassword accepts a valid matching pair at exactly the minimum length", () => {
  const pwd = "a".repeat(MIN_PASSWORD_LENGTH);
  assert.equal(validateNewPassword(pwd, pwd), null);
});

test("validateNewPassword accepts a valid matching pair above the minimum length", () => {
  const pwd = "a".repeat(MIN_PASSWORD_LENGTH + 5);
  assert.equal(validateNewPassword(pwd, pwd), null);
});

// ── arabicAuthError ───────────────────────────────────────────────────

test("arabicAuthError translates a too-short-password GoTrue message", () => {
  const msg = arabicAuthError(new Error("Password should be at least 6 characters."));
  assert.match(msg, /٨ أحرف/);
});

test("arabicAuthError translates a same-as-old-password GoTrue message", () => {
  const msg = arabicAuthError(new Error("New password should be different from the old password."));
  assert.equal(msg, "كلمة المرور الجديدة يجب أن تختلف عن الحالية.");
});

test("arabicAuthError translates a missing-session message", () => {
  const msg = arabicAuthError(new Error("Auth session missing!"));
  assert.match(msg, /سجّل الدخول/);
});

test("arabicAuthError passes through an already-Arabic message", () => {
  const msg = arabicAuthError(new Error("رسالة عربية من الخادم"));
  assert.equal(msg, "رسالة عربية من الخادم");
});

test("arabicAuthError falls back to the generic sentence for an unrecognized English message", () => {
  const msg = arabicAuthError(new Error("Some unrecognized GoTrue error"));
  assert.equal(msg, "تعذّر تحديث كلمة المرور. حاول مرة أخرى.");
});

test("arabicAuthError falls back to the generic sentence for a non-Error value", () => {
  assert.equal(arabicAuthError("boom"), "تعذّر تحديث كلمة المرور. حاول مرة أخرى.");
});

// ── session timeout ───────────────────────────────────────────────────

test("sessionTimeoutLabel renders Arabic-Indic digits for every offered option", () => {
  assert.equal(sessionTimeoutLabel(15), "١٥ دقيقة");
  assert.equal(sessionTimeoutLabel(60), "٦٠ دقيقة");
  assert.equal(sessionTimeoutLabel(240), "٢٤٠ دقيقة");
});

test("every offered session-timeout option is 11 or greater (singular tamyiz form is always correct)", () => {
  for (const minutes of SESSION_TIMEOUT_OPTIONS_MINUTES) {
    assert.ok(minutes >= 11, `${minutes} would need plural agreement, not the singular tamyiz`);
  }
});

test("normalizeSessionTimeout keeps a valid positive stored value", () => {
  assert.equal(normalizeSessionTimeout(30), 30);
});

test("normalizeSessionTimeout falls back to 60 for null, undefined, zero and negative values", () => {
  assert.equal(normalizeSessionTimeout(null), 60);
  assert.equal(normalizeSessionTimeout(undefined), 60);
  assert.equal(normalizeSessionTimeout(0), 60);
  assert.equal(normalizeSessionTimeout(-5), 60);
});

test("normalizeSessionTimeout rounds a fractional value", () => {
  assert.equal(normalizeSessionTimeout(45.6), 46);
});
