/**
 * lawyerHearingsService.ts
 * ─────────────────────────────────────────────────────────
 * Typed client for /api/v1/lawyer/hearings (Phase 1, public.hearings).
 *
 * The wire shape (HearingDto) is defined ONCE here and imported by every
 * screen that reads or writes a hearing — the standalone diary
 * (/dashboard/lawyer/hearings) and the case-file hearings tab
 * (/dashboard/lawyer/cases/[id]) both need it, and a second hand-typed copy
 * of the same interface is exactly how this platform ended up with three
 * silently-disagreeing readers of one concept before this wave.
 */

"use client";

import { apiGet, mutateWithOverlapCode } from "@/lib/services/api";
import { isDemoMode } from "@/lib/runtimeMode";

export interface HearingHistoryEntryDto {
  at: string;
  by: string;
  action: string;
  reason?: string;
  fromDate?: string;
  toDate?: string;
  fromTime?: string | null;
  toTime?: string | null;
  fromStatus?: string;
  toStatus?: string;
  fields?: string[];
}

export interface HearingDto {
  id: string;
  title: string;
  /** UI vocabulary: hearing / deadline / gov_review / client_meet / internal. */
  type: string;
  caseRequestId: string | null;
  caseName?: string;
  /** "YYYY-MM-DD" */
  date: string;
  time?: string | null;
  location?: string;
  /** UI vocabulary: critical / high / normal. */
  urgency: string;
  notes?: string;
  status: string;
  /** hearings.duration_minutes — «مدة الجلسة» (owner item 59). null when not recorded. */
  durationMinutes?: number | null;
  /** CODE-F18: the row's change log (metadata.history), oldest first. */
  history?: HearingHistoryEntryDto[];
  /** N01-18: the colleague who attends for the firm; null = the owner. */
  assigneeUserId?: string | null;
  /** His display name, when the server could show it (the caller's firm only). */
  assigneeName?: string | null;
  /** False for a hearing a colleague assigned to the caller: outcome actions only. */
  isOwn?: boolean;
  /** For a hearing assigned to the caller: who scheduled it. */
  ownerName?: string | null;
  /** N13: the linked case's columns for the hearings table (null when unlinked / unreadable). */
  caseInfo?: { reference: string | null; court: string | null; circuit: string | null; client: string | null } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface GetHearingsResult {
  hearings: HearingDto[];
  /** True when the server holds more rows than `limit` returned. */
  truncated: boolean;
}

/**
 * GET hearings for the current lawyer, optionally scoped to one case.
 * Throws on a non-2xx response — callers decide how to render that, the same
 * contract apiGet already gives every other caller in this codebase.
 */
export async function getLawyerHearings(opts?: { caseId?: string; limit?: number }): Promise<GetHearingsResult> {
  const res = await apiGet<{ data: HearingDto[]; total?: number }>("/api/v1/lawyer/hearings", {
    caseId: opts?.caseId,
    limit: opts?.limit,
  });
  const hearings = res.data ?? [];
  return { hearings, truncated: (res.total ?? hearings.length) > hearings.length };
}

export interface CreateHearingInput {
  type: string;
  date: string;
  time?: string;
  caseName?: string;
  caseRequestId?: string;
  urgency?: string;
  location?: string;
  notes?: string;
  title: string;
  /** «مدة الجلسة» in minutes (5–1440); null/absent = not set. */
  durationMinutes?: number | null;
  /** Save even though the slot overlaps a consultation or another hearing (q357). */
  confirmOverlap?: boolean;
  /** N01-18: a colleague (active firm member) who attends; absent/null = the caller. */
  assigneeUserId?: string | null;
}

/**
 * Thrown when the server answers 409 `hearing_overlap` (owner q357): the
 * hearing shares time with a scheduled consultation or another hearing of the
 * same lawyer. The screen shows `message` and offers to resend with
 * `confirmOverlap: true`. PATCH has two other 409s (a stale row, an action not
 * allowed) — they stay plain Errors, told apart by `code`, not status.
 */
export class HearingOverlapError extends Error {
  readonly conflicts: Array<{ kind: string; id: string; scheduledAt: string; durationMinutes: number }>;
  constructor(message: string, conflicts: HearingOverlapError["conflicts"]) {
    super(message);
    this.name = "HearingOverlapError";
    this.conflicts = conflicts;
  }
}

/** apiMutate's demo guard, then the shared overlap mutate (api.ts) with `hearing_overlap`. */
async function mutateHearing<T>(url: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  if (isDemoMode) {
    throw new Error("وضع العرض التجريبي محلي بالكامل: لا يُرسَل أي حفظ أو تعديل إلى الخادم.");
  }
  return mutateWithOverlapCode<T>(url, method, body, "hearing_overlap", (message, conflicts) =>
    new HearingOverlapError(message, conflicts as HearingOverlapError["conflicts"]));
}

export async function createLawyerHearing(input: CreateHearingInput): Promise<HearingDto> {
  const res = await mutateHearing<{ data: HearingDto }>("/api/v1/lawyer/hearings", "POST", input);
  return res.data;
}

/**
 * CODE-F18: edit / postpone / cancel / «انعقدت» / reopen one hearing. The rules
 * (and which actions need a reason) are src/lib/services/hearingChange.ts.
 * Throws with the server's Arabic message on any non-2xx; resolves with the
 * row as the server stored it, so the caller shows that, not its own guess.
 */
export interface UpdateHearingInput {
  action: "edit" | "postpone" | "cancel" | "complete" | "reopen";
  reason?: string;
  date?: string;
  time?: string | null;
  title?: string;
  type?: string;
  location?: string;
  notes?: string;
  urgency?: string;
  durationMinutes?: number | null;
  caseRequestId?: string | null;
  /** Save even though the new slot overlaps (q357); see HearingOverlapError. */
  confirmOverlap?: boolean;
  /** N01-18 (owner, action "edit"): re-assign; null/"" = the owner attends. */
  assigneeUserId?: string | null;
}

export async function updateLawyerHearing(id: string, input: UpdateHearingInput): Promise<HearingDto> {
  const res = await mutateHearing<{ data: HearingDto }>(`/api/v1/lawyer/hearings/${encodeURIComponent(id)}`, "PATCH", input);
  return res.data;
}

/** N01-18: one option of the «المحامي المُكلَّف بالجلسة» picker. */
export interface HearingAssigneeOption {
  userId: string;
  name: string | null;
  isSelf: boolean;
}

/**
 * The picker's options: the caller first, then the active pleading members of
 * his firm. `null` for a solo lawyer (no firm — nobody else to name) and on a
 * failed read, so the form hides the picker and the hearing stays the caller's.
 */
export async function getHearingAssigneeOptions(): Promise<HearingAssigneeOption[] | null> {
  if (isDemoMode) return null;
  try {
    const res = await apiGet<{ data?: HearingAssigneeOption[]; firm?: boolean }>("/api/v1/lawyer/hearings/assignees");
    const options = Array.isArray(res.data) ? res.data : [];
    return res.firm === true && options.length > 1 ? options : null;
  } catch {
    return null;
  }
}
