/**
 * firmCaseAssignService.ts — client for /api/v1/firm/cases/[id]/assign
 * (owner N03-40, «إسناد القضية إلى محامٍ في المكتب»).
 */

"use client";

import { apiGet, apiMutate } from "@/lib/services/api";

export interface FirmCaseAssignee {
  userId: string;
  name: string | null;
}

export interface FirmCaseAssignment {
  assignee: FirmCaseAssignee | null;
  options: FirmCaseAssignee[];
  /** The caller's firm role may assign (managing_partner, partner, senior_lawyer). */
  canAssign: boolean;
  /** The case carries the caller's firm id; false for a case routed in from outside. */
  assignable: boolean;
  /** Why a case cannot be assigned here, when `assignable` is false. */
  reason?: string;
}

export async function getFirmCaseAssignment(caseId: string): Promise<FirmCaseAssignment> {
  return apiGet<FirmCaseAssignment>(`/api/v1/firm/cases/${encodeURIComponent(caseId)}/assign`);
}

export async function assignFirmCase(caseId: string, assigneeUserId: string): Promise<FirmCaseAssignee> {
  const res = await apiMutate<{ assignee: FirmCaseAssignee }>(
    `/api/v1/firm/cases/${encodeURIComponent(caseId)}/assign`, "POST", { assigneeUserId },
  );
  return res.assignee;
}

/** «المحامي المسؤول» label for one option / the current assignee. */
export function firmAssigneeLabelAr(a: FirmCaseAssignee | null | undefined): string {
  if (!a) return "غير مُسندة بعد";
  return a.name?.trim() || "عضو في المكتب";
}
