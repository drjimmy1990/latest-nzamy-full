/**
 * _shared.ts — the ONE row → DTO mapping for the community-report routes.
 * ─────────────────────────────────────────────────────────
 * Backed by `public.community_reports` (20260911_community_reports.sql).
 * RLS: own row or `public.is_admin()` for SELECT, own row (reporter_user_id
 * = auth.uid()) for INSERT, `public.is_admin()` for UPDATE.
 *
 * Imported by:
 *   /api/v1/community/reports              (POST — any signed-in user)
 *   /api/v1/admin/community/reports        (GET  — admin, target snippet +
 *                                            reporter name hydrated by the
 *                                            route via the service client)
 *   /api/v1/admin/community/reports/[id]   (PATCH — admin, status only)
 *
 * `reporterName` and `targetSnippet` are hydration-only fields: `null` on
 * the plain POST response (the reporter already knows who they are and what
 * they reported) and populated only on the admin GET list.
 */

import type {
  CommunityReportReason,
  CommunityReportStatus,
  CommunityReportTargetType,
} from "@/lib/services/communityReportsInput";
import { COMMUNITY_REPORT_REASON_LABELS_AR } from "@/lib/services/communityReportsInput";
import type { CommunityReport } from "@/lib/services/communityReportsService";

export const COMMUNITY_REPORT_SELECT =
  "id, target_type, target_id, reporter_user_id, reason, details, status, reviewed_by, reviewed_at, created_at";

export interface CommunityReportRow {
  id: string;
  target_type: string;
  target_id: string;
  reporter_user_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface CommunityReportHydration {
  reporterName?: string | null;
  targetSnippet?: string | null;
  /** For an answer target: the parent post id, so the admin can open the thread. */
  answerPostId?: string | null;
}

/** Maps one `community_reports` row (+ optional admin-list hydration) to the `CommunityReport` DTO. */
export function toCommunityReportDto(row: CommunityReportRow, extras: CommunityReportHydration = {}): CommunityReport {
  const reason = row.reason as CommunityReportReason;
  return {
    id: row.id,
    targetType: row.target_type as CommunityReportTargetType,
    targetId: row.target_id,
    reporterUserId: row.reporter_user_id,
    reporterName: extras.reporterName ?? null,
    reason,
    reasonLabel: COMMUNITY_REPORT_REASON_LABELS_AR[reason] ?? reason,
    details: row.details,
    status: row.status as CommunityReportStatus,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    targetSnippet: extras.targetSnippet ?? null,
    answerPostId: extras.answerPostId ?? null,
  };
}

/** Postgres error → HTTP status + Arabic message. 23505 duplicate (own report of this target already exists) · 23514 CHECK · 23503 FK · 42501 RLS. */
export function communityReportDbErrorResponse(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code;
  if (code === "23505") return { status: 409, message: "سبق أن أبلغت عن هذا المحتوى." };
  if (code === "23514") return { status: 400, message: "بيانات البلاغ غير صالحة." };
  if (code === "23503") return { status: 400, message: "البلاغ يشير إلى سجلّ غير موجود." };
  if (code === "42501") return { status: 403, message: "غير مصرح لك بهذا الإجراء." };
  return { status: 500, message: "تعذّر إرسال البلاغ." };
}

/** A short, admin-facing excerpt of the reported content — never the full body (this is a moderation list, not a reader). */
export function buildTargetSnippet(text: string | null | undefined, max = 140): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}
