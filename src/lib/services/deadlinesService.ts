/**
 * deadlinesService.ts
 * ─────────────────────────────────────────────────────────
 * Typed client for Phase 5 (رادار المهل): /api/v1/lawyer/deadlines,
 * /api/v1/deadline-rules, /api/v1/court-holidays.
 *
 * ONE DTO per concept, imported by every screen. The date math never happens
 * in a screen — the API computes `dueDate` with deadlineEngine.ts and returns
 * the explanation (`daysCount`, `rolledFromHoliday`, `rolledPast`).
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";
import type { HolidayRule } from "@/lib/services/deadlineEngine";

export type { HolidayRule };

export type DeadlineTrigger = "judgment" | "notification" | "hearing" | "stage_closed" | "manual";
export type DeadlineKind = "statutory" | "court_order" | "internal" | "contract";
export type DeadlineStatus = "open" | "done" | "missed" | "cancelled";
export type DeadlinePriority = "urgent" | "high" | "normal";

/** Mirrors public.deadline_rules. `verifiedByOwner === false` MUST render «قاعدة افتراضية — تحتاج مراجعتك». */
export interface DeadlineRule {
  id: string;
  code: string;
  /** null = platform rule; a user id = that lawyer's own override */
  ownerUserId: string | null;
  firmId: string | null;
  titleAr: string;
  descriptionAr: string;
  sourceAr: string;
  triggerKind: DeadlineTrigger;
  periodDays: number;
  calendar: "gregorian" | "hijri";
  countFromNextDay: boolean;
  rollForwardIfHoliday: boolean;
  appliesToDegrees: string[];
  isPlatformDefault: boolean;
  verifiedByOwner: boolean;
  verifiedAt: string | null;
  active: boolean;
}

/** Mirrors public.deadlines, plus the engine's explanation of the due date. */
export interface Deadline {
  id: string;
  ownerUserId: string;
  firmId: string | null;
  caseRequestId: string | null;
  caseTitle: string | null;
  stageId: string | null;
  hearingId: string | null;
  ruleId: string | null;
  ruleTitleAr: string | null;
  ruleVerified: boolean | null;
  title: string;
  kind: DeadlineKind;
  triggerDate: string;
  dueDate: string;
  dueDateHijri: string | null;
  daysCount: number | null;
  computedByRule: boolean;
  rolledFromHoliday: boolean;
  reminderOffsetsDays: number[];
  priority: DeadlinePriority;
  status: DeadlineStatus;
  completedAt: string | null;
  notes: string;
  /** Computed server-side from today's date: negative = overdue. */
  daysLeft: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeadlineInput {
  title: string;
  triggerDate: string;
  /** Either a rule (the API computes dueDate) … */
  ruleId?: string;
  /** … or a manual due date (kind defaults to 'internal'). */
  dueDate?: string;
  kind?: DeadlineKind;
  caseRequestId?: string;
  stageId?: string;
  hearingId?: string;
  priority?: DeadlinePriority;
  reminderOffsetsDays?: number[];
  notes?: string;
}

export interface UpdateDeadlineInput {
  status?: DeadlineStatus;
  priority?: DeadlinePriority;
  notes?: string;
  reminderOffsetsDays?: number[];
  /** Re-dating a manual deadline. Not allowed on a rule-computed one — recreate it. */
  dueDate?: string;
  title?: string;
}

/** What POST returns alongside the row when a rule was used — for the confirmation screen. */
export interface DeadlineComputation {
  dueDate: string;
  daysCount: number;
  rolledFromHoliday: boolean;
  rolledPast: { date: string; reason: "weekend" | "holiday"; titleAr?: string }[];
  dueDateHijri: string | null;
  hijriResolved: boolean;
}

const BASE = "/api/v1/lawyer/deadlines";

export async function getDeadlines(opts?: { status?: DeadlineStatus | "all"; caseId?: string; limit?: number }): Promise<ListRead<Deadline>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    const body = await apiGet<{ data: Deadline[]; total?: number }>(BASE, {
      status: opts?.status, caseId: opts?.caseId, limit: opts?.limit,
    });
    return listFromApi(body);
  } catch (error) {
    console.error("[deadlinesService] getDeadlines failed:", error);
    return listFailed<Deadline>();
  }
}

/** Throws with Arabic screen copy on failure. */
export async function createDeadline(input: CreateDeadlineInput): Promise<{ deadline: Deadline; computation: DeadlineComputation | null }> {
  if (!isSupabaseMode) throw new Error("رادار المهل غير متاح في وضع العرض التجريبي");
  const res = await apiMutate<{ data: Deadline; computation?: DeadlineComputation | null }>(BASE, "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم المهلة المحفوظة.");
  return { deadline: res.data, computation: res.computation ?? null };
}

export async function updateDeadline(id: string, patch: UpdateDeadlineInput): Promise<Deadline> {
  if (!isSupabaseMode) throw new Error("رادار المهل غير متاح في وضع العرض التجريبي");
  const res = await apiMutate<{ data: Deadline }>(`${BASE}/${encodeURIComponent(id)}`, "PATCH", patch);
  if (!res?.data) throw new Error("لم يُعِد الخادم المهلة بعد التعديل.");
  return res.data;
}

export async function getDeadlineRules(): Promise<ListRead<DeadlineRule>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    const body = await apiGet<{ data: DeadlineRule[]; total?: number }>("/api/v1/deadline-rules");
    return listFromApi(body);
  } catch (error) {
    console.error("[deadlinesService] getDeadlineRules failed:", error);
    return listFailed<DeadlineRule>();
  }
}

/** Admin (the owner) confirms or un-confirms a platform rule; a lawyer can only touch their own override. */
export async function setRuleVerified(ruleId: string, verified: boolean): Promise<DeadlineRule> {
  if (!isSupabaseMode) throw new Error("غير متاح في وضع العرض التجريبي");
  const res = await apiMutate<{ data: DeadlineRule }>(`/api/v1/deadline-rules/${encodeURIComponent(ruleId)}`, "PATCH", { verifiedByOwner: verified });
  if (!res?.data) throw new Error("لم يُعِد الخادم القاعدة بعد التعديل.");
  return res.data;
}

export async function getCourtHolidays(): Promise<ListRead<HolidayRule>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    const body = await apiGet<{ data: HolidayRule[]; total?: number }>("/api/v1/court-holidays");
    return listFromApi(body);
  } catch (error) {
    console.error("[deadlinesService] getCourtHolidays failed:", error);
    return listFailed<HolidayRule>();
  }
}
