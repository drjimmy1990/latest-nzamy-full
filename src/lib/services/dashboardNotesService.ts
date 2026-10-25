/**
 * dashboardNotesService.ts — typed client for /api/v1/lawyer/dashboard-notes
 * (N3.4, the sticky notes wall; public.dashboard_notes, 20261025_31).
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";
import type { DashboardNoteDto, NoteColor, NoteVisibility } from "@/lib/dashboardNotes/notesInput";

export type DashboardNote = DashboardNoteDto;

/** Fired after any create/edit/delete so every mounted wall re-reads. */
export const DASHBOARD_NOTES_EVENT = "nzamy-dashboard-notes-updated";

const BASE = "/api/v1/lawyer/dashboard-notes";

function announce() {
  try { window.dispatchEvent(new CustomEvent(DASHBOARD_NOTES_EVENT)); } catch {}
}

export async function getDashboardNotes(): Promise<ListRead<DashboardNote>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    return listFromApi(await apiGet<{ data: DashboardNote[] }>(BASE));
  } catch (error) {
    console.error("[dashboardNotesService] list failed:", error);
    return listFailed<DashboardNote>();
  }
}

export interface DashboardNoteInput {
  body: string;
  color: NoteColor;
  pinned?: boolean;
  visibility: NoteVisibility;
  caseRequestId?: string | null;
}

export async function createDashboardNote(input: DashboardNoteInput): Promise<DashboardNote> {
  if (!isSupabaseMode) throw new Error("الملاحظات غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: DashboardNote }>(BASE, "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم الملاحظة المحفوظة.");
  announce();
  return res.data;
}

export async function updateDashboardNote(id: string, patch: Partial<DashboardNoteInput>): Promise<DashboardNote> {
  if (!isSupabaseMode) throw new Error("الملاحظات غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: DashboardNote }>(`${BASE}/${encodeURIComponent(id)}`, "PATCH", patch);
  if (!res?.data) throw new Error("لم يُعِد الخادم الملاحظة المعدّلة.");
  announce();
  return res.data;
}

export async function deleteDashboardNote(id: string): Promise<void> {
  if (!isSupabaseMode) throw new Error("الملاحظات غير متاحة في وضع العرض التجريبي");
  await apiMutate<{ ok: true }>(`${BASE}/${encodeURIComponent(id)}`, "DELETE");
  announce();
}
