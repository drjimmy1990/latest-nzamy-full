/**
 * _shared.ts — the ONE row → DTO mapping for the lawyer consultation routes.
 * ─────────────────────────────────────────────────────────
 * Every /api/v1/lawyer/consultations/* route imports its select, mapper and
 * hydration from here, so a column added to the DTO is added in exactly one
 * place. Server-only (imports the service client for display-name hydration
 * — used ONLY after RLS has scoped the ids, per house rule).
 *
 * `public.consultations` (20260905_phase3_consultations_and_contracts.sql)
 * carries the lifecycle; the human-facing title/description/status live on
 * the `service_requests` row it was born from (DECISION 2 — a trigger
 * guarantees exactly one consultations row per consultation request). A firm
 * colleague may be able to read the consultation row (Phase 1 access test)
 * but not its request row (participant-only RLS on service_requests) — that
 * is expected, not an error, so the request lookup below degrades to a
 * neutral fallback instead of failing the whole list.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import type { LawyerConsultation } from "@/lib/services/lawyerConsultationsService";
import type { ConsultationMode, ConsultationOutcome, ConsultationStatus } from "@/lib/services/consultationVocabulary";

export const CONSULTATION_SELECT =
  "id, request_id, requester_user_id, lawyer_user_id, firm_id, lawyer_client_id, mode, specialty, " +
  "scheduled_at, duration_minutes, ended_at, status, outcome, opinion_text, opinion_delivered_at, " +
  "opinion_attachment_path, converted_case_request_id, fee_sar, fee_paid, cancelled_reason, created_at, updated_at";

export interface ConsultationRow {
  id: string;
  request_id: string;
  requester_user_id: string | null;
  lawyer_user_id: string | null;
  firm_id: string | null;
  lawyer_client_id: string | null;
  mode: string;
  specialty: string | null;
  scheduled_at: string | null;
  duration_minutes: number | null;
  ended_at: string | null;
  status: string;
  outcome: string | null;
  opinion_text: string | null;
  opinion_delivered_at: string | null;
  opinion_attachment_path: string | null;
  converted_case_request_id: string | null;
  fee_sar: number | string | null;
  fee_paid: boolean;
  cancelled_reason: string | null;
  created_at: string;
  updated_at: string;
}

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface ConsultationExtras {
  clientName?: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  title?: string;
  description?: string;
  requestStatus?: string;
  notesCount?: number;
}

/** Maps one `consultations` row (+ hydrated extras) to the `LawyerConsultation` DTO. */
export function toConsultationDto(row: ConsultationRow, extras: ConsultationExtras = {}): LawyerConsultation {
  return {
    id: row.id,
    requestId: row.request_id,
    requesterUserId: row.requester_user_id,
    clientName: extras.clientName ?? "عميل نظامي",
    clientEmail: extras.clientEmail ?? null,
    clientPhone: extras.clientPhone ?? null,
    lawyerClientId: row.lawyer_client_id,
    lawyerUserId: row.lawyer_user_id,
    firmId: row.firm_id,
    title: extras.title ?? "استشارة",
    description: extras.description ?? "",
    specialty: row.specialty,
    mode: row.mode as ConsultationMode,
    status: row.status as ConsultationStatus,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    endedAt: row.ended_at,
    outcome: row.outcome as ConsultationOutcome | null,
    opinionText: row.opinion_text,
    opinionDeliveredAt: row.opinion_delivered_at,
    convertedCaseRequestId: row.converted_case_request_id,
    feeSar: num(row.fee_sar),
    feePaid: !!row.fee_paid,
    cancelledReason: row.cancelled_reason,
    requestStatus: extras.requestStatus ?? "",
    notesCount: extras.notesCount ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface RequesterJson {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
}

/**
 * Batch-hydrates a page of consultation rows: the linked `service_requests`
 * row (title/description/status), the requester's display name/email/phone
 * (profiles else the `requester` jsonb the booking wizard captured), and a
 * per-consultation note count — three RLS-scoped queries total (plus one
 * service-role profiles lookup), never one per row.
 */
export async function hydrateConsultations(
  supabase: SupabaseClient,
  rows: ConsultationRow[],
): Promise<Map<string, ConsultationExtras>> {
  const out = new Map<string, ConsultationExtras>();
  if (rows.length === 0) return out;

  const requestIds = [...new Set(rows.map((r) => r.request_id))];
  const requesterIds = [...new Set(rows.map((r) => r.requester_user_id).filter((v): v is string => !!v))];
  const consultationIds = rows.map((r) => r.id);

  const [requestsRes, notesRes] = await Promise.all([
    supabase.from("service_requests").select("id, title, description, status, requester").in("id", requestIds),
    supabase.from("consultation_notes").select("consultation_id").in("consultation_id", consultationIds),
  ]);
  if (requestsRes.error) {
    console.error("[lawyer/consultations/_shared] service_requests read failed:", requestsRes.error.message, requestsRes.error.code);
  }
  if (notesRes.error) {
    console.error("[lawyer/consultations/_shared] notes count failed:", notesRes.error.message, notesRes.error.code);
  }

  const requests = new Map<string, { title: string; description: string; status: string; requester: RequesterJson }>();
  for (const r of (requestsRes.data ?? []) as Array<{
    id: string; title: string | null; description: string | null; status: string | null; requester: RequesterJson | null;
  }>) {
    requests.set(r.id, {
      title: r.title || "استشارة",
      description: r.description || "",
      status: r.status || "",
      requester: r.requester ?? {},
    });
  }

  const notesCounts = new Map<string, number>();
  for (const n of (notesRes.data ?? []) as Array<{ consultation_id: string }>) {
    notesCounts.set(n.consultation_id, (notesCounts.get(n.consultation_id) ?? 0) + 1);
  }

  const profiles = new Map<string, { name?: string; email?: string | null; phone?: string | null }>();
  if (requesterIds.length > 0) {
    try {
      const service = await createServiceClient();
      const { data, error } = await service.from("profiles").select("id, display_name, email, phone").in("id", requesterIds);
      if (error) {
        console.error("[lawyer/consultations/_shared] profile lookup failed:", error.message, error.code);
      } else {
        for (const p of (data ?? []) as Array<{ id: string; display_name: string | null; email: string | null; phone: string | null }>) {
          profiles.set(p.id, { name: p.display_name || undefined, email: p.email, phone: p.phone });
        }
      }
    } catch (err) {
      console.error("[lawyer/consultations/_shared] profile lookup threw:", err);
    }
  }

  for (const row of rows) {
    const req = requests.get(row.request_id);
    const profile = row.requester_user_id ? profiles.get(row.requester_user_id) : undefined;
    const requesterJson = req?.requester ?? {};
    const clientName =
      profile?.name ||
      (typeof requesterJson.name === "string" && requesterJson.name.trim() ? requesterJson.name : undefined) ||
      "عميل نظامي";
    const clientEmail = profile?.email ?? (typeof requesterJson.email === "string" ? requesterJson.email : null);
    const clientPhone = profile?.phone ?? (typeof requesterJson.phone === "string" ? requesterJson.phone : null);

    out.set(row.id, {
      clientName,
      clientEmail,
      clientPhone,
      title: req?.title ?? "استشارة",
      description: req?.description ?? "",
      requestStatus: req?.status ?? "",
      notesCount: notesCounts.get(row.id) ?? 0,
    });
  }
  return out;
}

/** Postgres error → HTTP status + Arabic message. 23505 duplicate · 23514 CHECK · 23503 FK · 42501 RLS. */
export function consultationDbErrorResponse(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code;
  // Note: 23505 here is the generic case (the only UNIQUE constraints on
  // `consultations` are `id` and `request_id`, neither written by PATCH or
  // /opinion) — the convert route's own conflict has a specific 409 branch
  // before ever reaching this helper.
  if (code === "23505") return { status: 409, message: "هذه الاستشارة مسجَّلة مسبقاً." };
  if (code === "23514") return { status: 400, message: "بيانات الاستشارة غير صالحة." };
  if (code === "23503") return { status: 400, message: "الاستشارة تشير إلى سجلّ غير موجود." };
  if (code === "42501") return { status: 403, message: "غير مصرح لك بهذا الإجراء." };
  return { status: 500, message: "تعذّر حفظ الاستشارة." };
}

/** The 403 answered whenever an RLS-scoped write matches 0 rows (a client account read but cannot write). */
export const CONSULTATION_FORBIDDEN = { error: "غير مصرح لك بتعديل هذه الاستشارة" } as const;
