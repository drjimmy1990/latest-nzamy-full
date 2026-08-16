import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLegalOpinionIntake, LEGAL_OPINION_OUTPUT_TYPES } from "./orderIntake.legalOpinion.ts";

const valid = {
  schemaVersion: 1,
  service: "legal_opinion",
  outputType: "consult",
  topicArea: "عمالي",
  description: "أحتاج رأياً قانونياً حول إنهاء العقد",
  attachments: [],
};

test("accepts a well-formed intake", () => {
  const r = validateLegalOpinionIntake(valid);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.outputType, "consult");
});

test("accepts every underscore outputType from the brief", () => {
  for (const t of ["consult", "study", "memo", "research", "due_diligence", "cross_exam", "letter"]) {
    const r = validateLegalOpinionIntake({ ...valid, outputType: t });
    assert.equal(r.ok, true, `expected ${t} to be accepted`);
  }
});

test("rejects a non-object", () => {
  const r = validateLegalOpinionIntake(null);
  assert.equal(r.ok, false);
});

test("rejects an intake with wrong service discriminant", () => {
  const r = validateLegalOpinionIntake({ ...valid, service: "contracts" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الخدمة")));
});

test("rejects an intake with missing service key", () => {
  const r = validateLegalOpinionIntake({ ...valid, service: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الخدمة")));
});

test("rejects a missing required field (outputType)", () => {
  const r = validateLegalOpinionIntake({ ...valid, outputType: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("نوع")));
});

test("rejects a blank outputType", () => {
  const r = validateLegalOpinionIntake({ ...valid, outputType: "" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("نوع")));
});

test("rejects the UI's hyphenated identifiers — only the underscore set is valid here", () => {
  for (const t of ["legal-memo", "due-diligence", "cross-exam"]) {
    const r = validateLegalOpinionIntake({ ...valid, outputType: t });
    assert.equal(r.ok, false, `expected hyphenated ${t} to be rejected`);
  }
});

test("rejects an attachment missing documentId (malformed attachment)", () => {
  const r = validateLegalOpinionIntake({ ...valid, attachments: [{ name: "a.pdf", size: 10 }] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("المرفق")));
});

test("accepts a numeric documentId (PostgREST bigserial arrives as a JS number, not a string)", () => {
  const r = validateLegalOpinionIntake({ ...valid, attachments: [{ documentId: 789, name: "a.pdf", size: 10 }] });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.attachments.length, 1);
    assert.equal(r.value.attachments[0].documentId, "789");
    assert.equal(typeof r.value.attachments[0].documentId, "string");
  }
});

test("accepts the letter sub-flow with a settings/letter record", () => {
  const r = validateLegalOpinionIntake({ ...valid, outputType: "letter", letter: { recipient: "شركة س" }, settings: { depth: "deep" } });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(r.value.letter, { recipient: "شركة س" });
    assert.deepEqual(r.value.settings, { depth: "deep" });
  }
});

test("collects every error, not just the first", () => {
  const r = validateLegalOpinionIntake({ service: "wrong", outputType: "unknown", attachments: [{ name: "a.pdf" }] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.length >= 3);
});

// ── Coordinator ruling on af0929e: description minimum, letter exempt ──────
// "an order the admin cannot fulfil must not be submittable" — for the six
// non-letter sub-flows, description IS the request. letter is exempt: its
// content comes from the structured `letter` fields instead.

test("rejects a missing description for a non-letter outputType", () => {
  const r = validateLegalOpinionIntake({ ...valid, outputType: "consult", description: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("وصف الطلب")));
});

test("rejects a description shorter than 20 characters for a non-letter outputType", () => {
  const r = validateLegalOpinionIntake({ ...valid, outputType: "study", description: "قصير جداً" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("وصف الطلب")));
});

test("the description minimum applies to every non-letter outputType", () => {
  for (const t of ["consult", "study", "memo", "research", "due_diligence", "cross_exam"]) {
    const r = validateLegalOpinionIntake({ ...valid, outputType: t, description: undefined });
    assert.equal(r.ok, false, `expected ${t} to require a description`);
  }
});

test("letter is exempt from the description minimum — accepts an absent description", () => {
  const r = validateLegalOpinionIntake({ ...valid, outputType: "letter", description: undefined, letter: { recipient: "شركة س" } });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.description, undefined);
});

test("letter is exempt from the description minimum — accepts a short description", () => {
  const r = validateLegalOpinionIntake({ ...valid, outputType: "letter", description: "قصير", letter: { recipient: "شركة س" } });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.description, "قصير");
});
