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

/**
 * What the judgment hook did after an outcome was recorded (Phase 5, رادار
 * المهل). `created` → a statutory deadline row now exists for this stage and
 * the summary is what the confirmation screen shows. Otherwise `skipped` says
 * why — the screen must never imply a deadline exists when none does.
 */
export type AutoDeadlineSkipReason =
  | "no_closed_on"        // outcome recorded without a closing date → no clock started
  | "no_rule_for_degree"  // e.g. نقض / تنفيذ: nothing follows this degree
  | "already_exists"      // a deadline for this stage + rule already exists
  | "rule_missing"        // the platform rule is inactive/absent on this database
  | "compute_failed"
  | "insert_failed";

export interface AutoDeadlineSummary {
  id: string;
  title: string;
  dueDate: string;
  dueDateHijri: string | null;
  daysCount: number | null;
  rolledFromHoliday: boolean;
  ruleTitleAr: string | null;
  /** false → the screen shows «قاعدة افتراضية — تحتاج مراجعتك» (owner Q18). */
  ruleVerified: boolean;
}

export type AutoDeadlineResult =
  | { created: true; deadline: AutoDeadlineSummary }
  | { created: false; skipped: AutoDeadlineSkipReason };

/**
 * PATCH the outcome (and optionally the closing date / notes) of a degree.
 * `autoDeadline` is null when the request carried no `outcome` at all; when it
 * did, it is ALWAYS an object — created or skipped — never silently absent.
 */
export async function recordCaseStageOutcome(caseId: string, input: {
  id: string; outcome: string; closedOn?: string | null; notes?: string;
}): Promise<{ stage: CaseStage; autoDeadline: AutoDeadlineResult | null }> {
  const res = await apiMutate<{ data: CaseStage; autoDeadline?: AutoDeadlineResult | null }>(
    `/api/v1/lawyer/case-stages/${encodeURIComponent(caseId)}`, "PATCH", input,
  );
  return { stage: res.data, autoDeadline: res.autoDeadline ?? null };
}
