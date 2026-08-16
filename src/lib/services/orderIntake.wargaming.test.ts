import { test } from "node:test";
import assert from "node:assert/strict";
import { validateWargamingIntake, WARGAMING_CRITIQUE_TARGET } from "./orderIntake.wargaming.ts";

const valid = {
  schemaVersion: 1,
  service: "wargaming",
  role: "plaintiff",
  area: "عمالي",
  caseSummary: "و".repeat(25),
  targets: ["opponent", "court"],
  attachments: [],
};

test("accepts a well-formed intake", () => {
  const r = validateWargamingIntake(valid);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.role, "plaintiff");
    assert.deepEqual(r.value.targets, ["opponent", "court"]);
  }
});

test("rejects a non-object", () => {
  const r = validateWargamingIntake(null);
  assert.equal(r.ok, false);
});

test("rejects an intake with wrong service discriminant", () => {
  const r = validateWargamingIntake({ ...valid, service: "contracts" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("الخدمة")));
});

test("rejects an intake with missing service key", () => {
  const r = validateWargamingIntake({ ...valid, service: undefined });
  assert.equal(r.ok, false);
});

test("rejects a missing required field (area)", () => {
  const r = validateWargamingIntake({ ...valid, area: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("تخصص")));
});

test("rejects an unknown role", () => {
  const r = validateWargamingIntake({ ...valid, role: "judge" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("صفة")));
});

test("rejects a caseSummary shorter than 20 characters", () => {
  const r = validateWargamingIntake({ ...valid, caseSummary: "قصير" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("ملخص")));
});

test("rejects empty targets (at least one required)", () => {
  const r = validateWargamingIntake({ ...valid, targets: [] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("هدف")));
});

test("requires memoText when targets include the critique target", () => {
  const r = validateWargamingIntake({ ...valid, targets: [WARGAMING_CRITIQUE_TARGET], memoText: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("نص المذكرة")));
});

test("accepts the critique target when memoText is provided", () => {
  const r = validateWargamingIntake({ ...valid, targets: [WARGAMING_CRITIQUE_TARGET], memoText: "نص المذكرة الأصلية" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.memoText, "نص المذكرة الأصلية");
});

test("rejects an attachment missing documentId (malformed attachment)", () => {
  const r = validateWargamingIntake({ ...valid, attachments: [{ name: "a.pdf", size: 10 }] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("المرفق")));
});

test("accepts a numeric documentId (PostgREST bigserial arrives as a JS number, not a string)", () => {
  const r = validateWargamingIntake({ ...valid, attachments: [{ documentId: 123, name: "a.pdf", size: 10 }] });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.attachments.length, 1);
    assert.equal(r.value.attachments[0].documentId, "123");
    assert.equal(typeof r.value.attachments[0].documentId, "string");
  }
});

test("collects every error, not just the first", () => {
  const r = validateWargamingIntake({ ...valid, role: "judge", area: "", caseSummary: "x", targets: [] });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.length >= 4);
});
