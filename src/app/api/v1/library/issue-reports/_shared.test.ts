/**
 * _shared.test.ts — run with:  node --test src/app/api/v1/library/issue-reports/_shared.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { toLibraryIssueReportDto, libraryIssueReportDbErrorResponse, type LibraryIssueReportRow } from "./_shared.ts";

const ROW: LibraryIssueReportRow = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  law_slug: "nizam-al-amal",
  article_ref: "المادة ٧٧",
  kind: "wrong_text",
  description: "نص المادة لا يطابق الجريدة الرسمية.",
  status: "new",
  created_at: "2026-09-04T08:00:00.000Z",
};

test("toLibraryIssueReportDto maps every snake_case column to its camelCase field", () => {
  const dto = toLibraryIssueReportDto(ROW);
  assert.deepEqual(dto, {
    id: ROW.id,
    userId: ROW.user_id,
    userName: null,
    lawSlug: ROW.law_slug,
    articleRef: ROW.article_ref,
    kind: "wrong_text",
    description: ROW.description,
    status: "new",
    createdAt: ROW.created_at,
  });
});

test("toLibraryIssueReportDto: no snake_case key leaks into the DTO", () => {
  const dto = toLibraryIssueReportDto(ROW) as unknown as Record<string, unknown>;
  for (const key of Object.keys(dto)) {
    assert.ok(!key.includes("_"), `DTO key "${key}" looks like a snake_case column, not a camelCase field`);
  }
});

test("toLibraryIssueReportDto: userId null (deleted reporter) passes through, userName defaults to null", () => {
  const dto = toLibraryIssueReportDto({ ...ROW, user_id: null });
  assert.equal(dto.userId, null);
  assert.equal(dto.userName, null);
});

test("toLibraryIssueReportDto: userName passes through when given", () => {
  assert.equal(toLibraryIssueReportDto(ROW, "سارة القحطاني").userName, "سارة القحطاني");
});

test("libraryIssueReportDbErrorResponse maps every known Postgres/PostgREST code", () => {
  assert.deepEqual(libraryIssueReportDbErrorResponse({ code: "PGRST116" }), { status: 404, message: "البلاغ غير موجود." });
  assert.equal(libraryIssueReportDbErrorResponse({ code: "23505" }).status, 409);
  assert.equal(libraryIssueReportDbErrorResponse({ code: "23514" }).status, 400);
  assert.equal(libraryIssueReportDbErrorResponse({ code: "23503" }).status, 400);
  assert.equal(libraryIssueReportDbErrorResponse({ code: "42501" }).status, 403);
  assert.equal(libraryIssueReportDbErrorResponse({ code: "unknown" }).status, 500);
  assert.equal(libraryIssueReportDbErrorResponse(null).status, 500);
});
