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

import { apiGet } from "@/lib/services/api";
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

/** apiMutate, plus the overlap warning it cannot express (it keeps only `error`). */
async function mutateHearing<T>(url: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  if (isDemoMode) {
    throw new Error("وضع العرض التجريبي محلي بالكامل: لا يُرسَل أي حفظ أو تعديل إلى الخادم.");
  }
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: "Request failed" }));
    if (response.status === 409 && errorBody?.code === "hearing_overlap") {
      throw new HearingOverlapError(errorBody.error, Array.isArray(errorBody.conflicts) ? errorBody.conflicts : []);
    }
    throw new Error(errorBody.error || `API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
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
}

export async function updateLawyerHearing(id: string, input: UpdateHearingInput): Promise<HearingDto> {
  const res = await mutateHearing<{ data: HearingDto }>(`/api/v1/lawyer/hearings/${encodeURIComponent(id)}`, "PATCH", input);
  return res.data;
}
