/**
 * casesService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode cases & consultations service.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import {
  SHARED_CASES,
  getActiveCases as getActiveCasesLocal,
  getCaseTypeLabel,
} from "@/lib/casesStore";
import type { SharedCase, CaseStatus, CaseType, CasePriority } from "@/lib/casesStore";
import { readWorkflowRequestsLocal } from "@/lib/clientWorkflowRepository";
import type { WorkflowRequest } from "@/lib/workflowStore";

// Re-export
export type { SharedCase, CaseStatus, CaseType, CasePriority };
export { getCaseTypeLabel };

// ─── Consultation types ───────────────────────────────────────────────────────

export interface Consultation {
  id: string;
  client_id: string;
  lawyer_id?: string;
  type: string;
  topic: string;
  description: string;
  status: "requested" | "scheduled" | "completed" | "cancelled";
  scheduled_at?: string;
  notes?: string;
  created_at: string;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getCases(opts?: {
  status?: CaseStatus;
  type?: CaseType;
  limit?: number;
  offset?: number;
}): Promise<SharedCase[]> {
  if (!isSupabaseMode) {
    let cases = [...SHARED_CASES];
    if (opts?.status) cases = cases.filter(c => c.status === opts.status);
    if (opts?.type) cases = cases.filter(c => c.type === opts.type);
    return cases;
  }
  try {
    const response = await apiGet<{ data: SharedCase[] }>("/api/v1/cases", {
      status: opts?.status,
      type: opts?.type,
      limit: opts?.limit,
      offset: opts?.offset,
    });
    return response.data;
  } catch (error) {
    console.error('[Nzamy] getCases API failed:', error);
    return [];
  }
}

export async function getActiveCases(): Promise<SharedCase[]> {
  if (!isSupabaseMode) return getActiveCasesLocal();
  return getCases({ status: "active" });
}

export async function getCaseDetail(id: string): Promise<SharedCase | null> {
  if (!isSupabaseMode) return SHARED_CASES.find(c => c.id === id) || null;
  try {
    const response = await apiGet<{ data: SharedCase }>(`/api/v1/cases/${id}`);
    return response.data ?? null;
  } catch (error) {
    console.error('[Nzamy] getCaseDetail API failed:', error);
    return null;
  }
}

// ─── Service Request Detail (workflow / Kanban source-of-truth) ───────────────
// The lawyer Kanban + client case list read from `service_requests` (via
// workflowService / clientWorkflowRepository), NOT the `cases` table. Detail
// pages MUST use this function — `getCaseDetail` above reads the separate,
// mostly-unused `cases` table and will 404 for real workflow cases.

export interface ServiceRequestEvent {
  id?: string;
  event: string;
  actor_user_id?: string | null;
  actor_name?: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

export interface ServiceRequestAttachment {
  id: string;
  name: string;
  file_size: number | null;
  storage_path: string;
  mime_type?: string | null;
  created_at: string;
}

export interface ServiceRequestDetail {
  id: string;
  createdAt: string | null;
  type: string;
  title: string;
  description: string;
  requester: {
    name: string;
    role?: string;
    tier?: string;
    userId?: string;
    [key: string]: unknown;
  };
  receiver: string;
  status: string;
  payment: { amount: number; status?: string; [key: string]: unknown };
  sourcePath: string;
  metadata: Record<string, unknown> | null;
  assignedTo: string | null;
  events: ServiceRequestEvent[];
  attachments: ServiceRequestAttachment[];
}

export async function getServiceRequestDetail(
  id: string,
): Promise<ServiceRequestDetail | null> {
  if (!isSupabaseMode) {
    // Demo mode: look up the local workflow store by id. Local WorkflowRequest
    // rows don't carry events/attachments, so synthesize an empty list.
    const found = readWorkflowRequestsLocal().find((r) => r.id === id);
    if (!found) return null;
    return mapLocalWorkflowRequest(found);
  }
  try {
    const r = await apiGet<{ data: ServiceRequestDetail }>(
      `/api/v1/service-requests/${id}`,
    );
    return r.data ?? null;
  } catch (e) {
    console.error("[casesService] getServiceRequestDetail failed:", e);
    return null;
  }
}

/** Map a local WorkflowRequest (demo store) to the ServiceRequestDetail shape. */
function mapLocalWorkflowRequest(r: WorkflowRequest): ServiceRequestDetail {
  return {
    id: r.id,
    createdAt: r.createdAt,
    type: r.type,
    title: r.title,
    description: r.description,
    requester: {
      name: r.requester.name,
      role: r.requester.role ?? undefined,
      tier: r.requester.tier ?? undefined,
      userId: r.requester.userId,
    },
    receiver: r.receiver,
    status: r.status,
    payment: { amount: r.payment.amount, status: r.payment.status },
    sourcePath: r.sourcePath,
    metadata: (r.metadata as Record<string, unknown>) ?? null,
    assignedTo: r.assignedTo ?? null,
    events: (r.auditTrail ?? []).map((t, i) => ({
      id: `${r.id}-evt-${i}`,
      event: t.event,
      actor_user_id: null,
      actor_name: t.by,
      created_at: t.at,
      metadata: null,
    })),
    attachments: [],
  };
}

export async function getConsultations(opts?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<Consultation[]> {
  if (!isSupabaseMode) return []; // No demo data for consultations
  try {
    const response = await apiGet<{ data: Consultation[] }>("/api/v1/consultations", {
      status: opts?.status,
      limit: opts?.limit,
      offset: opts?.offset,
    });
    return response.data;
  } catch {
    return [];
  }
}

/**
 * `request_id` is REQUIRED and has been since this function was written — the
 * column is `not null unique references service_requests(id)`
 * (20260518_client_workflow_backend_ready.sql:54). It was missing from this
 * signature and from the POST handler, so every call raised 23502 and came back
 * as a 500. `public.consultations` holds zero rows in production, and this is
 * why. Both halves were fixed on 2026-08-27; the parameter is required here so
 * the next caller cannot reintroduce the omission.
 *
 * A consultation is a FACET of an order, not a thing on its own: create the
 * service_request first (createWorkflowRequest), then pass its id here.
 */
export async function createConsultation(data: {
  request_id: string;
  lawyer_id?: string;
  type: string;
  topic: string;
  description: string;
  preferred_date?: string;
}): Promise<Consultation> {
  if (!isSupabaseMode) {
    return {
      id: `cons-${Date.now()}`,
      client_id: "",
      type: data.type,
      topic: data.topic,
      description: data.description,
      status: "requested",
      created_at: new Date().toISOString(),
    };
  }
  // C12 — route returns { data: Consultation }; unwrap. B3 — send the alias
  // fields the route now accepts (lawyer_user_id / mode / specialty).
  const r = await apiMutate<{ data: Consultation }>(
    "/api/v1/consultations",
    "POST",
    {
      request_id: data.request_id,
      lawyer_user_id: data.lawyer_id,
      mode: data.type,
      specialty: data.topic,
      description: data.description,
      preferred_date: data.preferred_date,
    },
  );
  return r.data;
}

export async function updateConsultation(
  id: string,
  patch: { status?: string; scheduled_at?: string; notes?: string },
): Promise<Consultation | null> {
  if (!isSupabaseMode) return null;
  try {
    // C12 — route returns { data: Consultation }; unwrap.
    const r = await apiMutate<{ data: Consultation }>(
      `/api/v1/consultations/${id}`,
      "PATCH",
      patch,
    );
    return r.data ?? null;
  } catch {
    return null;
  }
}
