import test from "node:test";
import assert from "node:assert/strict";
import {
  validateFeatureRequestInput,
  validateFeatureRequestPatch,
  validateLibraryIssueReportInput,
  validateLibraryIssueStatusPatch,
  parseStatusFilter,
  FEATURE_REQUEST_CATEGORIES,
  FEATURE_REQUEST_PRIORITIES,
  FEATURE_REQUEST_STATUSES,
  LIBRARY_ISSUE_KINDS,
  LIBRARY_ISSUE_STATUSES,
  DEFAULT_FEATURE_REQUEST_CATEGORY,
  DEFAULT_FEATURE_REQUEST_PRIORITY,
} from "./feedbackInput.ts";

// ─── validateFeatureRequestInput ────────────────────────────────────────────

test("feature request: a minimal valid body defaults category=other, priority=normal, description=''", () => {
  const result = validateFeatureRequestInput({ title: "أضيفوا تصدير PDF" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.title, "أضيفوا تصدير PDF");
  assert.equal(result.value.description, "");
  assert.equal(result.value.category, DEFAULT_FEATURE_REQUEST_CATEGORY);
  assert.equal(result.value.priority, DEFAULT_FEATURE_REQUEST_PRIORITY);
});

test("feature request: title is trimmed before the 3..160 bound is checked", () => {
  const padded = validateFeatureRequestInput({ title: "  حدث  " });
  assert.equal(padded.ok, true);
  if (padded.ok) assert.equal(padded.value.title, "حدث");

  // Raw length 7 (with padding) would pass a naive >=3 check on the
  // untrimmed string; trimmed it is 1 char and must be rejected, matching
  // the database's check(length(btrim(title)) between 3 and 160).
  const tooShortAfterTrim = validateFeatureRequestInput({ title: "   a   " });
  assert.equal(tooShortAfterTrim.ok, false);

  assert.equal(validateFeatureRequestInput({ title: "ab" }).ok, false, "2 chars < 3 is rejected");
  assert.equal(validateFeatureRequestInput({ title: "abc" }).ok, true, "exactly 3 chars is accepted");
  assert.equal(validateFeatureRequestInput({ title: "a".repeat(160) }).ok, true, "exactly 160 chars is accepted");
  assert.equal(validateFeatureRequestInput({ title: "a".repeat(161) }).ok, false, "161 chars is rejected");
});

test("feature request: title missing or non-string is rejected", () => {
  assert.equal(validateFeatureRequestInput({}).ok, false);
  assert.equal(validateFeatureRequestInput({ title: undefined }).ok, false);
  assert.equal(validateFeatureRequestInput({ title: 42 }).ok, false);
  assert.equal(validateFeatureRequestInput({ title: null }).ok, false);
});

test("feature request: description caps at 4000 and rejects a non-string", () => {
  assert.equal(validateFeatureRequestInput({ title: "abc", description: "a".repeat(4000) }).ok, true);
  assert.equal(validateFeatureRequestInput({ title: "abc", description: "a".repeat(4001) }).ok, false);
  assert.equal(validateFeatureRequestInput({ title: "abc", description: 5 }).ok, false);
  assert.equal(validateFeatureRequestInput({ title: "abc", description: null }).ok, true, "null falls back to ''");
});

test("feature request: category accepts every allowlisted value and rejects an unknown one", () => {
  for (const category of FEATURE_REQUEST_CATEGORIES) {
    const result = validateFeatureRequestInput({ title: "abc", category });
    assert.equal(result.ok, true, `category ${category} should be valid`);
    if (result.ok) assert.equal(result.value.category, category);
  }
  assert.equal(validateFeatureRequestInput({ title: "abc", category: "made_up" }).ok, false);
});

test("feature request: priority accepts every allowlisted value and rejects an unknown one", () => {
  for (const priority of FEATURE_REQUEST_PRIORITIES) {
    const result = validateFeatureRequestInput({ title: "abc", priority });
    assert.equal(result.ok, true, `priority ${priority} should be valid`);
    if (result.ok) assert.equal(result.value.priority, priority);
  }
  assert.equal(validateFeatureRequestInput({ title: "abc", priority: "urgent" }).ok, false);
});

// ─── validateFeatureRequestPatch ────────────────────────────────────────────

test("feature request patch: an empty patch is rejected (no silent no-op write)", () => {
  assert.equal(validateFeatureRequestPatch({}).ok, false);
});

test("feature request patch: status alone, implementedNote alone, or both together are accepted", () => {
  const statusOnly = validateFeatureRequestPatch({ status: "planned" });
  assert.equal(statusOnly.ok, true);
  if (statusOnly.ok) {
    assert.equal(statusOnly.value.status, "planned");
    assert.equal(statusOnly.value.implementedNote, undefined);
  }

  const noteOnly = validateFeatureRequestPatch({ implementedNote: "أُضيف في الإصدار القادم" });
  assert.equal(noteOnly.ok, true);
  if (noteOnly.ok) {
    assert.equal(noteOnly.value.status, undefined);
    assert.equal(noteOnly.value.implementedNote, "أُضيف في الإصدار القادم");
  }

  const both = validateFeatureRequestPatch({ status: "declined", implementedNote: "خارج نطاق المنصّة حالياً" });
  assert.equal(both.ok, true);
});

test("feature request patch: implementedNote:null clears the note explicitly", () => {
  const result = validateFeatureRequestPatch({ implementedNote: null });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.implementedNote, null);
});

