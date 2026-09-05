/**
 * caseNotesService.ts
 * ─────────────────────────────────────────────────────────
 * Typed client for /api/v1/cases/[id]/notes (owner item 65 remainder,
 * public.case_notes). Modeled on lawyerClientNotesService.ts: RLS shows a
 * `private` note to its author only and a `firm` note to the author's active
 * colleagues too — the client-facing shape here just adds update, since a
 * case note (unlike a client-card note) is expected to be corrected in place.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";

export type CaseNoteVisibility = "private" | "firm";

export interface CaseNote {
  id: string;
  requestId: string;
  authorUserId: string;
  authorName: string;
  /** false when `authorName` is a placeholder ("أنت" / "محامٍ"), not a real display name — do not build an avatar initial from it. */
  authorNameKnown: boolean;
  /** true when the signed-in user wrote it — the only case the UI offers edit/delete. */
  mine: boolean;
  firmId: string | null;
  visibility: CaseNoteVisibility;
  body: string;
  createdAt: string;
  updatedAt: string;
}

const base = (caseId: string) => `/api/v1/cases/${encodeURIComponent(caseId)}/notes`;

export async function getCaseNotes(caseId: string): Promise<ListRead<CaseNote>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    const body = await apiGet<{ data: CaseNote[]; total?: number }>(base(caseId));
    return listFromApi(body);
  } catch (error) {
    console.error("[caseNotesService] getCaseNotes failed:", error);
    return listFailed<CaseNote>();
  }
}

export async function addCaseNote(
  caseId: string,
  input: { body: string; visibility: CaseNoteVisibility },
): Promise<CaseNote> {
  if (!isSupabaseMode) throw new Error("الملاحظات غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: CaseNote }>(base(caseId), "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم الملاحظة المحفوظة.");
  return res.data;
}

export async function updateCaseNote(
  caseId: string,
  noteId: string,
  input: Partial<{ body: string; visibility: CaseNoteVisibility }>,
): Promise<CaseNote> {
  if (!isSupabaseMode) throw new Error("الملاحظات غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: CaseNote }>(`${base(caseId)}/${encodeURIComponent(noteId)}`, "PATCH", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم الملاحظة المحدَّثة.");
  return res.data;
}

export async function deleteCaseNote(caseId: string, noteId: string): Promise<void> {
  if (!isSupabaseMode) throw new Error("الملاحظات غير متاحة في وضع العرض التجريبي");
  await apiMutate<void>(`${base(caseId)}/${encodeURIComponent(noteId)}`, "DELETE");
}
