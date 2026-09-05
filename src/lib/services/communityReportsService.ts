/**
 * communityReportsService.ts — «زر الإبلاغ عن المحتوى» (owner item ٦٩
 * remainder). Signed-in-only, out of the browser from day one: there is no
 * local fallback here (unlike communityService.ts's demo-mode Q&A store) —
 * a report with no server behind it is a button that lies about having
 * reported anything, so this throws in demo mode instead of pretending.
 *
 *   POST  /api/v1/community/reports             — submit a report (own reason/details)
 *   GET   /api/v1/admin/community/reports        — admin queue, newest first
 *   PATCH /api/v1/admin/community/reports/[id]   — admin triage (status only)
 *
 * `submitCommunityReport` throws the SERVER's own Arabic message on failure
 * — including the 409 duplicate («سبق أن أبلغت عن هذا المحتوى») — never an
 * invented one, so the modal shows exactly what actually happened.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";
import type {
  CommunityReportReason,
  CommunityReportStatus,
  CommunityReportTargetType,
} from "@/lib/services/communityReportsInput";

/** Mirrors public.community_reports, plus admin-list-only hydration. */
export interface CommunityReport {
  id: string;
  targetType: CommunityReportTargetType;
  targetId: string;
  reporterUserId: string | null;
  /** Hydrated only on the admin list (service-client profile lookup); null on the plain submit response. */
  reporterName: string | null;
  reason: CommunityReportReason;
  /** Arabic label for `reason` — always present. */
  reasonLabel: string;
  details: string | null;
  status: CommunityReportStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  /** A short excerpt of the reported post/answer. Hydrated only on the admin list. */
  targetSnippet: string | null;
  /** For an answer target: the parent post id (admin list only), so the thread can be opened. */
  answerPostId: string | null;
}

export interface SubmitCommunityReportInput {
  targetType: CommunityReportTargetType;
  targetId: string;
  reason: CommunityReportReason;
  details?: string;
}

const BASE = "/api/v1/community/reports";
const ADMIN_BASE = "/api/v1/admin/community/reports";

/** Submits a report. Throws (Arabic message) in demo mode, on a validation error, or on a duplicate report (409). */
export async function submitCommunityReport(input: SubmitCommunityReportInput): Promise<CommunityReport> {
  if (!isSupabaseMode) {
    throw new Error("الإبلاغ عن المحتوى غير متاح في وضع العرض التجريبي");
  }
  const res = await apiMutate<{ data: CommunityReport }>(BASE, "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم البلاغ المُرسَل.");
  return res.data;
}

/** Admin queue. `status` omitted or "all" returns every status. Read failure is `ok:false`, never a silent empty queue. */
export async function adminListCommunityReports(
  status?: CommunityReportStatus | "all",
): Promise<ListRead<CommunityReport>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    return listFromApi(
      await apiGet<{ data: CommunityReport[]; total?: number }>(ADMIN_BASE, {
        status: status && status !== "all" ? status : undefined,
      }),
    );
  } catch (error) {
    console.error("[communityReportsService] adminListCommunityReports failed:", error);
    return listFailed<CommunityReport>();
  }
}

/** Admin triage — status only. Throws the server's Arabic message on failure. */
export async function adminUpdateCommunityReportStatus(
  id: string,
  status: CommunityReportStatus,
): Promise<CommunityReport> {
  if (!isSupabaseMode) {
    throw new Error("لوحة الإشراف غير متاحة في وضع العرض التجريبي");
  }
  const res = await apiMutate<{ data: CommunityReport }>(`${ADMIN_BASE}/${encodeURIComponent(id)}`, "PATCH", { status });
  if (!res?.data) throw new Error("لم يُعِد الخادم البلاغ بعد التحديث.");
  return res.data;
}
