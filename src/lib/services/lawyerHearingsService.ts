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

import { apiGet, apiMutate } from "@/lib/services/api";

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
}

export async function createLawyerHearing(input: CreateHearingInput): Promise<HearingDto> {
  const res = await apiMutate<{ data: HearingDto }>("/api/v1/lawyer/hearings", "POST", input);
  return res.data;
}
