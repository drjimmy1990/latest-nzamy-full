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

test("requires memoText or a tagged memo attachment when targets include the critique target", () => {
  const r = validateWargamingIntake({ ...valid, targets: [WARGAMING_CRITIQUE_TARGET], memoText: undefined });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("المذكرة")));
});

test("accepts the critique target when memoText is provided", () => {
  const r = validateWargamingIntake({ ...valid, targets: [WARGAMING_CRITIQUE_TARGET], memoText: "نص المذكرة الأصلية" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.memoText, "نص المذكرة الأصلية");
});

test("critique target is satisfied by a memo attachment (memoAttachmentIds) instead of memoText", () => {
  const r = validateWargamingIntake({
    ...valid,
    targets: [WARGAMING_CRITIQUE_TARGET],
    memoText: "",
    attachments: [{ documentId: 12, name: "memo.pdf", size: 900 }],
    memoAttachmentIds: [12],
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.value.memoAttachmentIds, ["12"]);
});

test("accepts a numeric memoAttachmentIds entry (PostgREST bigserial arrives as a JS number, not a string)", () => {
  const r = validateWargamingIntake({
    ...valid,
    targets: [WARGAMING_CRITIQUE_TARGET],
    memoText: "",
    attachments: [{ documentId: 12, name: "memo.pdf", size: 900 }],
    memoAttachmentIds: [12],
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(typeof r.value.memoAttachmentIds?.[0], "string");
});

test("an unrelated attachment does NOT satisfy the critique requirement — only a tagged memo attachment does", () => {
  const r = validateWargamingIntake({
    ...valid,
    targets: [WARGAMING_CRITIQUE_TARGET],
    memoText: "",
    // a case file was uploaded (e.g. in step 1), but never tagged as the
    // memo — memoAttachmentIds is omitted/empty, so it must not count.
    attachments: [{ documentId: 99, name: "case-file.pdf", size: 500 }],
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.includes("المذكرة")));
});

test("critique target with neither memoText nor a memo attachment is rejected", () => {
  const r = validateWargamingIntake({
    ...valid, targets: [WARGAMING_CRITIQUE_TARGET], memoText: "", attachments: [],
  });
  assert.equal(r.ok, false);
});

test("removing the memo attachment (dropped from memoAttachmentIds) is rejected even though the file is still in `attachments`", () => {
  const r = validateWargamingIntake({
    ...valid,
    targets: [WARGAMING_CRITIQUE_TARGET],
    memoText: "",
    attachments: [{ documentId: 12, name: "memo.pdf", size: 900 }],
    memoAttachmentIds: [], // client removed the memo file — the id must be dropped here too, not just left dangling
  });
  assert.equal(r.ok, false);
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
