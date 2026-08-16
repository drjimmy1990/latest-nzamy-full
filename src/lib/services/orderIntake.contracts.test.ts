import { test } from "node:test";
import assert from "node:assert/strict";
import { validateContractsIntake } from "./orderIntake.contracts.ts";

const validDraft = {
  schemaVersion: 1,
  service: "contracts",
  mode: "draft",
  complexity: "simple",
  contractType: "sale",
  contractDesc: "عقد بيع عقار سكني بين طرفين وفق الشروط المتفق عليها",
  attachments: [],
};

const validReview = {
  schemaVersion: 1,
  service: "contracts",
  mode: "review",
  representing: "party_one",
  concerns: "بند الفسخ",
  attachments: [{ documentId: "1", name: "contract.pdf", size: 100 }],
};

test("accepts a well-formed draft-mode intake", () => {
  const r = validateContractsIntake(validDraft);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.mode, "draft");
});

test("accepts a well-formed review-mode intake", () => {
  const r = validateContractsIntake(validReview);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.mode, "review");
});

test("rejects a non-object", () => {
  const r = validateContractsIntake(null);
  assert.equal(r.ok, false);
});

test("rejects an intake with wrong service discriminant", () => {
  const r = validateContractsIntake({ ...validDraft, service: "wargaming" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الخدمة")));
});

test("rejects an intake with missing service key", () => {
  const r = validateContractsIntake({ ...validDraft, service: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الخدمة")));
});

test("rejects a missing required field (mode)", () => {
  const r = validateContractsIntake({ ...validDraft, mode: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الوضع") || e.includes("وضع")));
});

test("rejects a blank mode", () => {
  const r = validateContractsIntake({ ...validDraft, mode: "" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("وضع")));
});

test("rejects an unknown mode", () => {
  const r = validateContractsIntake({ ...validDraft, mode: "delete" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("وضع")));
});

test("draft mode does not require attachments", () => {
  const r = validateContractsIntake({ ...validDraft, attachments: [] });
  assert.equal(r.ok, true);
});

test("review mode requires at least one attachment", () => {
  const r = validateContractsIntake({ ...validReview, attachments: [] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("مرفق") || e.includes("العقد")));
});

test("rejects an attachment missing documentId (malformed attachment)", () => {
  const r = validateContractsIntake({ ...validReview, attachments: [{ name: "a.pdf", size: 10 }] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("المرفق")));
});

test("accepts a numeric documentId (PostgREST bigserial arrives as a JS number, not a string)", () => {
  const r = validateContractsIntake({ ...validReview, attachments: [{ documentId: 456, name: "a.pdf", size: 10 }] });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.attachments.length, 1);
    assert.equal(r.value.attachments[0].documentId, "456");
    assert.equal(typeof r.value.attachments[0].documentId, "string");
  }
});

test("collects every error, not just the first", () => {
  const r = validateContractsIntake({ service: "wrong", mode: "delete", attachments: [{ name: "a.pdf" }] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.length >= 3);
});

// ── Coordinator ruling on af0929e: draft-mode contractDesc minimum ─────────
// "an order the admin cannot fulfil must not be submittable" — draft mode
// has no uploaded document, so contractDesc IS the brief the admin drafts
// from.

test("rejects draft mode with no contractDesc", () => {
  const r = validateContractsIntake({ ...validDraft, contractDesc: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("وصف العقد")));
});

test("rejects draft mode with a contractDesc shorter than 20 characters", () => {
  const r = validateContractsIntake({ ...validDraft, contractDesc: "بيع عقار" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("وصف العقد")));
});

test("review mode does not require contractDesc", () => {
  const r = validateContractsIntake({ ...validReview, contractDesc: undefined });
  assert.equal(r.ok, true);
});

// ── Coordinator ruling on af0929e: review-mode representing is required ────
// The uploaded contract is the deliverable (attachments, already required
// above), but the admin still needs to know which side the client is on.

test("rejects review mode with no representing", () => {
  const r = validateContractsIntake({ ...validReview, representing: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الطرف")));
});

test("review mode's representing has no length minimum", () => {
  const r = validateContractsIntake({ ...validReview, representing: "أ" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.representing, "أ");
});

test("draft mode does not require representing", () => {
  const r = validateContractsIntake({ ...validDraft, representing: undefined });
  assert.equal(r.ok, true);
});
