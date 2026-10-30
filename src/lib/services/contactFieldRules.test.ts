import test from "node:test";
import assert from "node:assert/strict";
import {
  FORMAT_ONLY_NOTE,
  checkContactPair,
  checkNationalIdFormat,
  checkOptionalEmail,
  checkSaudiPhone,
  phoneAllowsUnified,
} from "./contactFieldRules.ts";

// The owner's own reproduction values (package 2026-10-30, LIVE-F39 / LIVE-F22).
test("refuses the owner's sample values", () => {
  assert.equal(checkSaudiPhone("000").ok, false);
  assert.equal(checkSaudiPhone("0000000000").ok, false);
  assert.equal(checkOptionalEmail("not-an-email").ok, false);
  assert.equal(checkNationalIdFormat("0000000000").ok, false);
  const pair = checkContactPair({ phone: "000", email: "not-an-email" });
  assert.equal(pair.ok, false);
  if (!pair.ok) assert.equal(pair.field, "phone");
});

test("optional fields left empty pass as null", () => {
  for (const blank of [undefined, null, "", "   "]) {
    assert.deepEqual(checkSaudiPhone(blank), { ok: true, value: null });
    assert.deepEqual(checkOptionalEmail(blank), { ok: true, value: null });
    assert.deepEqual(checkNationalIdFormat(blank), { ok: true, value: null });
  }
  assert.deepEqual(checkContactPair({}), { ok: true, phone: null, email: null });
});

test("required fields left empty are refused with a field-specific message", () => {
  const phone = checkSaudiPhone("", { required: true });
  assert.equal(phone.ok, false);
  if (!phone.ok) assert.match(phone.error, /الجوال/);
  const id = checkNationalIdFormat(" ", { required: true });
  assert.equal(id.ok, false);
  if (!id.ok) assert.match(id.error, /الهوية/);
});

test("a valid mobile is stored as E.164 whatever the typed form", () => {
  for (const typed of ["0512345678", "+966 51 234 5678", "٠٥١٢٣٤٥٦٧٨", "00966512345678"]) {
    assert.deepEqual(checkSaudiPhone(typed), { ok: true, value: "+966512345678" });
  }
});

test("a 920 number is accepted only for an entity, never for a person", () => {
  assert.equal(checkSaudiPhone("920012345").ok, false);
  assert.deepEqual(checkSaudiPhone("920012345", { allowUnified: true }), { ok: true, value: "920012345" });
  assert.equal(phoneAllowsUnified("individual"), false);
  assert.equal(phoneAllowsUnified("company"), true);
  assert.equal(phoneAllowsUnified("government"), true);
  assert.equal(phoneAllowsUnified(undefined), false);
});

test("phone messages name the rule that failed", () => {
  const short = checkSaudiPhone("05123");
  assert.equal(short.ok, false);
  if (!short.ok) assert.match(short.error, /١٠ أرقام/);
  const letters = checkSaudiPhone("05abc");
  assert.equal(letters.ok, false);
  if (!letters.ok) assert.match(letters.error, /أرقام فقط/);
});

test("non-string values are refused, not coerced", () => {
  assert.equal(checkSaudiPhone(512345678 as unknown).ok, false);
  assert.equal(checkOptionalEmail({} as unknown).ok, false);
  assert.equal(checkNationalIdFormat(1234567890 as unknown).ok, false);
});

test("e-mail is trimmed and shape-checked", () => {
  assert.deepEqual(checkOptionalEmail("  a.b@example.sa "), { ok: true, value: "a.b@example.sa" });
  for (const bad of ["a@b", "a b@c.sa", "@x.sa", "a@@b.sa", `${"x".repeat(250)}@e.sa`]) {
    assert.equal(checkOptionalEmail(bad).ok, false, bad);
  }
});

test("national ID: format only, normalised digits", () => {
  assert.deepEqual(checkNationalIdFormat("١٠١٢٣٤٥٦٧٨"), { ok: true, value: "1012345678" });
  assert.deepEqual(checkNationalIdFormat("2012345678"), { ok: true, value: "2012345678" });
  assert.equal(checkNationalIdFormat("3012345678").ok, false);
  assert.equal(checkNationalIdFormat("101234567").ok, false);
});

test("no message claims the identity was verified", () => {
  const messages = [
    checkSaudiPhone("000"), checkOptionalEmail("x"), checkNationalIdFormat("0"),
  ].map((r) => (r.ok ? "" : r.error));
  for (const m of [...messages, FORMAT_ONLY_NOTE]) {
    assert.doesNotMatch(m, /تم التحقق|موثَّق|موثق|مؤكَّد/);
  }
  assert.match(FORMAT_ONLY_NOTE, /صيغة/);
});
