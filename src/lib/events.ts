import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * F7 — n8n readiness: shared server-side event recorder.
 *
 * Inserts a row into `request_events` using a consistent, namespaced event
 * vocabulary (e.g. `service_request.created`, `service_request.status_changed`).
 *
 * Schema (confirmed in `20260518_client_workflow_backend_ready.sql`):
 *   request_events(id, request_id, event, actor_user_id, actor_name, created_at)
 *
 * NOTE: there is NO `metadata` column on `request_events`. The `metadata` param
 * is accepted for forward-compatibility and logged on error, but is NOT
 * persisted until a migration adds the column. Both `actor_user_id` and
 * `actor_name` columns exist, so both are written when provided.
 *
 * An event failure MUST NEVER break the parent write — errors are logged via
 * `console.error` and swallowed. Pass in whichever Supabase client the caller
 * already has (RLS-bound user client or service-role client).
 */
export async function recordEvent(opts: {
  supabase: SupabaseClient;
  requestId: string;
  event: string;
  actorUserId: string;
  actorName?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { supabase, requestId, event, actorUserId, actorName, metadata } = opts;

  const row: Record<string, unknown> = {
    request_id: requestId,
    event,
    actor_user_id: actorUserId,
  };
  if (actorName) {
    row.actor_name = actorName;
  }

  const { error } = await supabase.from("request_events").insert(row);

  if (error) {
    console.error(
      "[recordEvent] failed to insert request_events row:",
      "request_id=", requestId,
      "event=", event,
      "actor_user_id=", actorUserId,
      "actor_name=", actorName ?? "(none)",
      "metadata=", metadata ? JSON.stringify(metadata) : "(none)",
      "error=", error.message,
      error.details,
      error.hint,
      error.code,
    );
  }
}

/**
 * Canonical, namespaced event names. Use these at every insert site so n8n can
 * route on a stable vocabulary later.
 */
export const RequestEvent = {
  SERVICE_REQUEST_CREATED: "service_request.created",
  SERVICE_REQUEST_STATUS_CHANGED: "service_request.status_changed",
  SERVICE_REQUEST_UPDATED: "service_request.updated",
  SERVICE_REQUEST_CANCELLED: "service_request.cancelled",
  SERVICE_REQUEST_COMPLETED: "service_request.completed",
  CONSULTATION_CREATED: "consultation.created",
  CONSULTATION_STATUS_CHANGED: "consultation.status_changed",
  TASK_CREATED: "task.created",
  TASK_STATUS_CHANGED: "task.status_changed",
  TASK_DELETED: "task.deleted",
  CONTRACT_CREATED: "contract.created",
  CONTRACT_STATUS_CHANGED: "contract.status_changed",
  HEARING_CREATED: "hearing.created",
  PAYMENT_CREATED: "payment.created",
} as const;

export type RequestEventName = typeof RequestEvent[keyof typeof RequestEvent];

/**
 * Map a legacy free-text audit event string to the canonical namespaced
 * vocabulary. Already-namespaced values pass through unchanged. Unknown
 * strings also pass through (callers should log a warning) so audit data is
 * never silently dropped.
 *
 * Shared by `src/app/api/client-workflow/_supabase.ts` and
 * `src/app/api/v1/service-requests/[id]/events/route.ts` to keep n8n routing
 * consistent across every insert site.
 */
export function namespaceEvent(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  switch (raw) {
    case "created":
      return RequestEvent.SERVICE_REQUEST_CREATED;
    case "status_change":
    case "status_changed":
      return RequestEvent.SERVICE_REQUEST_STATUS_CHANGED;
    case "updated":
      return RequestEvent.SERVICE_REQUEST_UPDATED;
    case "cancelled":
      return RequestEvent.SERVICE_REQUEST_CANCELLED;
    case "completed":
      return RequestEvent.SERVICE_REQUEST_COMPLETED;
    // Legacy client-side free-text events that bypassed the namespaced
    // vocabulary — mapped to the canonical "service request created" event so
    // n8n routes them correctly. See client/consultation/new/page.tsx,
    // client/requests/new/page.tsx, client/find-lawyer/page.tsx.
    case "client_consultation_created":
    case "client_request_created":
    case "find_lawyer_consultation_requested":
      return RequestEvent.SERVICE_REQUEST_CREATED;
    default:
      return raw;
  }
}