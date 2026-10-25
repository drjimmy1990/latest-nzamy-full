/**
 * caseNotesService.ts
 * ─────────────────────────────────────────────────────────
 * Typed client for /api/v1/cases/[id]/notes (owner item 65 remainder,
 * public.case_notes). Modeled on lawyerClientNotesService.ts: RLS shows a
 * `private` note to its author only, a `case_team` note to the case team and a
 * `firm` note to the author's active colleagues too — the client-facing shape here just adds update, since a
 * case note (unlike a client-card note) is expected to be corrected in place.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";
import type { ArchivedView } from "@/lib/services/archivedView";

/**
 * Owner decision ١٦٩ (migration 20261017_41): `private` = the author alone;
 * `case_team` = the case team (see caseTeamService.ts); `firm` = every active
 * member of the case's firm.
 */
export type CaseNoteVisibility = "private" | "case_team" | "firm";

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

/**
 * ARCHIVES the note — it is not deleted (N3.9, owner directive ٥,
 * migration 20261025_51). The author alone may archive; the case's
 * supervisors (firm owner, case lead) can restore it from «المحذوفات»
 * (`getCaseArchive` / `restoreArchived` below). Throws the route's Arabic
 * message on failure, including the 503 «الأرشفة غير متاحة بعد…» before the
 * migration runs.
 */
export async function deleteCaseNote(caseId: string, noteId: string): Promise<void> {
  if (!isSupabaseMode) throw new Error("الملاحظات غير متاحة في وضع العرض التجريبي");
  await apiMutate<void>(`${base(caseId)}/${encodeURIComponent(noteId)}`, "DELETE");
}

/** «المحذوفات» of a case: archived notes and documents the caller may restore. */
export async function getCaseArchive(caseId: string): Promise<ArchivedView> {
  if (!isSupabaseMode) return { available: false, notes: [], documents: [] };
  const res = await apiGet<{ data: ArchivedView }>(`/api/v1/cases/${encodeURIComponent(caseId)}/archived`);
  return res?.data ?? { available: false, notes: [], documents: [] };
}

/** One-click restore of an archived note or document. Throws the route's Arabic message. */
export async function restoreArchived(caseId: string, kind: "note" | "document", id: string): Promise<void> {
  if (!isSupabaseMode) throw new Error("الاسترجاع غير متاح في وضع العرض التجريبي");
  await apiMutate(`/api/v1/cases/${encodeURIComponent(caseId)}/archived`, "POST", { kind, id });
}

/**
 * Shared notes (`case_team` / `firm`) the caller can read, per case id — the
 * «📝 ملاحظة مشتركة» marker on the cases list (owner decision ١٦٩). An empty
 * object on failure: a missing marker is the honest fallback, never a guess.
 */
export async function getSharedNoteCounts(caseIds: string[]): Promise<Record<string, number>> {
  if (!isSupabaseMode || caseIds.length === 0) return {};
  try {
    const body = await apiGet<{ data: Record<string, number> }>("/api/v1/cases/shared-notes", {
      ids: caseIds.slice(0, 200).join(","),
    });
    return body?.data ?? {};
  } catch (error) {
    console.error("[caseNotesService] getSharedNoteCounts failed:", error);
    return {};
  }
}
