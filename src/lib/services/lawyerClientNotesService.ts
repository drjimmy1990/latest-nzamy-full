/**
 * lawyerClientNotesService.ts
 * ─────────────────────────────────────────────────────────
 * Typed client for /api/v1/lawyer/clients/[id]/notes (Phase 2,
 * public.lawyer_client_notes). Confidential by construction: RLS shows a
 * `private` note to its author only and a `firm` note to the author's active
 * colleagues; the client the note is about is never a reader.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";

export type NoteVisibility = "private" | "firm";

export interface LawyerClientNote {
  id: string;
  clientId: string;
  authorUserId: string;
  /** true when the signed-in user wrote it — the only case the UI offers delete. */
  mine: boolean;
  visibility: NoteVisibility;
  body: string;
  createdAt: string;
  updatedAt: string;
  /** CODE-F36: set on an archived note (migration 20261030_30); null/absent on a live one. */
  archivedAt?: string | null;
}

const base = (clientId: string) => `/api/v1/lawyer/clients/${encodeURIComponent(clientId)}/notes`;

export async function getClientNotes(clientId: string): Promise<ListRead<LawyerClientNote>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    const body = await apiGet<{ data: LawyerClientNote[]; total?: number }>(base(clientId));
    return listFromApi(body);
  } catch (error) {
    console.error("[lawyerClientNotesService] getClientNotes failed:", error);
    return listFailed<LawyerClientNote>();
  }
}

export async function addClientNote(clientId: string, input: { body: string; visibility: NoteVisibility }): Promise<LawyerClientNote> {
  if (!isSupabaseMode) throw new Error("الملاحظات غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: LawyerClientNote }>(base(clientId), "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم الملاحظة المحفوظة.");
  return res.data;
}

/**
 * CODE-F36: «حذف» archives — the row stays and can be restored. Resolves with
 * the archived note as the server holds it. Before migration 20261030_30 the
 * server answers 503 and this throws its message; nothing is deleted.
 */
export async function archiveClientNote(clientId: string, noteId: string): Promise<LawyerClientNote> {
  if (!isSupabaseMode) throw new Error("الملاحظات غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: LawyerClientNote }>(`${base(clientId)}/${encodeURIComponent(noteId)}`, "DELETE");
  if (!res?.data) throw new Error("لم يُعِد الخادم الملاحظة المؤرشفة.");
  return res.data;
}

/** CODE-F36: undo / restore an archived note (the author's own). */
export async function restoreClientNote(clientId: string, noteId: string): Promise<LawyerClientNote> {
  if (!isSupabaseMode) throw new Error("الملاحظات غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: LawyerClientNote }>(`${base(clientId)}/${encodeURIComponent(noteId)}`, "PATCH", { action: "restore" });
  if (!res?.data) throw new Error("لم يُعِد الخادم الملاحظة المستعادة.");
  return res.data;
}

/**
 * CODE-F36: the caller's own archived notes on this card. `available: false`
 * means migration 20261030_30 has not run — nothing can be archived yet.
 */
export async function getArchivedClientNotes(clientId: string): Promise<{ read: ListRead<LawyerClientNote>; available: boolean }> {
  if (!isSupabaseMode) return { read: listOk([]), available: false };
  try {
    const body = await apiGet<{ data: LawyerClientNote[]; total?: number; archiveAvailable?: boolean }>(base(clientId), { archived: 1 });
    return { read: listFromApi(body), available: body.archiveAvailable !== false };
  } catch (error) {
    console.error("[lawyerClientNotesService] getArchivedClientNotes failed:", error);
    return { read: listFailed<LawyerClientNote>(), available: true };
  }
}