test("feature request patch: rejects an unknown status, a non-string note, and a note over 4000 chars", () => {
  assert.equal(validateFeatureRequestPatch({ status: "done" }).ok, false);
  assert.equal(validateFeatureRequestPatch({ implementedNote: 5 }).ok, false);
  assert.equal(validateFeatureRequestPatch({ implementedNote: "a".repeat(4001) }).ok, false);
  assert.equal(validateFeatureRequestPatch({ implementedNote: "a".repeat(4000) }).ok, true);
});

test("feature request patch: accepts every FEATURE_REQUEST_STATUSES value", () => {
  for (const status of FEATURE_REQUEST_STATUSES) {
    assert.equal(validateFeatureRequestPatch({ status }).ok, true, `status ${status} should be valid`);
  }
});

// ─── validateLibraryIssueReportInput ────────────────────────────────────────

const ISSUE_BASE = { lawSlug: "nizam-al-amal", kind: "typo" as const, description: "خطأ في نص المادة الثالثة" };

test("library issue report: a minimal valid body defaults articleRef=''", () => {
  const result = validateLibraryIssueReportInput({ ...ISSUE_BASE });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.lawSlug, "nizam-al-amal");
  assert.equal(result.value.articleRef, "");
  assert.equal(result.value.kind, "typo");
  assert.equal(result.value.description, ISSUE_BASE.description);
});

test("library issue report: lawSlug is required, non-empty after trim", () => {
  assert.equal(validateLibraryIssueReportInput({ ...ISSUE_BASE, lawSlug: undefined }).ok, false);
  assert.equal(validateLibraryIssueReportInput({ ...ISSUE_BASE, lawSlug: "" }).ok, false);
  assert.equal(validateLibraryIssueReportInput({ ...ISSUE_BASE, lawSlug: "   " }).ok, false, "whitespace-only trims to empty");
  assert.equal(validateLibraryIssueReportInput({ ...ISSUE_BASE, lawSlug: 5 }).ok, false);

  const trimmed = validateLibraryIssueReportInput({ ...ISSUE_BASE, lawSlug: "  nizam  " });
  assert.equal(trimmed.ok, true);
  if (trimmed.ok) assert.equal(trimmed.value.lawSlug, "nizam");
});

test("library issue report: articleRef caps at 100 and rejects a non-string", () => {
  assert.equal(validateLibraryIssueReportInput({ ...ISSUE_BASE, articleRef: "a".repeat(100) }).ok, true);
  assert.equal(validateLibraryIssueReportInput({ ...ISSUE_BASE, articleRef: "a".repeat(101) }).ok, false);
  assert.equal(validateLibraryIssueReportInput({ ...ISSUE_BASE, articleRef: 5 }).ok, false);
  assert.equal(validateLibraryIssueReportInput({ ...ISSUE_BASE, articleRef: null }).ok, true, "null falls back to ''");
});

