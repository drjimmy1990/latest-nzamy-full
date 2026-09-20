import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSaudiMobile,
  sanitizePhoneDigits,
  toAsciiDigits,
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
    assert.equal(normalizeSaudiMobile(input), "+966512345678", input);
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
    assert.equal(normalizeSaudiMobile(input), null, String(input));
  }
});

test("numeric input sanitizer blocks letters and normalizes Arabic digits", () => {
  assert.equal(sanitizePhoneDigits("٠٥a١-٢ ٣x٤٥٦٧٨"), "0512345678");
  assert.equal(sanitizePhoneDigits("name@firm.com"), "");
  assert.equal(toAsciiDigits("٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹"), "0123456789 0123456789");
});
