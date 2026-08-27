"use client";

import { listOk, listFailed, type ListRead } from "@/lib/services/listRead";
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

/**
 * How many rows the client request lists ask the server for.
 *
 * GET /api/v1/service-requests defaults to `limit=20` and slices with
 * `.range(offset, offset + limit - 1)`. Nothing here used to send a limit, so
 * every client list was silently capped at the 20 newest rows. That was
 * survivable while AI service orders were filtered out of these pages
 * entirely; now that they are included they compete for the same slots, and a
 * client with more than 20 requests would silently lose the oldest ones from
 * «طلباتي».
 *
 * 100 is a deliberate, *stated* cap rather than a silent one: the server also
 * returns `total`, and `listClientWorkflowRequestsPage` hands that back so the
 * page can say on screen that older requests were not loaded. There is no
 * pagination UI in this codebase to build on, so raising the ceiling and
 * declaring it is the honest fix; a client past 100 requests needs real
 * paging, which is a separate piece of work.
 */
export const CLIENT_REQUESTS_FETCH_LIMIT = 100;

/**
 * A non-ok HTTP response from the workflow API.
 *
 * The message is internal and must never be shown to a user — it is English,
 * and the route's own `error` strings are a mix of Arabic ("غير مسموح بتنفيذ
 * هذا الإجراء") and English ("Unauthorized", "Service request not found", raw
 * Postgres messages). `status` is carried so callers can map the code to
 * their own Arabic copy instead of echoing whatever the server said.
 */
