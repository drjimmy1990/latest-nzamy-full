import test from "node:test";
import assert from "node:assert/strict";
import {
  hasValidSaudiMobile,
  normalizeSaudiMobile,
  sanitizePhoneDigits,
  saudiMobileMessage,
  saudiMobileOrNull,
  toAsciiDigits,
  type SaudiMobileReason,
} from "./saudiMobile.ts";

test("normalizes supported Saudi mobile forms to one E.164 value", () => {
  for (const input of [
    "0512345678",
    "512345678",
    "966512345678",
    "00966512345678",
    "+966 51 234 5678",
    "٠٥١٢٣٤٥٦٧٨",
  ]) {
    const result = normalizeSaudiMobile(input);
    assert.equal(result.ok, true, input);
    assert.equal(result.ok && result.e164, "+966512345678", input);
  }
});

test("rejects malformed, non-mobile and non-Saudi values", () => {
  for (const input of [
    "",
    "email@example.com",
    "+9660512345678",
    "0112345678",
    "+201012345678",
    "051234567",
    "05123456789",
    null,
  ]) {
    assert.equal(normalizeSaudiMobile(input).ok, false, String(input));
    assert.equal(saudiMobileOrNull(input), null, String(input));
  }
});

// ─── Result shape: WHY a value was refused — appendix 03 §(a) ───────────────
// Every caller used to write its own «رقم الجوال غير صحيح» beside a `null`,
// which told the user nothing about which of the four things they got wrong.

test("an empty or absent value reports `empty`", () => {
  for (const input of ["", "   ", "​", null, undefined, 5, {}]) {
    const result = normalizeSaudiMobile(input);
    assert.equal(result.ok === false && result.reason, "empty", String(input));
  }
});

test("anything with letters in it reports `letters`", () => {
  for (const input of [
    "email@example.com",
    "letters-and-email@example.test",
    "05abc45678",
    "٠٥abc٤٥٦٧٨",
  ]) {
    const result = normalizeSaudiMobile(input);
    assert.equal(result.ok === false && result.reason, "letters", input);
  }
});

test("a Saudi mobile with the wrong number of digits reports `length`", () => {
  for (const input of ["051234567", "05123456789", "5123456", "+96651234567"]) {
    const result = normalizeSaudiMobile(input);
    assert.equal(result.ok === false && result.reason, "length", input);
  }
});

test("a number that is not a Saudi mobile at all reports `prefix`", () => {
  for (const input of ["+201012345678", "0112345678", "+9660512345678", "0212345678"]) {
    const result = normalizeSaudiMobile(input);
    assert.equal(result.ok === false && result.reason, "prefix", input);
  }
});

test("the widened strip set accepts dots, underscores, slashes and invisible marks", () => {
  for (const input of [
    "05.12.34.56.78",
    "05_12_34_56_78",
    "05/12/34/56/78",
    "​0512345678",
    " 05 1234 5678",
    "‎+966 51-234-5678",
  ]) {
    const result = normalizeSaudiMobile(input);
    assert.equal(result.ok, true, JSON.stringify(input));
    assert.equal(result.ok && result.e164, "+966512345678", JSON.stringify(input));
  }
});

test("saudiMobileMessage gives one Arabic line per reason and nothing on success", () => {
  const reasons: SaudiMobileReason[] = ["empty", "letters", "length", "prefix"];
  const messages = reasons.map((reason) => saudiMobileMessage({ ok: false, reason }));
  for (const message of messages) {
    assert.ok(message.length > 0);
    assert.match(message, /[؀-ۿ]/, `not Arabic: ${message}`);
  }
  assert.equal(new Set(messages).size, reasons.length, "two reasons share a message");
  assert.equal(saudiMobileMessage({ ok: true, e164: "+966512345678" }), "");
});

test("saudiMobileOrNull is the old contract, unchanged", () => {
  assert.equal(saudiMobileOrNull("٠٥١٢٣٤٥٦٧٨"), "+966512345678");
  assert.equal(saudiMobileOrNull("0512345678"), "+966512345678");
  assert.equal(saudiMobileOrNull("not a phone"), null);
});

test("hasValidSaudiMobile answers the onboarding gate's question, not a presence test", () => {
  // UAT-REG-002 / appendix 03 §5: src/proxy.ts used to pass
  // `(profile?.phone ?? "").trim() !== ""`, which the row the UAT wrote passed.
  for (const stored of ["letters-and-email@example.test", "", "   ", "0112345678", null]) {
    assert.equal(hasValidSaudiMobile(stored), false, String(stored));
  }
  for (const stored of ["+966512345678", "0512345678", "00966512345678", "٠٥١٢٣٤٥٦٧٨"]) {
    assert.equal(hasValidSaudiMobile(stored), true, stored);
  }
});

test("numeric input sanitizer blocks letters and normalizes Arabic digits", () => {
  assert.equal(sanitizePhoneDigits("٠٥a١-٢ ٣x٤٥٦٧٨"), "0512345678");
  assert.equal(sanitizePhoneDigits("name@firm.com"), "");
  assert.equal(toAsciiDigits("٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹"), "0123456789 0123456789");
});
