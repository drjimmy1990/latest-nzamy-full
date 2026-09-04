/**
 * _shared.ts — the ONE row → DTO mapping for the library-issue-report routes.
 * ─────────────────────────────────────────────────────────
 * Backed by `public.library_issue_reports` (20260906_phase6_settings_out_of_browser.sql).
 * RLS: own row or `public.is_admin()` for SELECT, own row for INSERT,
 * `public.is_admin()` for UPDATE. `user_id` is nullable on the table
 * (`on delete set null`) even though the POST route requires a signed-in
 * caller — a reporter's account can be deleted later and the report
 * survives, ownerless. Imported by `/api/v1/library/issue-reports/route.ts`
 * (POST) and the admin routes under `/api/v1/admin/library-issue-reports/`.
 */

import type { IssueKind, IssueStatus, LibraryIssueReport } from "@/lib/services/feedbackService";

export const LIBRARY_ISSUE_REPORT_SELECT = "id, user_id, law_slug, article_ref, kind, description, status, created_at";

export interface LibraryIssueReportRow {
  id: string;
  user_id: string | null;
  law_slug: string;
  article_ref: string;
  kind: string;
  description: string;
  status: string;
  created_at: string;
}

/** Maps one `library_issue_reports` row to the `LibraryIssueReport` DTO. `userName` is only ever hydrated on the admin list. */
export function toLibraryIssueReportDto(row: LibraryIssueReportRow, userName?: string | null): LibraryIssueReport {
  return {
    id: row.id,
    userId: row.user_id,
    userName: userName ?? null,
    lawSlug: row.law_slug,
    articleRef: row.article_ref,
    kind: row.kind as IssueKind,
    description: row.description,
    status: row.status as IssueStatus,
    createdAt: row.created_at,
  };
}

/** Postgres error → HTTP status + Arabic message. 23505 duplicate · 23514 CHECK · 23503 FK · 42501 RLS · PGRST116 no row matched (RLS-scoped .single()). */
export function libraryIssueReportDbErrorResponse(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code;
  if (code === "PGRST116") return { status: 404, message: "البلاغ غير موجود." };
  if (code === "23505") return { status: 409, message: "هذا البلاغ مسجَّل مسبقاً." };
  if (code === "23514") return { status: 400, message: "بيانات البلاغ غير صالحة." };
  if (code === "23503") return { status: 400, message: "البلاغ يشير إلى سجلّ غير موجود." };
  if (code === "42501") return { status: 403, message: "غير مصرح لك بهذا الإجراء." };
  return { status: 500, message: "تعذّر حفظ البلاغ." };
}
