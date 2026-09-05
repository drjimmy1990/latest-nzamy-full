import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCommunityReportInput,
  validateCommunityReportStatusPatch,
  isUuid,
  COMMUNITY_REPORT_TARGET_TYPES,
  COMMUNITY_REPORT_REASONS,
  COMMUNITY_REPORT_STATUSES,
  COMMUNITY_REPORT_REASON_LABELS_AR,
} from "./communityReportsInput.ts";

const VALID_UUID = "11111111-1111-1111-1111-111111111111";

// ─── validateCommunityReportInput ───────────────────────────────────────────

test("report input: a minimal valid body (no details) is accepted, details is null", () => {
  const result = validateCommunityReportInput({ targetType: "post", targetId: VALID_UUID, reason: "spam" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.targetType, "post");
  assert.equal(result.value.targetId, VALID_UUID);
  assert.equal(result.value.reason, "spam");
  assert.equal(result.value.details, null);
});

test("report input: every declared target_type is accepted", () => {
  for (const t of COMMUNITY_REPORT_TARGET_TYPES) {
    const result = validateCommunityReportInput({ targetType: t, targetId: VALID_UUID, reason: "other" });
    assert.equal(result.ok, true, `targetType ${t} should be accepted`);
  }
});

test("report input: every declared reason is accepted", () => {
  for (const r of COMMUNITY_REPORT_REASONS) {
    const result = validateCommunityReportInput({ targetType: "answer", targetId: VALID_UUID, reason: r });
    assert.equal(result.ok, true, `reason ${r} should be accepted`);
  }
});

test("report input: an unknown target_type is rejected", () => {
  const result = validateCommunityReportInput({ targetType: "comment", targetId: VALID_UUID, reason: "spam" });
  assert.equal(result.ok, false);
});

test("report input: an unknown reason is rejected", () => {
  const result = validateCommunityReportInput({ targetType: "post", targetId: VALID_UUID, reason: "i_dont_like_it" });
  assert.equal(result.ok, false);
});

test("report input: a non-uuid targetId is rejected", () => {
  const result = validateCommunityReportInput({ targetType: "post", targetId: "42", reason: "spam" });
  assert.equal(result.ok, false);
  const result2 = validateCommunityReportInput({ targetType: "post", targetId: 42, reason: "spam" });
  assert.equal(result2.ok, false);
});

test("report input: a missing targetId/reason/targetType is rejected", () => {
  assert.equal(validateCommunityReportInput({ targetId: VALID_UUID, reason: "spam" } as never).ok, false);
  assert.equal(validateCommunityReportInput({ targetType: "post", reason: "spam" } as never).ok, false);
  assert.equal(validateCommunityReportInput({ targetType: "post", targetId: VALID_UUID } as never).ok, false);
});

test("report input: details is trimmed, and empty-after-trim becomes null", () => {
  const result = validateCommunityReportInput({
    targetType: "post",
    targetId: VALID_UUID,
    reason: "other",
    details: "   تفاصيل إضافية   ",
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.details, "تفاصيل إضافية");

  const blank = validateCommunityReportInput({ targetType: "post", targetId: VALID_UUID, reason: "other", details: "    " });
  assert.equal(blank.ok, true);
  if (blank.ok) assert.equal(blank.value.details, null);
});

test("report input: details over 1000 chars is rejected", () => {
  const result = validateCommunityReportInput({
    targetType: "post",
    targetId: VALID_UUID,
    reason: "other",
    details: "x".repeat(1001),
  });
  assert.equal(result.ok, false);
});

test("report input: details at exactly 1000 chars (post-trim) is accepted", () => {
  const result = validateCommunityReportInput({
    targetType: "post",
    targetId: VALID_UUID,
    reason: "other",
    details: "x".repeat(1000),
  });
  assert.equal(result.ok, true);
});

test("report input: a non-string details is rejected", () => {
  const result = validateCommunityReportInput({ targetType: "post", targetId: VALID_UUID, reason: "other", details: 123 });
  assert.equal(result.ok, false);
});

// ─── validateCommunityReportStatusPatch ─────────────────────────────────────

test("status patch: every declared status is accepted", () => {
  for (const s of COMMUNITY_REPORT_STATUSES) {
    const result = validateCommunityReportStatusPatch({ status: s });
    assert.equal(result.ok, true, `status ${s} should be accepted`);
  }
});

test("status patch: an unknown status is rejected", () => {
  const result = validateCommunityReportStatusPatch({ status: "archived" });
  assert.equal(result.ok, false);
});

test("status patch: a missing status is rejected", () => {
  const result = validateCommunityReportStatusPatch({});
  assert.equal(result.ok, false);
});

// ─── isUuid ──────────────────────────────────────────────────────────────

test("isUuid: accepts a well-formed uuid, rejects everything else", () => {
  assert.equal(isUuid(VALID_UUID), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid(42), false);
  assert.equal(isUuid(null), false);
  assert.equal(isUuid(undefined), false);
});

// ─── COMMUNITY_REPORT_REASON_LABELS_AR ──────────────────────────────────────

test("every reason has an Arabic label, and no label is blank", () => {
  for (const r of COMMUNITY_REPORT_REASONS) {
    const label = COMMUNITY_REPORT_REASON_LABELS_AR[r];
    assert.equal(typeof label, "string");
    assert.ok(label.trim().length > 0, `label for ${r} must not be blank`);
  }
});
