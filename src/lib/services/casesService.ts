/**
 * casesService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode cases & consultations service.
 *
 * ── TWO SHAPES IN ONE FILE, DELIBERATELY ────────────────────────────────────
 *
 * LIST readers (`getCases`, `getActiveCases`, `getConsultations`) return
 * `ListRead<T>`: they all used to end in `catch { return [] }`, which told a
 * client «لا توجد قضايا» over a failed query.
 *
 * SINGLE-item readers (`getCaseDetail`, `getServiceRequestDetail`) keep
 * returning `T | null`, but `null` now means ONE thing — the server said 404,
 * the row is genuinely not there — and every other failure throws. That was the
 * ambiguity: `catch { return null }` made "this case does not exist" and "we
 * could not reach the server" the same answer, and the detail pages render the
 * first one as «القضية غير موجودة».
 *
 * Distinguishing the two requires the HTTP status, which `apiGet` discards when
 * it throws, so both fetch directly. This is the same trade already made and
 * documented in src/lib/services/serviceOrders.ts:106 — the cost is two
 * hand-rolled fetches that do not share the helper's header/params handling.
 * (No `ServiceOrderNotFoundError` here: these callers already branch on `null`,
 * so a sentinel class would be churn without a reader.)
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, type ListRead } from "@/lib/services/listRead";
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
}): Promise<ListRead<SharedCase>> {
  // Demo path unchanged — SHARED_CASES is the backend in that mode.
  if (!isSupabaseMode) {
    let cases = [...SHARED_CASES];
    if (opts?.status) cases = cases.filter(c => c.status === opts.status);
    if (opts?.type) cases = cases.filter(c => c.type === opts.type);
    return listOk(cases, cases.length);
  }
  try {
    const response = await apiGet<{ data: SharedCase[]; total?: number }>("/api/v1/cases", {
      status: opts?.status,
      type: opts?.type,
      limit: opts?.limit,
      offset: opts?.offset,
    });
    // /api/v1/cases 500s on a Supabase error (route.ts:44) rather than serving
    // an empty 200, so it carries no `degraded` flag for `listFromApi` to read
    // — a throw is the failure, and a 200 without `data` is a broken contract.
    if (!Array.isArray(response?.data)) return listFailed<SharedCase>();
    // `total` is the server's own `count`, which is what makes the caller's
    // truncation notice honest when `limit` cut the result.
    return listOk(response.data, response.total);
  } catch (error) {
    console.error('[Nzamy] getCases API failed:', error);
    return listFailed<SharedCase>();
  }
}

export async function getActiveCases(): Promise<ListRead<SharedCase>> {
  if (!isSupabaseMode) return listOk(getActiveCasesLocal());
  return getCases({ status: "active" });
}

export async function getCaseDetail(id: string): Promise<SharedCase | null> {
  if (!isSupabaseMode) return SHARED_CASES.find(c => c.id === id) || null;
  // Direct fetch, not apiGet: see the file header. 404 → null (absent);
  // anything else → throw (unreadable).
  const res = await fetch(`/api/v1/cases/${encodeURIComponent(id)}`, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("تعذّر تحميل القضية");
  const body = await res.json().catch(() => null);
  // A 200 with no `data` is a contract violation, not an absence — a
  // single-resource GET has no "empty" state to report.
  if (!body?.data) throw new Error("تعذّر تحميل القضية");
  return body.data as SharedCase;
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
  // Direct fetch, not apiGet: see the file header. This is the function behind
  // both case-detail screens (client and lawyer), and its `catch { return null }`
  // meant a dropped connection rendered as «القضية غير موجودة» — telling a
  // lawyer their case does not exist. 404 → null; everything else → throw.
  const res = await fetch(`/api/v1/service-requests/${encodeURIComponent(id)}`, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("تعذّر تحميل الطلب");
  const body = await res.json().catch(() => null);
  if (!body?.data) throw new Error("تعذّر تحميل الطلب");
  return body.data as ServiceRequestDetail;
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
}): Promise<ListRead<Consultation>> {
  // No demo store for consultations — a hardcoded absence, not a read.
  if (!isSupabaseMode) return listOk([]);
  try {
    const response = await apiGet<{ data: Consultation[]; total?: number }>("/api/v1/consultations", {
      status: opts?.status,
      limit: opts?.limit,
      offset: opts?.offset,
    });
    if (!Array.isArray(response?.data)) return listFailed<Consultation>();
    return listOk(response.data, response.total);
  } catch (error) {
    console.error("[casesService] getConsultations failed:", error);
    return listFailed<Consultation>();
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

/**
 * THROWS on failure, like `createConsultation` above and unlike the old
 * `catch { return null }`. A write that silently reports "nothing came back"
 * is how a rescheduled hearing date ends up shown as saved when the PATCH was
 * refused — the caller has to be able to tell the user it did not take.
 *
 * Demo mode has no consultations store to patch, so it says so rather than
 * resolving with `null`, which reads as a completed no-op.
 *
 * (No call site today outside the barrel export; written this way so the first
 * one inherits the honest behaviour.)
 */
export async function updateConsultation(
  id: string,
  patch: { status?: string; scheduled_at?: string; notes?: string },
): Promise<Consultation> {
  if (!isSupabaseMode) {
    throw new Error("تعديل الاستشارات غير متاح في وضع العرض التجريبي");
  }
  // C12 — route returns { data: Consultation }; unwrap.
  const r = await apiMutate<{ data: Consultation }>(
    `/api/v1/consultations/${id}`,
    "PATCH",
    patch,
  );
  if (!r?.data) throw new Error("لم يصل تأكيد الحفظ من الخادم");
  return r.data;
}
