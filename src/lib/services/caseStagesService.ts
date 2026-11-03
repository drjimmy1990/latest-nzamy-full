/**
 * caseStagesService.ts
 * ─────────────────────────────────────────────────────────
 * Typed client for /api/v1/lawyer/case-stages/[caseId] and the bulk
 * /api/v1/lawyer/case-stages (latest stage per case, T28-29a) (Phase 1,
 * public.case_stages) — درجات التقاضي.
 */

"use client";

import { apiGet, apiMutate } from "@/lib/services/api";
import type { UiDegree } from "@/lib/services/caseStageVocabulary";
import { CASE_STAGES_BULK_MAX_IDS } from "@/lib/caseStageBuckets";

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
  /**
   * The event the next filing period counts from (owner package 2026-10-30,
   * CODE-F03) — chosen by the lawyer, never defaulted. `triggerDate` is the
   * effective date: the closing date for `judgment_date`, its own date
   * otherwise; null until both are known.
   */
  triggerEvent?: StageTriggerEvent | null;
  triggerDate?: string | null;
  /** The open/closed auto deadline linked to this stage, if any (GET only). */
  linkedDeadline?: LinkedStageDeadline | null;
}

export type StageTriggerEvent = "judgment_date" | "copy_received" | "notified";

export interface LinkedStageDeadline {
  id: string;
  status: string;
  triggerDate: string;
  dueDate: string;
}

export async function getCaseStages(caseId: string): Promise<{ items: CaseStage[]; total: number }> {
  const res = await apiGet<{ data: CaseStage[]; total: number }>(`/api/v1/lawyer/case-stages/${encodeURIComponent(caseId)}`);
  const items = res?.data ?? [];
  return { items, total: res?.total ?? items.length };
}

/** One case's latest stage, from the bulk GET /api/v1/lawyer/case-stages. */
export interface LatestCaseStage {
  caseId: string;
  stageId: string;
  degree: UiDegree;
  outcome: string | null;
  /** the stage's opened_on, null when not recorded */
  stageDate: string | null;
  closedOn: string | null;
}

/**
 * The latest stage of each of `caseIds` (T28-29a). Cases with no stage row
 * are absent from the result. The ids are sent in chunks of
 * CASE_STAGES_BULK_MAX_IDS because they travel in the query string (see that
 * constant). Throws if any chunk fails — the caller must not render a partial
 * picture as if it were whole.
 */
export async function getLatestCaseStages(caseIds: readonly string[]): Promise<LatestCaseStage[]> {
  const unique = [...new Set(caseIds)];
  if (unique.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CASE_STAGES_BULK_MAX_IDS) {
    chunks.push(unique.slice(i, i + CASE_STAGES_BULK_MAX_IDS));
  }
  const pages = await Promise.all(chunks.map((chunk) =>
    apiGet<{ data?: LatestCaseStage[]; total?: number; truncated?: boolean }>("/api/v1/lawyer/case-stages", { caseIds: chunk.join(",") }),
  ));
  // A read the server cut short would leave whole cases without a row, and
  // the page would count them as «لم تُسجَّل مرحلة» — treat it as a failure.
  if (pages.some((page) => page?.truncated === true)) {
    throw new Error("قراءة مراحل القضايا غير مكتملة.");
  }
  return pages.flatMap((page) => page?.data ?? []);
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
  | "outcome_pending"     // «قيد النظر»: no judgment → the degree stays open, no clock (LIVE-F15)
  | "no_trigger"          // final outcome, but no starting event/date chosen yet (CODE-F03)
  | "no_rule_for_degree"  // e.g. نقض / تنفيذ: nothing follows this degree
  | "rule_missing"        // the platform rule is inactive/absent on this database
  | "compute_failed"
  | "insert_failed"
  // older responses — kept so a cached screen still has a sentence for them
  | "no_closed_on"
  | "already_exists";

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

/**
 * `action` says what happened to the linked deadline — the screen shows each
 * one in its own words, never a silent "already exists" (LIVE-F25):
 *   created     — a new deadline row now exists;
 *   recomputed  — the stage's date/event changed, the open deadline moved
 *                 (`previous` is where it was);
 *   unchanged   — the same inputs as before, nothing to do;
 *   kept        — the linked deadline is already closed by the lawyer
 *                 (done/cancelled/missed), so it was NOT moved;
 *   cancelled   — the outcome went back to «قيد النظر» or the trigger was
 *                 cleared, so the open auto deadline was cancelled;
 *   skipped     — nothing was created, `skipped` says why.
 * `created` stays for older callers (true only for "created").
 */
export type AutoDeadlineResult =
  | { created: true; action: "created"; deadline: AutoDeadlineSummary }
  | { created: false; action: "recomputed"; deadline: AutoDeadlineSummary; previous: { dueDate: string; triggerDate: string } }
  | { created: false; action: "unchanged"; deadline: AutoDeadlineSummary }
  | { created: false; action: "kept"; deadline: AutoDeadlineSummary; deadlineStatus: string }
  | { created: false; action: "cancelled"; skipped: "outcome_pending" | "no_trigger"; cancelledCount: number }
  | { created: false; action?: "skipped"; skipped: AutoDeadlineSkipReason };

/**
 * PATCH the outcome (and optionally the closing date / trigger / notes) of a
 * degree. `autoDeadline` is null when the request touched nothing the
 * deadline depends on (notes only); otherwise it is ALWAYS an object.
 * `droppedForPending` — a closing date was sent with «قيد النظر» and dropped.
 */
export async function recordCaseStageOutcome(caseId: string, input: {
  id: string; outcome: string; closedOn?: string | null; notes?: string;
  triggerEvent?: StageTriggerEvent | null; triggerDate?: string | null;
}): Promise<{ stage: CaseStage; autoDeadline: AutoDeadlineResult | null; droppedForPending: boolean }> {
  const res = await apiMutate<{ data: CaseStage; autoDeadline?: AutoDeadlineResult | null; droppedForPending?: boolean }>(
    `/api/v1/lawyer/case-stages/${encodeURIComponent(caseId)}`, "PATCH", input,
  );
  return { stage: res.data, autoDeadline: res.autoDeadline ?? null, droppedForPending: res.droppedForPending === true };
}

/** Whether the screen showing a stage's deadlines should re-read them. */
export function autoDeadlineChanged(result: AutoDeadlineResult | null | undefined): boolean {
  if (!result) return false;
  return result.created || result.action === "recomputed" || result.action === "cancelled";
}
