/**
 * F7 — n8n readiness: webhook payload assembler.
 *
 * Builds a stable, serializable JSON payload that n8n can route on once wired.
 * This module is pure — it does NOT call `new Date()`, fetch, or perform I/O.
 * The caller passes in the timestamp (ISO string) so this can be unit-tested
 * and reused from workflow scripts where `Date` may be unavailable.
 *
 * `recipient` is derived from the request's `receiver` (the role the request is
 * routed to) plus `assigned_to` / `requester_user_id` when present. On
 * `service_request.completed` / `.cancelled` it always addresses the
 * requester (never the assignee) and, given `requesterProfile`, carries
 * their name/phone/email for outbound channels like WhatsApp.
 *
 * `data.metadata` always has `internalNotes` stripped, unconditionally — see
 * stripInternalNotes(). n8n is a third-party automation platform outside the
 * application's own trust boundary; a private team note must never leave via
 * this payload regardless of which caller (or which action) produced the
 * event. Scrubbing here, once, is what makes that structural rather than a
 * property every call site has to remember to preserve.
 *
 * On top of that, for `receiver === "ai_workspace"` ONLY (the AI service
 * orders: draft / contracts / wargaming / legal_opinion) `data` is reduced to
 * a fixed ALLOW-LIST — see redactForAiWorkspace() below. Those orders carry
 * the client's case in `description` (the first 200 characters of the case
 * text) and in `metadata.intake` (the full narrative: party names, national
 * IDs, judgment text, uploaded-file names), and n8n keeps every execution's
 * input in its own logs. The redaction is deliberately NOT applied to the
 * other receivers: `buildWebhookPayload` also serves the lawyer-marketplace
 * events, whose workflows read fields a blanket redaction would delete.
 */

import { stripInternalNotes } from "../services/internalNotes.ts";

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
    name?: string;
    phone?: string;
    email?: string;
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
  /** Requester's profile row — supplies name/phone/email for outbound channels. */
  requesterProfile?: Record<string, unknown> | null;
  /**
   * Absolute link to the order page, e.g.
   * `https://nezamy.sa/ai/orders/<id>`. Emitted as `data.orderUrl` when
   * supplied and omitted otherwise.
   *
   * It is threaded in from the caller rather than derived here on purpose:
   * the base URL lives in `NEXT_PUBLIC_APP_URL`, and reading `process.env`
   * inside this function would break the purity promise the module doc above
   * makes — the same promise that lets these payloads be unit-tested and
   * reproduced byte-for-byte from a workflow script. A caller that has the
   * environment (a route handler) composes the URL; this function only
   * carries it.
   */
  orderUrl?: string;
}

/**
 * The ONLY `data` keys an `ai_workspace` payload may carry, and — for the two
 * nested objects — the only keys inside those.
 *
 * These are allow-lists, never deny-lists: a deny-list means the next field
 * somebody adds to the intake wizard, or to the `requester` blob, reaches n8n
 * by default. Adding a key here has to be a deliberate act.
 *
 * `title` is NOT on the list even though it reads like a generic service
 * descriptor. In four flows it is built from client-typed free text — the
 * name of the company under due diligence and the witness's role
 * (`src/app/ai/legal-opinion/page.tsx:266-267`), a custom letter type
 * (`src/app/ai/legal-opinion/_components/LetterWorkflow.tsx:86`), and a
 * custom legal branch (`src/components/draft/steps/StepIdentify.tsx:257` →
 * `src/hooks/useDraftState.ts:158`). `metadata.serviceTitleAr` is what an
 * outbound message should say instead: the intake wizard writes it from the
 * fixed per-service constant `SERVICE_TITLE_AR`
 * (`src/lib/services/orderIntake.ts:20`, via `createServiceOrder`,
 * `src/lib/services/serviceOrders.ts:63`), so in the flows that write it at
 * all it is that constant and never a text box.
 *
 * That is the wizard's convention, though, and NOT a guarantee this module
 * can make. `service_requests.metadata` is unvalidated on the wire (see
 * pickPrimitives below), so a crafted POST can put an arbitrary plain STRING
 * in `service` or `serviceTitleAr` and it will pass. State the guarantee at
 * the width it actually holds: no key outside the three named here survives,
 * and no nested object or array survives inside them — so `title`,
 * `description` and the entire `intake` blob are gone whatever the caller
 * sends. "These two cannot contain client text" would be a stronger claim
 * than the code makes, and is not made here.
 */
const AI_WORKSPACE_METADATA_KEYS = ["service", "serviceTitleAr", "schemaVersion"] as const;
const AI_WORKSPACE_REQUESTER_KEYS = ["name", "phone", "email"] as const;

/**
 * Copy `keys` off `raw`, keeping only primitive values.
 *
 * The primitive filter is not paranoia: both `service_requests.requester` and
 * `service_requests.metadata` are JSONB columns written verbatim from the
 * POST body (`src/app/api/v1/service-requests/route.ts:212` and `:214`), so
 * neither is shape-checked on the wire. Without this, `requester: { name: {
 * caseText: "..." } }` would walk straight through a key-only allow-list.
 */
