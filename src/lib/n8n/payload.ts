/**
 * F7 — n8n readiness: webhook payload assembler.
 *
 * Builds a stable, serializable JSON payload that n8n can route on once wired.
 * This module is pure — it does NOT call `new Date()`, fetch, or perform I/O.
 * The caller passes in the timestamp (ISO string) so this can be unit-tested
 * and reused from workflow scripts where `Date` may be unavailable.
 *
 * `recipient` is derived from the request's `receiver` (the role the request is
 * routed to) plus `assigned_to` / `requester_user_id` when present.
 */

export interface WebhookPayload {
  event: string;
  entity: {
    id: string;
    type: string;
    status: string;
  };
  actor: {
    id: string;
    name?: string;
    role?: string;
  };
  recipient: {
    id?: string;
    role?: string;
  };
  payment: {
    amount: number;
    status: string;
  };
  timestamp: string;
  data: Record<string, unknown>;
}

export interface BuildWebhookPayloadOpts {
  /** Namespaced event name (e.g. `service_request.status_changed`). */
  event: string;
  /** ISO timestamp string — supplied by the caller. */
  timestamp: string;
  /** Raw service_requests row (snake_case). */
  request: Record<string, unknown>;
  /** Actor profile row from `profiles` (id, display_name, user_type). */
  actor?: Record<string, unknown> | null;
  /** Override the event name; falls back to `request.status`-derived default. */
}

/**
 * Derive a recipient descriptor from a service_requests row.
 * Prefers an explicit assignee; otherwise falls back to the receiver role and
 * the requester (useful for status callbacks to the client).
 */
function deriveRecipient(request: Record<string, unknown>): {
  id?: string;
  role?: string;
} {
  const assignedTo =
    typeof request.assigned_to === "string" ? request.assigned_to : undefined;
  const receiver =
    typeof request.receiver === "string" ? request.receiver : undefined;
  const requesterUserId =
    typeof request.requester_user_id === "string"
      ? request.requester_user_id
      : undefined;

  // If someone is assigned, they are the active recipient (the lawyer/firm
  // handling the request). Otherwise the receiver role describes the queue.
  if (assignedTo) {
    return { id: assignedTo, role: receiver };
  }
  if (receiver) {
    return { role: receiver };
  }
  if (requesterUserId) {
    return { id: requesterUserId };
  }
  return {};
}

function coercePayment(raw: unknown): { amount: number; status: string } {
  if (raw && typeof raw === "object") {
    const p = raw as Record<string, unknown>;
    const amount =
      typeof p.amount === "number"
        ? p.amount
        : typeof p.amount === "string"
          ? Number(p.amount) || 0
          : 0;
    const status =
      typeof p.status === "string" ? p.status : "not_required";
    return { amount, status };
  }
  return { amount: 0, status: "not_required" };
}

/**
 * Assemble a webhook payload from a service_requests row + actor profile.
 * Pure function — no I/O, no clock. Caller supplies the timestamp.
 */
export function buildWebhookPayload(
  opts: BuildWebhookPayloadOpts,
): WebhookPayload {
  const { event, timestamp, request, actor } = opts;

  const entityId =
    typeof request.id === "string" ? request.id : String(request.id ?? "");
  const entityType =
    typeof request.type === "string" ? request.type : "service";
  const entityStatus =
    typeof request.status === "string" ? request.status : "unknown";

  const actorId =
    actor && typeof actor.id === "string"
      ? actor.id
      : typeof request.requester_user_id === "string"
        ? String(request.requester_user_id)
        : "";
  const actorName =
    actor && typeof actor.display_name === "string"
      ? actor.display_name
      : undefined;
  const actorRole =
    actor && typeof actor.user_type === "string" ? actor.user_type : undefined;

  return {
    event,
    entity: {
      id: entityId,
      type: entityType,
      status: entityStatus,
    },
    actor: {
      id: actorId,
      ...(actorName ? { name: actorName } : {}),
      ...(actorRole ? { role: actorRole } : {}),
    },
    recipient: deriveRecipient(request),
    payment: coercePayment(request.payment),
    timestamp,
    data: {
      title: request.title ?? "",
      description: request.description ?? "",
      sourcePath: request.source_path ?? "",
      metadata: request.metadata ?? {},
      receiver: request.receiver ?? null,
      assignedTo: request.assigned_to ?? null,
      requester: request.requester ?? null,
      createdAt: request.created_at ?? null,
    },
  };
}