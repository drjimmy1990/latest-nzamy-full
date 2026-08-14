import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDraftIntake, SERVICE_TYPE_BY_KEY } from "./orderIntake.ts";

const valid = {
  schemaVersion: 1,
  service: "draft",
  clientRole: "plaintiff",
  memoType: "case",
  legalBranch: "عمالي",
  caseText: "و".repeat(40),
  parties: { one: { type: "individual", fullName: "محمد" }, two: { type: "company", companyName: "شركة" } },
  attachments: [],
};

test("accepts a well-formed intake", () => {
  const r = validateDraftIntake(valid);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.legalBranch, "عمالي");
});

test("rejects a non-object", () => {
  const r = validateDraftIntake(null);
  assert.equal(r.ok, false);
});

test("rejects caseText shorter than 30 characters", () => {
  const r = validateDraftIntake({ ...valid, caseText: "قصير" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الوقائع")));
});

test("rejects an unknown clientRole", () => {
  const r = validateDraftIntake({ ...valid, clientRole: "judge" });
  assert.equal(r.ok, false);
});

test("collects every error, not just the first", () => {
  const r = validateDraftIntake({ ...valid, caseText: "x", legalBranch: "" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.length >= 2);
});

test("rejects an attachment missing documentId", () => {
  const r = validateDraftIntake({ ...valid, attachments: [{ name: "a.pdf", size: 10 }] });
  assert.equal(r.ok, false);
});

test("maps every service key to a service_requests type", () => {
  assert.equal(SERVICE_TYPE_BY_KEY.draft, "ai_draft");
  assert.equal(SERVICE_TYPE_BY_KEY.legal_opinion, "ai_legal_opinion");
});

test("rejects an intake with wrong service value", () => {
  const r = validateDraftIntake({ ...valid, service: "contracts" });
  assert.equal(r.ok, false);
});

test("rejects an intake with missing service key", () => {
  const r = validateDraftIntake({ ...valid, service: undefined });
  assert.equal(r.ok, false);
});
