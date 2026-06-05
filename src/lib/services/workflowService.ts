/**
 * workflowService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode workflow service.
 * In demo mode, delegates to workflowStore/clientWorkflowRepository.
 * In supabase mode, uses API routes.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import {
  readWorkflowRequests as readLocal,
  readWorkflowRequestsByReceiver as readByReceiverLocal,
  saveWorkflowRequest as saveLocal,
  updateWorkflowRequest as updateLocal,
} from "@/lib/workflowStore";
import type { WorkflowRequest, WorkflowRequestStatus, WorkflowRequester, WorkflowPayment } from "@/lib/workflowStore";

// Re-export types
export type { WorkflowRequest, WorkflowRequestStatus, WorkflowRequester, WorkflowPayment };

// ─── Service functions ────────────────────────────────────────────────────────

export async function getWorkflowRequests(): Promise<WorkflowRequest[]> {
  if (!isSupabaseMode) return readLocal();
  try {
    const response = await apiGet<{ data: WorkflowRequest[] }>("/api/v1/service-requests");
    return response.data;
  } catch {
    return readLocal();
  }
}

export async function getWorkflowRequestsByReceiver(
  receiver: WorkflowRequest["receiver"],
): Promise<WorkflowRequest[]> {
  if (!isSupabaseMode) return readByReceiverLocal(receiver);
  try {
    const response = await apiGet<{ data: WorkflowRequest[] }>("/api/v1/service-requests", { receiver });
    return response.data;
  } catch {
    return readByReceiverLocal(receiver);
  }
}

export async function createWorkflowRequest(
  input: Omit<WorkflowRequest, "createdAt" | "auditTrail"> & { auditEvent?: string },
): Promise<WorkflowRequest> {
  if (!isSupabaseMode) return saveLocal(input);
  try {
    return await apiMutate<WorkflowRequest>("/api/v1/service-requests", "POST", input);
  } catch {
    return saveLocal(input);
  }
}

export async function updateWorkflowRequestById(
  id: string,
  patch: Partial<Omit<WorkflowRequest, "id" | "createdAt" | "auditTrail">>,
  auditEvent = "updated",
  by = "demo-user",
): Promise<WorkflowRequest | null> {
  if (!isSupabaseMode) return updateLocal(id, patch, auditEvent, by);
  try {
    return await apiMutate<WorkflowRequest>(`/api/v1/service-requests/${id}`, "PATCH", {
      ...patch,
      auditEvent,
    });
  } catch {
    return updateLocal(id, patch, auditEvent, by);
  }
}