function pickPrimitives(
  raw: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;
  for (const key of keys) {
    const value = src[key];
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Reduce an already-assembled `data` object to the AI-order allow-list.
 *
 * Note what is NOT touched: `recipient`. That is where the requester's name
 * and phone live on the completed/cancelled path (see deriveRecipient), and
 * the owner's ruling is to send the name and the phone. `entity.id` likewise
 * still carries the order id — `data` has never had an `orderId` key and this
 * does not invent one.
 *
 * `assignedTo` is off the list too. It is the fulfilling admin's UUID, and no
 * AI-order workflow can consume it: dispatch.ts only routes `status_changed`
 * on `assigned`, and an ai_workspace order never reaches that status — the
 * admin route moves it `in_review → completed | cancelled`, and the RLS-scoped
 * PATCH route permits the requester exactly one transition, `cancelled`
 * (src/app/api/v1/service-requests/[id]/route.ts:219-259).
 */
function redactForAiWorkspace(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const reduced: Record<string, unknown> = {
    sourcePath: data.sourcePath ?? "",
    receiver: data.receiver ?? null,
    requesterUserId: data.requesterUserId ?? null,
    createdAt: data.createdAt ?? null,
    // The client's contact block — name/phone/email read off their own
    // `profiles` row by createServiceOrder (src/lib/services/serviceOrders.ts:60).
    // On order CREATION this is the only place the phone exists: that dispatch
    // (src/app/api/v1/service-requests/route.ts:342) passes no requesterProfile,
    // so `recipient` resolves to `{ role: "ai_workspace" }` with no contact at all.
    requester: pickPrimitives(data.requester, AI_WORKSPACE_REQUESTER_KEYS),
    metadata: pickPrimitives(data.metadata, AI_WORKSPACE_METADATA_KEYS),
  };
  if (typeof data.orderUrl === "string" && data.orderUrl) {
    reduced.orderUrl = data.orderUrl;
  }
  return reduced;
}

/**
 * Derive the recipient for an event.
 *
 * Completion is addressed to the REQUESTER: on an AI service order the
 * assignee is the admin who did the work, so returning the assignee here
 * would message the wrong person.
 */
function deriveRecipient(
  request: Record<string, unknown>,
  event: string,
  requesterProfile?: Record<string, unknown> | null,
): WebhookPayload["recipient"] {
  const assignedTo = typeof request.assigned_to === "string" ? request.assigned_to : undefined;
  const receiver = typeof request.receiver === "string" ? request.receiver : undefined;
  const requesterUserId =
    typeof request.requester_user_id === "string" ? request.requester_user_id : undefined;

  const contact = (id?: string): WebhookPayload["recipient"] => {
    const base: WebhookPayload["recipient"] = {};
    if (id) base.id = id;
    if (receiver) base.role = receiver;
    if (requesterProfile && id && requesterProfile.id === id) {
      const name = typeof requesterProfile.display_name === "string" ? requesterProfile.display_name : undefined;
      const phone = typeof requesterProfile.phone === "string" ? requesterProfile.phone : undefined;
      const email = typeof requesterProfile.email === "string" ? requesterProfile.email : undefined;
      const role = typeof requesterProfile.user_type === "string" ? requesterProfile.user_type : undefined;
      if (name) base.name = name;
      if (phone) base.phone = phone;
      if (email) base.email = email;
      if (role) base.role = role;
    }
    return base;
  };

  const addressesRequester =
    event === "service_request.completed" ||
    event === "service_request.cancelled";

  if (addressesRequester && requesterUserId) return contact(requesterUserId);
  if (assignedTo) return contact(assignedTo);
  if (receiver) return { role: receiver };
  if (requesterUserId) return contact(requesterUserId);
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

  const data: Record<string, unknown> = {
    title: request.title ?? "",
    description: request.description ?? "",
    sourcePath: request.source_path ?? "",
    // n8n is outside the application's trust boundary — always strip
    // internalNotes here, regardless of who triggered this event. See the
    // module doc comment above. This stays where it is: the ai_workspace
    // allow-list below would also drop internalNotes, but every OTHER
    // receiver still depends on this one call.
    metadata: stripInternalNotes((request.metadata as Record<string, unknown> | null | undefined) ?? {}, false),
    receiver: request.receiver ?? null,
    assignedTo: request.assigned_to ?? null,
    requester: request.requester ?? null,
    // requesterUserId always identifies the client, regardless of who
    // `recipient` above resolves to (the assignee on non-completion
    // events, the requester on completed/cancelled events).
    requesterUserId: request.requester_user_id ?? null,
    createdAt: request.created_at ?? null,
    ...(opts.orderUrl ? { orderUrl: opts.orderUrl } : {}),
  };

  const receiver =
    typeof request.receiver === "string" ? request.receiver : undefined;

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
    recipient: deriveRecipient(request, opts.event, opts.requesterProfile ?? null),
    payment: coercePayment(request.payment),
    timestamp,
    data: receiver === "ai_workspace" ? redactForAiWorkspace(data) : data,
  };
}