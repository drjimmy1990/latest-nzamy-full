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

function appendWorkflowListParams(path: string, options: WorkflowListOptions = {}) {
  const params = new URLSearchParams();
  if (options.receiver) params.set("receiver", options.receiver);
  if (options.requesterUserId) params.set("requesterUserId", options.requesterUserId);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export async function listWorkflowRequests(options: WorkflowListOptions = {}): Promise<WorkflowRequest[]> {
  const localRequests = readWorkflowRequestsLocal()
    .filter((request) => !options.receiver || request.receiver === options.receiver)
    .filter((request) => !options.requesterUserId || request.requester.userId === options.requesterUserId);

  if (!BACKEND_ENABLED) return localRequests;
  try {
    return await apiRequest<WorkflowRequest[]>(appendWorkflowListParams("/api/client-workflow/requests", options));
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
  if (!BACKEND_ENABLED) return createWorkflowRequestLocal(input);

  try {
    const request = await apiRequest<WorkflowRequest>("/api/client-workflow/requests", {
      method: "POST",
      body: JSON.stringify(input),
    });
    dispatchWorkflowUpdate(request);
    return request;
  } catch {
    return createWorkflowRequestLocal(input);
  }
}

export async function updateWorkflowRequestById(
  id: string,
  patch: WorkflowRequestPatch,
  auditEvent = "updated",
  by = "demo-user",
): Promise<WorkflowRequest | null> {
  if (!BACKEND_ENABLED) return updateWorkflowRequestLocal(id, patch, auditEvent, by);

  try {
    const updated = await apiRequest<WorkflowRequest>(`/api/client-workflow/requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ patch, auditEvent, by }),
    });
    dispatchWorkflowUpdate(updated);
    return updated;
  } catch {
    return updateWorkflowRequestLocal(id, patch, auditEvent, by);
  }
}
