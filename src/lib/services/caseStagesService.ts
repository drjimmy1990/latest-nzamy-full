/**
 * caseStagesService.ts
 * ─────────────────────────────────────────────────────────
 * Typed client for /api/v1/lawyer/case-stages/[caseId] (Phase 1,
 * public.case_stages) — درجات التقاضي.
 */

"use client";

import { apiGet, apiMutate } from "@/lib/services/api";
import type { UiDegree } from "@/lib/services/caseStageVocabulary";

export interface CaseStage {
  id: string;
  caseRequestId: string;
  degree: UiDegree;
  courtName?: string;
  courtCaseNo?: string;
  circuit?: string;
  judgeName?: string;
  openedOn: string | null;
  closedOn: string | null;
  outcome: string | null;
  position: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export async function getCaseStages(caseId: string): Promise<{ items: CaseStage[]; total: number }> {
  const res = await apiGet<{ data: CaseStage[]; total: number }>(`/api/v1/lawyer/case-stages/${encodeURIComponent(caseId)}`);
  const items = res?.data ?? [];
  return { items, total: res?.total ?? items.length };
}

export async function addCaseStage(caseId: string, input: {
  degree: UiDegree; courtName?: string; courtCaseNo?: string;
  circuit?: string; judgeName?: string; openedOn?: string; notes?: string;
}): Promise<CaseStage> {
  const res = await apiMutate<{ data: CaseStage }>(`/api/v1/lawyer/case-stages/${encodeURIComponent(caseId)}`, "POST", input);
  return res.data;
}

export async function recordCaseStageOutcome(caseId: string, input: {
  id: string; outcome: string; closedOn?: string | null; notes?: string;
}): Promise<CaseStage> {
  const res = await apiMutate<{ data: CaseStage }>(`/api/v1/lawyer/case-stages/${encodeURIComponent(caseId)}`, "PATCH", input);
  return res.data;
}
