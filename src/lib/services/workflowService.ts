/**
 * workflowService.ts
 * ─────────────────────────────────────────────────────────
 * Dual-mode workflow service.
 * In demo mode, delegates to workflowStore/clientWorkflowRepository.
 * In supabase mode, uses API routes.
 *
 * ── THE LOCAL FALLBACK IS DEMO-MODE ONLY, AND THAT IS THE WHOLE POINT ────────
 *
 * Every function here used to answer a FAILED API call by falling back to
 * `localStorage` — in both modes. In demo mode that is correct: the local store
 * IS the backend there, and `readLocal()` genuinely reads back what
 * `saveLocal()` wrote. In supabase mode it was a lie with a specific, repeated
 * consequence:
 *
 *   `createWorkflowRequest` could never reject. A 401, a 500, an RLS refusal —
 *   all of them resolved with a fully-formed row. So every caller's `catch`
 *   and every `if (!row)` guard was unreachable code, and the user was shown a
 *   success screen, and a reference number, for a row that existed only in
 *   their own browser and would never appear in any list again.
 *
 * Four independent groups auditing four different parts of this app arrived at
 * this same file and each routed around it locally — AddHearingModal calls the
 * API directly, and so do the lawyer's contracts, consultations, cases and
 * hearings pages, and the consultation wizard. That is five workarounds for one
 * defect, which is the signal that the defect belongs here.
 *
 * The worst instance was a court hearing: the modal reported
 * «تم إضافة الموعد بنجاح!» over a hearing that never reached the database. A
 * missed hearing is the most damaging thing this platform can produce.
 *
 * So in supabase mode these functions now THROW. Every current call site is
 * already inside a try/catch that surfaces an Arabic error — they were written
 * defensively against a rejection that could not happen. Now it can.
 *
 * The READ helpers throw for a related reason rather than an identical one: a
 * fallback to `readLocal()` does not fail loudly, it returns STALE BROWSER ROWS
 * as though the server had sent them — including rows written by the same
 * browser under a different account. Every read call site in the app already
 * bypasses these two in supabase mode for its own reasons (a `limit`, the
 * `degraded` marker), so the supabase branch here has no live caller today;
 * it throws so it cannot quietly acquire one.
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
  // No catch: see the header. A failed read must not come back as stale local
  // rows wearing the server's clothes.
  const response = await apiGet<{ data: WorkflowRequest[] }>("/api/v1/service-requests");
  return response.data;
}

export async function getWorkflowRequestsByReceiver(
  receiver: WorkflowRequest["receiver"],
): Promise<WorkflowRequest[]> {
  if (!isSupabaseMode) return readByReceiverLocal(receiver);
  // Note for a future caller: this sends no `limit`, so the route's default of
  // 20 applies. Every page that needs the whole list calls the endpoint
  // directly for that reason. Do not add a fallback here to paper over it.
  const response = await apiGet<{ data: WorkflowRequest[] }>("/api/v1/service-requests", { receiver });
  return response.data;
}

export async function createWorkflowRequest(
  input: Omit<WorkflowRequest, "createdAt" | "auditTrail"> & { auditEvent?: string },
): Promise<WorkflowRequest> {
  if (!isSupabaseMode) return saveLocal(input);
  // THROWS on failure — deliberately, and this is the reason this file has a
  // header. The caller must decide what to tell the user; it must not be told
  // by this function that a request succeeded when nothing was written.
  const r = await apiMutate<{ data: WorkflowRequest }>("/api/v1/service-requests", "POST", input);
  return r.data;
}

export async function updateWorkflowRequestById(
  id: string,
  patch: Partial<Omit<WorkflowRequest, "id" | "createdAt" | "auditTrail">>,
  auditEvent = "updated",
  by = "demo-user",
): Promise<WorkflowRequest | null> {
  if (!isSupabaseMode) return updateLocal(id, patch, auditEvent, by);
  try {
    const r = await apiMutate<{ data: WorkflowRequest }>(`/api/v1/service-requests/${id}`, "PATCH", {
      ...patch,
      auditEvent,
    });
    return r.data ?? null;
  } catch (err) {
    // Rethrown, not absorbed. A cancellation or a status change that failed on
    // the server used to come back as a locally-patched row, so the screen
    // moved the order to «ملغي» while it stayed live for the office.
    console.error("[workflowService] updateWorkflowRequestById failed:", err);
    throw err;
  }
}
