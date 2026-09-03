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

export async function deleteClientNote(clientId: string, noteId: string): Promise<void> {
  if (!isSupabaseMode) throw new Error("الملاحظات غير متاحة في وضع العرض التجريبي");
  await apiMutate<void>(`${base(clientId)}/${encodeURIComponent(noteId)}`, "DELETE");
}
