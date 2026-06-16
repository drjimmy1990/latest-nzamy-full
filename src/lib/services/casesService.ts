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
  } catch {
    return SHARED_CASES;
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
  } catch {
    return SHARED_CASES.find(c => c.id === id) || null;
  }
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

export async function createConsultation(data: {
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
  return apiMutate<Consultation>("/api/v1/consultations", "POST", data);
}

export async function updateConsultation(
  id: string,
  patch: { status?: string; scheduled_at?: string; notes?: string },
): Promise<Consultation | null> {
  if (!isSupabaseMode) return null;
  try {
    return await apiMutate<Consultation>(`/api/v1/consultations/${id}`, "PATCH", patch);
  } catch {
    return null;
  }
}
