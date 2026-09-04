/**
 * feedbackService.ts — feature requests and library issue reports, readable
 * by the admin instead of dying in the submitter's browser (Phase 6).
 * ─────────────────────────────────────────────────────────
 *   GET/POST  /api/v1/feature-requests          — mine / submit
 *   GET/PATCH /api/v1/admin/feature-requests[/[id]] — triage
 *   POST      /api/v1/library/issue-reports      — «أبلغ عن خطأ في هذه المادة»
 *   GET/PATCH /api/v1/admin/library-issue-reports[/[id]]
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";

export type FeatureRequestPriority = "low" | "normal" | "high";
export type FeatureRequestStatus = "new" | "planned" | "implemented" | "declined";
export const FEATURE_REQUEST_STATUS_AR: Record<FeatureRequestStatus, string> = {
  new: "جديد", planned: "مخطَّط له", implemented: "نُفِّذ", declined: "اعتُذر عنه",
};

export interface FeatureRequest {
  id: string;
  userId: string;
  userName?: string | null;
  title: string;
  description: string;
  category: string;
  priority: FeatureRequestPriority;
  status: FeatureRequestStatus;
  implementedNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export type IssueKind = "typo" | "wrong_text" | "missing_article" | "outdated" | "other";
export const ISSUE_KIND_AR: Record<IssueKind, string> = {
  typo: "خطأ إملائي", wrong_text: "نصّ غير صحيح", missing_article: "مادة ناقصة", outdated: "نصّ غير محدَّث", other: "أخرى",
};
export type IssueStatus = "new" | "reviewed" | "fixed" | "rejected";
export const ISSUE_STATUS_AR: Record<IssueStatus, string> = { new: "جديد", reviewed: "قيد المراجعة", fixed: "أُصلح", rejected: "مرفوض" };

export interface LibraryIssueReport {
  id: string;
  userId: string | null;
  userName?: string | null;
  lawSlug: string;
  articleRef: string;
  kind: IssueKind;
  description: string;
  status: IssueStatus;
  createdAt: string;
}

const DEMO = "غير متاح في وضع العرض التجريبي";

export async function getMyFeatureRequests(): Promise<ListRead<FeatureRequest>> {
  if (!isSupabaseMode) return listOk([]);
  try { return listFromApi(await apiGet<{ data: FeatureRequest[]; total?: number }>("/api/v1/feature-requests")); }
  catch (error) { console.error("[feedbackService] getMyFeatureRequests failed:", error); return listFailed<FeatureRequest>(); }
}

export async function submitFeatureRequest(input: { title: string; description?: string; category?: string; priority?: FeatureRequestPriority }): Promise<FeatureRequest> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: FeatureRequest }>("/api/v1/feature-requests", "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم الطلب المحفوظ.");
  return res.data;
}

export async function adminListFeatureRequests(opts?: { status?: FeatureRequestStatus | "all" }): Promise<ListRead<FeatureRequest>> {
  if (!isSupabaseMode) return listOk([]);
  try { return listFromApi(await apiGet<{ data: FeatureRequest[]; total?: number }>("/api/v1/admin/feature-requests", { status: opts?.status })); }
  catch (error) { console.error("[feedbackService] adminListFeatureRequests failed:", error); return listFailed<FeatureRequest>(); }
}

export async function adminUpdateFeatureRequest(id: string, patch: { status?: FeatureRequestStatus; implementedNote?: string | null }): Promise<FeatureRequest> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: FeatureRequest }>(`/api/v1/admin/feature-requests/${encodeURIComponent(id)}`, "PATCH", patch);
  if (!res?.data) throw new Error("لم يُعِد الخادم الطلب بعد التعديل.");
  return res.data;
}

export async function submitLibraryIssueReport(input: { lawSlug: string; articleRef?: string; kind: IssueKind; description: string }): Promise<LibraryIssueReport> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: LibraryIssueReport }>("/api/v1/library/issue-reports", "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم البلاغ المحفوظ.");
  return res.data;
}

export async function adminListIssueReports(opts?: { status?: IssueStatus | "all" }): Promise<ListRead<LibraryIssueReport>> {
  if (!isSupabaseMode) return listOk([]);
  try { return listFromApi(await apiGet<{ data: LibraryIssueReport[]; total?: number }>("/api/v1/admin/library-issue-reports", { status: opts?.status })); }
  catch (error) { console.error("[feedbackService] adminListIssueReports failed:", error); return listFailed<LibraryIssueReport>(); }
}

export async function adminUpdateIssueReport(id: string, patch: { status: IssueStatus }): Promise<LibraryIssueReport> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: LibraryIssueReport }>(`/api/v1/admin/library-issue-reports/${encodeURIComponent(id)}`, "PATCH", patch);
  if (!res?.data) throw new Error("لم يُعِد الخادم البلاغ بعد التعديل.");
  return res.data;
}
