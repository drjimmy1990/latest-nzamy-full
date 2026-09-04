/**
 * lawyerConsultationsService.ts
 * ─────────────────────────────────────────────────────────
 * Typed client for the LAWYER side of Phase 3 (الاستشارات):
 *   GET/PATCH  /api/v1/lawyer/consultations[/[id]]
 *   POST       /api/v1/lawyer/consultations/[id]/opinion   — deliver the written opinion
 *   POST       /api/v1/lawyer/consultations/[id]/convert   — convert to a case, once
 *   GET/POST   /api/v1/lawyer/consultations/[id]/notes     — private / firm notes
 *   DELETE     /api/v1/lawyer/consultations/[id]/notes/[noteId]
 *
 * ONE DTO per concept, imported by the lawyer AND firm screens. The client's
 * own view of a consultation stays in casesService.getConsultations
 * (/api/v1/consultations) — it never sees notes, and sees `opinionText` only
 * because the database allows an opinion row-value only once delivered.
 *
 * The booking itself is still a service_requests row (POST /api/v1/service-requests,
 * type "consultation"); the working record below is created by the database
 * trigger the moment that row exists.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";
import type { ConsultationMode, ConsultationOutcome, ConsultationStatus } from "@/lib/services/consultationVocabulary";

export type { ConsultationMode, ConsultationOutcome, ConsultationStatus };

/** Mirrors public.consultations joined with its service_requests row. */
export interface LawyerConsultation {
  id: string;
  requestId: string;
  /** The platform account that booked, or null when the lawyer booked on a walk-in's behalf. */
  requesterUserId: string | null;
  /** Display name: the account's profile, else the name typed in the booking. Never empty. */
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  lawyerClientId: string | null;
  lawyerUserId: string | null;
  firmId: string | null;
  title: string;
  description: string;
  specialty: string | null;
  mode: ConsultationMode;
  status: ConsultationStatus;
  scheduledAt: string | null;
  durationMinutes: number | null;
  endedAt: string | null;
  outcome: ConsultationOutcome | null;
  opinionText: string | null;
  opinionDeliveredAt: string | null;
  convertedCaseRequestId: string | null;
  feeSar: number | null;
  feePaid: boolean;
  cancelledReason: string | null;
  /** service_requests.status — the platform workflow, kept in step by the API. */
  requestStatus: string;
  notesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConsultationNote {
  id: string;
  consultationId: string;
  authorUserId: string;
  authorName: string | null;
  visibility: "private" | "firm";
  body: string;
  createdAt: string;
}

export interface UpdateConsultationInput {
  status?: ConsultationStatus;
  /** ISO timestamp; required when moving to `scheduled`. */
  scheduledAt?: string | null;
  durationMinutes?: number | null;
  mode?: ConsultationMode;
  specialty?: string | null;
  outcome?: ConsultationOutcome | null;
  feeSar?: number | null;
  feePaid?: boolean;
  cancelledReason?: string | null;
  lawyerClientId?: string | null;
}

const BASE = "/api/v1/lawyer/consultations";
const path = (id: string, ...rest: string[]) => [BASE, encodeURIComponent(id), ...rest].join("/");

export async function getLawyerConsultations(opts?: { status?: ConsultationStatus | "all"; limit?: number }): Promise<ListRead<LawyerConsultation>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    const body = await apiGet<{ data: LawyerConsultation[]; total?: number }>(BASE, { status: opts?.status, limit: opts?.limit });
    return listFromApi(body);
  } catch (error) {
    console.error("[lawyerConsultationsService] getLawyerConsultations failed:", error);
    return listFailed<LawyerConsultation>();
  }
}

/** Throws with Arabic screen copy (404 → «الاستشارة غير موجودة»). */
export async function getLawyerConsultation(id: string): Promise<LawyerConsultation> {
  if (!isSupabaseMode) throw new Error("الاستشارات غير متاحة في وضع العرض التجريبي");
  const res = await apiGet<{ data: LawyerConsultation }>(path(id));
  if (!res?.data) throw new Error("الاستشارة غير موجودة");
  return res.data;
}

export async function updateLawyerConsultation(id: string, patch: UpdateConsultationInput): Promise<LawyerConsultation> {
  if (!isSupabaseMode) throw new Error("الاستشارات غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: LawyerConsultation }>(path(id), "PATCH", patch);
  if (!res?.data) throw new Error("لم يُعِد الخادم الاستشارة بعد التعديل.");
  return res.data;
}

/** Delivers the written opinion: stores it, stamps the delivery time, completes the consultation, notifies the client. */
export async function deliverConsultationOpinion(id: string, opinionText: string): Promise<LawyerConsultation> {
  if (!isSupabaseMode) throw new Error("الاستشارات غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: LawyerConsultation }>(path(id, "opinion"), "POST", { opinionText });
  if (!res?.data) throw new Error("لم يُعِد الخادم الاستشارة بعد تسليم الرأي.");
  return res.data;
}

/** Creates the case (a service_requests row with source_consultation_id) — a second call is a 409. */
export async function convertConsultationToCase(id: string, input?: { title?: string }): Promise<{ consultation: LawyerConsultation; caseRequestId: string }> {
  if (!isSupabaseMode) throw new Error("الاستشارات غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: LawyerConsultation; caseRequestId: string }>(path(id, "convert"), "POST", input ?? {});
  if (!res?.data || !res.caseRequestId) throw new Error("لم يُعِد الخادم القضية الجديدة.");
  return { consultation: res.data, caseRequestId: res.caseRequestId };
}

export async function getConsultationNotes(id: string): Promise<ListRead<ConsultationNote>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    const body = await apiGet<{ data: ConsultationNote[]; total?: number }>(path(id, "notes"));
    return listFromApi(body);
  } catch (error) {
    console.error("[lawyerConsultationsService] getConsultationNotes failed:", error);
    return listFailed<ConsultationNote>();
  }
}

export async function addConsultationNote(id: string, input: { body: string; visibility: "private" | "firm" }): Promise<ConsultationNote> {
  if (!isSupabaseMode) throw new Error("الاستشارات غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: ConsultationNote }>(path(id, "notes"), "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم الملاحظة المحفوظة.");
  return res.data;
}

export async function deleteConsultationNote(id: string, noteId: string): Promise<void> {
  if (!isSupabaseMode) throw new Error("الاستشارات غير متاحة في وضع العرض التجريبي");
  await apiMutate<{ ok: true }>(path(id, "notes", encodeURIComponent(noteId)), "DELETE", {});
}
