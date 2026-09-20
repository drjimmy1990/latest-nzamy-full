/**
 * route.test.ts — POST /api/v1/contact contract, exercised through the pure
 * validator the route delegates to. Run with:
 *   node --test src/app/api/v1/contact/route.test.ts
 *
 * UAT-CONTACT-001. Before this, `/api/v1/contact` inserted `phone` into
 * `public.contact_messages` and pushed it to the n8n WhatsApp workflow with no
 * validation at all, and `name` / `subject` / `message` had no length cap.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { validateContactPayload, CONTACT_AR, CONTACT_LIMITS } from "./_validate.ts";
import { normalizeSaudiMobile, saudiMobileMessage } from "../../../../lib/services/saudiMobile.ts";

const BASE = { name: "محمد", email: "user@example.com", message: "رسالة اختبار" };

test("email and message are required", () => {
  for (const body of [
    {},
    { email: "user@example.com" },
    { message: "رسالة" },
    { email: "  ", message: "رسالة" },
    { email: "user@example.com", message: "   " },
    { email: 42, message: "رسالة" },
  ]) {
    const result = validateContactPayload(body);
    assert.equal(result.ok, false, JSON.stringify(body));
    assert.equal(result.ok === false && result.error, CONTACT_AR.required);
  }
});

test("a malformed email is refused before anything is stored", () => {
  const result = validateContactPayload({ ...BASE, email: "not-an-email" });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error, CONTACT_AR.badEmail);
});

test("phone is optional — absent, empty and whitespace all yield null", () => {
  for (const phone of [undefined, "", "   ", null, 5]) {
    const result = validateContactPayload({ ...BASE, phone });
    assert.equal(result.ok, true, String(phone));
    assert.equal(result.ok === true && result.value.phoneE164, null);
  }
});

test("a non-empty phone must be a Saudi mobile — UAT-CONTACT-001", () => {
  // The 400 body carries the SPECIFIC reason, not one catch-all string, so
  // each case is asserted against the message its own reason produces.
  for (const [phone, reason] of [
    ["abc@example.com", "letters"],
    ["letters-and-email@example.test", "letters"],
    ["0112345678", "prefix"],
    ["+201012345678", "prefix"],
    ["+9660512345678", "prefix"],
    ["051234567", "length"],
    ["05123456789", "length"],
  ] as const) {
    const result = validateContactPayload({ ...BASE, phone });
    assert.equal(result.ok, false, phone);
    assert.equal(
      result.ok === false && result.error,
      saudiMobileMessage({ ok: false, reason }),
      phone,
    );
    // …and the reason the helper itself reports is the one asserted above.
    const parsed = normalizeSaudiMobile(phone);
    assert.equal(parsed.ok === false && parsed.reason, reason, phone);
  }
});

test("every accepted phone shape is stored as one E.164 value", () => {
  for (const phone of [
    "0512345678",
    "512345678",
    "966512345678",
    "00966512345678",
    "+966 51 234 5678",
    "٠٥١٢٣٤٥٦٧٨",
    "۰۵۱۲۳۴۵۶۷۸",
  ]) {
    const result = validateContactPayload({ ...BASE, phone });
    assert.equal(result.ok, true, phone);
    assert.equal(result.ok === true && result.value.phoneE164, "+966512345678", phone);
  }
});

test("name, subject and message are capped, each with its own Arabic message", () => {
  const long = (n: number) => "ا".repeat(n);

  const okName = validateContactPayload({ ...BASE, name: long(CONTACT_LIMITS.name) });
  assert.equal(okName.ok, true);
  const badName = validateContactPayload({ ...BASE, name: long(CONTACT_LIMITS.name + 1) });
  assert.equal(badName.ok === false && badName.error, CONTACT_AR.nameTooLong);

  const okSubject = validateContactPayload({ ...BASE, subject: long(CONTACT_LIMITS.subject) });
  assert.equal(okSubject.ok, true);
  const badSubject = validateContactPayload({ ...BASE, subject: long(CONTACT_LIMITS.subject + 1) });
  assert.equal(badSubject.ok === false && badSubject.error, CONTACT_AR.subjectTooLong);

  const okMessage = validateContactPayload({ ...BASE, message: long(CONTACT_LIMITS.message) });
  assert.equal(okMessage.ok, true);
  const badMessage = validateContactPayload({ ...BASE, message: long(CONTACT_LIMITS.message + 1) });
  assert.equal(badMessage.ok === false && badMessage.error, CONTACT_AR.messageTooLong);
});

test("the caps count the trimmed value, so padding cannot trip them", () => {
  const padded = `   ${"ا".repeat(CONTACT_LIMITS.name)}   `;
  const result = validateContactPayload({ ...BASE, name: padded });
  assert.equal(result.ok, true);
  assert.equal(result.ok === true && result.value.name.length, CONTACT_LIMITS.name);
});

test("kind falls back to 'contact' for anything but the literal 'partner'", () => {
  const partner = validateContactPayload({ ...BASE, kind: "partner" });
  assert.equal(partner.ok === true && partner.value.kind, "partner");
  for (const kind of [undefined, "", "admin", "Partner", 1]) {
    const result = validateContactPayload({ ...BASE, kind });
    assert.equal(result.ok === true && result.value.kind, "contact", String(kind));
  }
});

test("a non-object body is refused instead of throwing", () => {
  for (const body of [null, undefined, "string", 7]) {
    const result = validateContactPayload(body);
    assert.equal(result.ok, false, String(body));
  }
});
