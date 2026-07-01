"use client";

import type { WorkflowRequest } from "@/lib/workflowStore";

type WorkflowRequestInput = Omit<WorkflowRequest, "createdAt" | "auditTrail"> & {
  auditEvent?: string;
};

type WorkflowRequestPatch = Partial<Omit<WorkflowRequest, "id" | "createdAt" | "auditTrail">>;
type WorkflowListOptions = {
  requesterUserId?: string;
  receiver?: WorkflowRequest["receiver"];
};

const STORAGE_KEY = "nzamy_workflow_requests_v1";
const BACKEND_ENABLED = process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND === "supabase";

function nowIso() {
  return new Date().toISOString();
}

function dispatchWorkflowUpdate(request: WorkflowRequest) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("nzamy-workflow-updated", { detail: request }));
}

export function createWorkflowId(prefix = "NZ"): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}

export function readWorkflowRequestsLocal(): WorkflowRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function createWorkflowRequestLocal(input: WorkflowRequestInput): WorkflowRequest {
  const { auditEvent, ...requestInput } = input;
  const createdAt = nowIso();
  const request: WorkflowRequest = {
    ...requestInput,
    createdAt,
    auditTrail: [
      {
        at: createdAt,
        event: auditEvent ?? "created",
        by: input.requester.name || "demo-user",
      },
    ],
  };

  if (typeof window !== "undefined") {
    const next = [request, ...readWorkflowRequestsLocal()];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    dispatchWorkflowUpdate(request);
  }

  return request;
}

export function updateWorkflowRequestLocal(
  id: string,
  patch: WorkflowRequestPatch,
  auditEvent = "updated",
  by = "demo-user",
): WorkflowRequest | null {
  if (typeof window === "undefined") return null;

  const requests = readWorkflowRequestsLocal();
  let updated: WorkflowRequest | null = null;
  const next = requests.map((request) => {
    if (request.id !== id) return request;
    updated = {
      ...request,
      ...patch,
      auditTrail: [
        {
          at: nowIso(),
          event: auditEvent,
          by,
        },
        ...request.auditTrail,
      ],
    };
    return updated;
  });

  if (!updated) return null;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  dispatchWorkflowUpdate(updated);
  return updated;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Workflow API failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function listWorkflowRequests(options: WorkflowListOptions = {}): Promise<WorkflowRequest[]> {
  const localRequests = readWorkflowRequestsLocal()
    .filter((request) => !options.receiver || request.receiver === options.receiver)
    .filter((request) => !options.requesterUserId || request.requester.userId === options.requesterUserId);

  if (!BACKEND_ENABLED) return localRequests;
  try {
    // Repointed to the authed, RLS-scoped /api/v1/service-requests endpoint. The
    // old /api/client-workflow path used the service-role key with a
    // client-supplied requesterUserId (horizontal IDOR) and has been deleted.
    // v1 derives the requester from the session, so only `receiver` is forwarded
    // and results are already scoped to the caller by RLS. Rows are wrapped in
    // { data: [...] }.
    const params = new URLSearchParams();
    if (options.receiver) params.set("receiver", options.receiver);
    const query = params.toString();
    const res = await apiRequest<{ data: WorkflowRequest[] }>(
      `/api/v1/service-requests${query ? `?${query}` : ""}`,
    );
    return res.data ?? [];
  } catch {
    return localRequests;
  }
}

export async function listClientWorkflowRequests(options: Pick<WorkflowListOptions, "requesterUserId"> = {}): Promise<WorkflowRequest[]> {
  const requests = await listWorkflowRequests(options);
  return requests.filter((request) => {
    if (options.requesterUserId) return request.requester.userId === options.requesterUserId;
    return request.requester.role === "individual";
  });
}

export async function listWorkflowRequestsByReceiver(
  receiver: WorkflowRequest["receiver"],
): Promise<WorkflowRequest[]> {
  return listWorkflowRequests({ receiver });
}

export async function createWorkflowRequest(input: WorkflowRequestInput): Promise<WorkflowRequest> {
  // Demo mode: keep the local-only behavior.
  if (!BACKEND_ENABLED) return createWorkflowRequestLocal(input);

  // Supabase mode: POST to the authed /api/v1/service-requests endpoint, which
  // sets requester_user_id = session user.id server-side (client input ignored).
  // Do NOT silently fall back to localStorage on API failure — re-throw so the
  // caller can surface the error (and abort before uploading orphaned
  // attachments). v1 wraps the row in { data }.
  const res = await apiRequest<{ data: WorkflowRequest }>("/api/v1/service-requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
  dispatchWorkflowUpdate(res.data);
  return res.data;
}

export async function updateWorkflowRequestById(
  id: string,
  patch: WorkflowRequestPatch,
  auditEvent = "updated",
  by = "demo-user",
): Promise<WorkflowRequest | null> {
  // Demo mode: keep the local-only behavior.
  if (!BACKEND_ENABLED) return updateWorkflowRequestLocal(id, patch, auditEvent, by);

  // Supabase mode: PATCH the authed /api/v1/service-requests/[id] endpoint.
  // Ownership is enforced by RLS (participants-only UPDATE policy); the handler
  // reads `body.patch ?? body`, so a flat { ...patch, auditEvent } body works and
  // `by` is server-derived from the session. Surface API failures (no local
  // fallback) so callers see write failures.
  const res = await apiRequest<{ data: WorkflowRequest }>(
    `/api/v1/service-requests/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ ...patch, auditEvent }) },
  );
  dispatchWorkflowUpdate(res.data);
  return res.data ?? null;
}
