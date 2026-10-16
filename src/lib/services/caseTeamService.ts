/**
 * caseTeamService.ts — typed client for /api/v1/cases/[id]/team (owner
 * decision ١٦٩, migration 20261017_41). Who reads a «فريق القضية» note is
 * decided in SQL (`public.case_team_user_ids`); this only fetches the answer
 * and adds/removes explicitly added members.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import type { CaseTeamDto } from "@/app/api/v1/cases/[id]/team/_team";

export type { CaseTeamDto, CaseTeamPerson, CaseTeamCandidate } from "@/app/api/v1/cases/[id]/team/_team";

const base = (caseId: string) => `/api/v1/cases/${encodeURIComponent(caseId)}/team`;

/**
 * `null` = the team could not be read (network, 5xx, or 20261017_41 not run
 * yet). The case page then does not offer «فريق القضية» rather than offering
 * a scope it cannot describe.
 */
export async function getCaseTeam(caseId: string): Promise<CaseTeamDto | null> {
  if (!isSupabaseMode) return null;
  try {
    const body = await apiGet<{ data: CaseTeamDto }>(base(caseId));
    return body?.data ?? null;
  } catch (error) {
    console.error("[caseTeamService] getCaseTeam failed:", error);
    return null;
  }
}

export async function addCaseTeamMember(caseId: string, userId: string): Promise<void> {
  if (!isSupabaseMode) throw new Error("فريق القضية غير متاح في وضع العرض التجريبي");
  await apiMutate<{ ok: true }>(base(caseId), "POST", { userId });
}

export async function removeCaseTeamMember(caseId: string, userId: string): Promise<void> {
  if (!isSupabaseMode) throw new Error("فريق القضية غير متاح في وضع العرض التجريبي");
  await apiMutate<void>(`${base(caseId)}/${encodeURIComponent(userId)}`, "DELETE");
}