test("library issue report: kind is required and must be in the allowlist", () => {
  for (const kind of LIBRARY_ISSUE_KINDS) {
    assert.equal(validateLibraryIssueReportInput({ ...ISSUE_BASE, kind }).ok, true, `kind ${kind} should be valid`);
  }
  assert.equal(validateLibraryIssueReportInput({ ...ISSUE_BASE, kind: undefined }).ok, false);
  assert.equal(validateLibraryIssueReportInput({ ...ISSUE_BASE, kind: "made_up" }).ok, false);
});

test("library issue report: description is trimmed before the 5..2000 bound is checked", () => {
  assert.equal(validateLibraryIssueReportInput({ ...ISSUE_BASE, description: "abcd" }).ok, false, "4 chars < 5");
  assert.equal(validateLibraryIssueReportInput({ ...ISSUE_BASE, description: "abcde" }).ok, true, "exactly 5 chars");
  assert.equal(validateLibraryIssueReportInput({ ...ISSUE_BASE, description: "a".repeat(2000) }).ok, true);
  assert.equal(validateLibraryIssueReportInput({ ...ISSUE_BASE, description: "a".repeat(2001) }).ok, false);

  // Padded to raw length 9 but 3 real chars after trim — must fail the
  // trimmed bound the same way the database's btrim(description) check would.
  assert.equal(validateLibraryIssueReportInput({ ...ISSUE_BASE, description: "   abc   " }).ok, false);
  const trimmed = validateLibraryIssueReportInput({ ...ISSUE_BASE, description: "  خطأ إملائي هنا  " });
  assert.equal(trimmed.ok, true);
  if (trimmed.ok) assert.equal(trimmed.value.description, "خطأ إملائي هنا");
});

test("library issue report: description missing or non-string is rejected", () => {
  assert.equal(validateLibraryIssueReportInput({ ...ISSUE_BASE, description: undefined }).ok, false);
  assert.equal(validateLibraryIssueReportInput({ ...ISSUE_BASE, description: 5 }).ok, false);
});

// ─── validateLibraryIssueStatusPatch ────────────────────────────────────────

test("library issue status patch: accepts every allowlisted status and rejects an unknown one", () => {
  for (const status of LIBRARY_ISSUE_STATUSES) {
    const result = validateLibraryIssueStatusPatch({ status });
    assert.equal(result.ok, true, `status ${status} should be valid`);
    if (result.ok) assert.equal(result.value.status, status);
  }
  assert.equal(validateLibraryIssueStatusPatch({ status: "done" }).ok, false);
  assert.equal(validateLibraryIssueStatusPatch({}).ok, false, "status is required, unlike the feature request patch");
});

// ─── parseStatusFilter ───────────────────────────────────────────────────────

test("parseStatusFilter: null/absent and 'all' both mean no filter", () => {
  const a = parseStatusFilter(null, FEATURE_REQUEST_STATUSES);
  assert.equal(a.ok, true);
  if (a.ok) assert.equal(a.value, null);

  const b = parseStatusFilter("all", FEATURE_REQUEST_STATUSES);
  assert.equal(b.ok, true);
  if (b.ok) assert.equal(b.value, null);
});

test("parseStatusFilter: a value in the allowlist is returned as-is", () => {
  const result = parseStatusFilter("planned", FEATURE_REQUEST_STATUSES);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value, "planned");
});

test("parseStatusFilter: a value outside the allowlist fails", () => {
  assert.equal(parseStatusFilter("bogus", FEATURE_REQUEST_STATUSES).ok, false);
  assert.equal(parseStatusFilter("fixed", FEATURE_REQUEST_STATUSES).ok, false, "valid for issue reports, not feature requests");
  assert.equal(parseStatusFilter("declined", LIBRARY_ISSUE_STATUSES).ok, false, "valid for feature requests, not issue reports");
});