export class WorkflowApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Workflow API failed: ${status}`);
    this.name = "WorkflowApiError";
    this.status = status;
  }
}

/**
 * Whose request is this?
 *
 * Two shapes reach this module and only one of them is authoritative:
 *
 *  - `requester_user_id` — the server-set column, written from the session by
 *    POST /api/v1/service-requests and spread verbatim onto every row the GET
 *    route returns. Trust this.
 *  - `requester.userId` — a client-supplied jsonb blob. The dashboard wizards
 *    fill it in; `createServiceOrder` (src/lib/services/serviceOrders.ts) does
 *    NOT — it sends `{ name, phone, email }` and nothing else. Matching on it
 *    alone therefore dropped every AI service order from the client's lists,
 *    which is exactly the defect that kept «طلباتي» from being the single
 *    centre the owner asked for.
 *
 * The jsonb stays as a fallback only for the localStorage/demo path, whose
 * rows never carry the column.
 */
function requesterUserIdOf(request: WorkflowRequest): string | undefined {
  const column = request.requester_user_id;
  if (typeof column === "string" && column.length > 0) return column;
  const fromJson = request.requester?.userId;
  return typeof fromJson === "string" && fromJson.length > 0 ? fromJson : undefined;
}

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
    throw new WorkflowApiError(response.status);
  }

  return response.json() as Promise<T>;
}

/**
 * What a list fetch actually knows, as opposed to what it returns.
 *
 * `listWorkflowRequests` used to throw all of this away and hand back a bare
 * array, which is why a failed load and a genuinely empty list were
 * indistinguishable on every page that called it. It now maps this onto a
 * `ListRead`; this type stays as the internal shape because
 * `listClientWorkflowRequestsPage` needs `total` separately from the rows.
 */
type WorkflowFetchResult = {
  /** Rows as the server returned them — before any client-side requester filtering. */
  requests: WorkflowRequest[];
  /**
   * The server's exact count of rows matching the query *before* the limit
   * slice, or `null` when there is no such number (the localStorage path, or
   * a response that did not carry one).
   */
  total: number | null;
  /**
   * True when this read got no answer: either the route replied
   * `200 { degraded: true }` (its Supabase-error shape) or the fetch itself
   * failed. `requests` is then EMPTY — it used to be a localStorage fallback,
   * i.e. stale browser rows standing in for the server's, which is the thing
   * this flag exists to prevent anyone rendering as data.
   */
  degraded: boolean;
};

async function fetchWorkflowRequests(
  options: WorkflowListOptions & { limit?: number } = {},
): Promise<WorkflowFetchResult> {
  // Demo mode only. localStorage IS the backend there, so this is a real read
  // and `degraded: false` is the truth. It used to be computed unconditionally
  // and then re-used as the failure fallback below — see the catch.
  if (!BACKEND_ENABLED) {
    const localRequests = readWorkflowRequestsLocal()
      .filter((request) => !options.receiver || request.receiver === options.receiver)
      .filter((request) => !options.requesterUserId || requesterUserIdOf(request) === options.requesterUserId);
    return { requests: localRequests, total: null, degraded: false };
  }
  try {
    // Repointed to the authed, RLS-scoped /api/v1/service-requests endpoint. The
    // old /api/client-workflow path used the service-role key with a
    // client-supplied requesterUserId (horizontal IDOR) and has been deleted.
    // v1 derives the requester from the session, so only `receiver` is forwarded
    // and results are already scoped to the caller by RLS. Rows are wrapped in
    // { data: [...] }.
    //
    // `requester_user_id` is deliberately still NOT forwarded, even though the
    // route accepts it and RLS would make it safe: re-adding a client-supplied
    // owner parameter here would undo the very change documented above. The
    // requester filter stays on this side, in listClientWorkflowRequestsPage.
    const params = new URLSearchParams();
    if (options.receiver) params.set("receiver", options.receiver);
    if (options.limit) params.set("limit", String(options.limit));
    const query = params.toString();
    const res = await apiRequest<{ data: WorkflowRequest[]; total?: number; degraded?: boolean }>(
      `/api/v1/service-requests${query ? `?${query}` : ""}`,
    );
    if (res.degraded) {
      return { requests: res.data ?? [], total: null, degraded: true };
    }
    return {
      requests: res.data ?? [],
      total: typeof res.total === "number" ? res.total : null,
      degraded: false,
    };
  } catch {
    // NO local rows here. In supabase mode this browser's localStorage is not a
    // cache of the server — it holds whatever this machine last wrote, possibly
    // under a different account, and handing those back dressed as the server's
    // answer is the same defect workflowService.ts was fixed for. An empty list
    // carrying `degraded: true` says "we could not read", which the caller can
    // render; stale rows say "here is your data", which it cannot.
    return { requests: [], total: null, degraded: true };
  }
}

/**
 * Every request matching `options`, as a `ListRead`.
 *
 * This used to hand back `result.requests` and throw `degraded` away, so a
 * failed fetch and a client with no requests were the same bare `[]` at every
 * call site. `listClientWorkflowRequestsPage` below is the richer form and is
 * unchanged — it already reports `degraded`, `total` and `limit`, which is more
 * than `ListRead` carries, and the two pages built on it read those fields.
 */
export async function listWorkflowRequests(
  options: WorkflowListOptions = {},
): Promise<ListRead<WorkflowRequest>> {
  const result = await fetchWorkflowRequests({ ...options, limit: CLIENT_REQUESTS_FETCH_LIMIT });
  if (result.degraded) return listFailed<WorkflowRequest>();
  return listOk(result.requests, result.total);
}

/**
 * Only requests belonging to this client, plus the two facts a list page needs
 * to be honest about what it is showing.
 *
 * `listClientWorkflowRequests` is the thin `ListRead` wrapper the other client
 * pages already use; this is the same query with `total`/`fetched`/`limit`
 * kept, so «طلباتي» can state a cap instead of truncating in silence and can
 * say a load failed instead of claiming the client has no requests.
 *
 * Kept in this shape rather than folded into `ListRead`: it carries three facts
 * the union has no room for, and its two callers already read them.
 */
export type ClientWorkflowRequestsPage = {
  requests: WorkflowRequest[];
  /** Rows the server handed back, before the requester filter below. */
  fetched: number;
  /** See WorkflowFetchResult.total. */
  total: number | null;
  /** The limit this call asked for, so the caller can name it on screen. */
  limit: number;
  degraded: boolean;
};

export async function listClientWorkflowRequestsPage(
  options: Pick<WorkflowListOptions, "requesterUserId"> = {},
  limit: number = CLIENT_REQUESTS_FETCH_LIMIT,
): Promise<ClientWorkflowRequestsPage> {
  const result = await fetchWorkflowRequests({ ...options, limit });
  const requests = result.requests.filter((request) => {
    if (options.requesterUserId) return requesterUserIdOf(request) === options.requesterUserId;

    // No id to match on. This happens on the first render of every client page
    // that calls without one, and while useUser() is still resolving the
    // session, so it must not become a way to see somebody else's row.
    //
    // Any row that carries `requester_user_id` belongs to a specific user, and
    // if that user were the caller we would have taken the branch above. RLS
    // does NOT make the remainder the caller's own: the SELECT policy's
    // `OR assigned_to = auth.uid()` clause returns rows the caller was
    // assigned, and an admin who claims an ai_workspace order becomes its
    // `assigned_to` (see src/app/api/v1/service-requests/[id]/route.ts). So
    // reject the whole class first — no server row belongs on a page headed
    // «طلباتي» unless we positively know it is the caller's.
    //
    // (An earlier version of this comment cited
    // supabase/migrations/20260815_marketplace_excludes_ai_workspace.sql as
    // proof that only the caller's own ai_workspace rows could arrive. That
    // was wrong: the migration adds `receiver <> 'ai_workspace'` to the
    // verified-lawyer marketplace-browse clause only, and leaves
    // `assigned_to = auth.uid()` untouched.)
    if (request.requester_user_id) return false;

    // What is left is the localStorage/demo path, whose rows never have the
    // column. The historical test here was `requester.role === "individual"`,
    // and a service order has no `role` at all (createServiceOrder sends only
    // name/phone/email), so it dropped AI orders for the same reason the id
    // branch did — hence the `ai_workspace` acceptance, which is what keeps
    // the locally-written /ai/contract-drafter rows visible in demo mode.
    return request.requester?.role === "individual" || request.receiver === "ai_workspace";
  });
  return {
    requests,
    fetched: result.requests.length,
    total: result.total,
    limit,
    degraded: result.degraded,
  };
}

/**
 * The array-shaped wrapper over `listClientWorkflowRequestsPage`, now a
 * `ListRead`. `total` is deliberately NOT forwarded from the page result: that
 * number counts rows the SERVER matched, before the requester filter above
 * removed the ones that are not this client's, so passing it would make
 * `listOk` compute `truncated: true` — and print «يُعرض أحدث ٣ من ٩» — purely
 * because six of the nine belonged to somebody else. A caller that needs the
 * real cap should use `listClientWorkflowRequestsPage`, which reports `fetched`
 * and `limit` alongside it.
 */
export async function listClientWorkflowRequests(
  options: Pick<WorkflowListOptions, "requesterUserId"> = {},
): Promise<ListRead<WorkflowRequest>> {
  const page = await listClientWorkflowRequestsPage(options);
  if (page.degraded) return listFailed<WorkflowRequest>();
  return listOk(page.requests);
}

export async function listWorkflowRequestsByReceiver(
  receiver: WorkflowRequest["receiver"],
): Promise<ListRead<WorkflowRequest>> {
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
