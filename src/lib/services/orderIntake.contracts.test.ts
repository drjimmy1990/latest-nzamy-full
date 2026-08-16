import { test } from "node:test";
import assert from "node:assert/strict";
import { validateContractsIntake } from "./orderIntake.contracts.ts";

const validDraft = {
  schemaVersion: 1,
  service: "contracts",
  mode: "draft",
  complexity: "simple",
  contractType: "sale",
  contractDesc: "بيع عقار",
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
});

test("rejects a missing required field (mode)", () => {
  const r = validateContractsIntake({ ...validDraft, mode: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الوضع") || e.includes("وضع")));
});

test("rejects a blank mode — nearest equivalent to a too-short free-text field (contracts shape has no free-text minimum in the brief)", () => {
  const r = validateContractsIntake({ ...validDraft, mode: "" });
  assert.equal(r.ok, false);
});

test("rejects an unknown mode", () => {
  const r = validateContractsIntake({ ...validDraft, mode: "delete" });
  assert.equal(r.ok, false);
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
