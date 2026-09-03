import { orderReference } from "./services/orderReference.ts";
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
 * `actor_user_id` is nullable (`references auth.users(id) on delete set
 * null`, no `not null`) because not every event has a human actor behind a
 * session — e.g. the n8n delivery-status callback
 * (`src/app/api/v1/n8n/callback/route.ts`) authenticates via a shared
 * webhook secret, not a user session, so there is no `auth.users` row to
 * attribute the event to. `actorUserId` is optional here to match: when
 * omitted, the column is left NULL rather than being fed a fabricated id
 * (which would FK-violate and — since insert errors are swallowed — silently
 * drop the event entirely). `actor_name` still identifies the actor in that
 * case (defaults to the DB's `'system'` when the caller doesn't override it).
 *
 * An event failure MUST NEVER break the parent write — errors are logged via
 * `console.error` and swallowed. Pass in whichever Supabase client the caller
 * already has (RLS-bound user client or service-role client).
 */
export async function recordEvent(opts: {
  supabase: SupabaseClient;
  requestId: string;
  event: string;
  actorUserId?: string;
  actorName?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { supabase, requestId, event, actorUserId, actorName, metadata } = opts;

  const row: Record<string, unknown> = {
    request_id: requestId,
    event,
  };
  if (actorUserId) {
    row.actor_user_id = actorUserId;
  }
  if (actorName) {
    row.actor_name = actorName;
  }

  const { error } = await supabase.from("request_events").insert(row);

  if (error) {
    console.error(
      "[recordEvent] failed to insert request_events row:",
      "request_id=", requestId,
      "event=", event,
      "actor_user_id=", actorUserId ?? "(none)",
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
 * F7's sibling for Phase 1 tables: `public.activity_events`
 * (migration 20260903_phase1_case_tables.sql).
 *
 * `recordEvent`/`request_events` needs a `request_id` FK into
 * `service_requests` — every row is an intake/order event on a request that
 * exists. Hearings and tasks stopped being service_requests rows in this same
 * wave, and a standalone hearing or task (no case attached) has no request to
 * hang an event off at all. `activity_events` has no such requirement:
 * `case_request_id` is nullable, and `owner_user_id` alone is enough to scope
 * a feed.
 *
 * Same failure contract as `recordEvent`: never throws, logs and swallows, so
 * a failed activity write can never break the create/update it is describing.
 */
export async function recordActivity(opts: {
  supabase: SupabaseClient;
  kind: string;
  ownerUserId?: string;
  firmId?: string | null;
  actorUserId?: string;
  actorName?: string;
  caseRequestId?: string | null;
  subjectTable?: string;
  subjectId?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const { supabase, kind, ownerUserId, firmId, actorUserId, actorName, caseRequestId, subjectTable, subjectId, payload } = opts;

  const row: Record<string, unknown> = { kind };
  if (ownerUserId) row.owner_user_id = ownerUserId;
  if (firmId) row.firm_id = firmId;
  if (actorUserId) row.actor_user_id = actorUserId;
  if (actorName) row.actor_name = actorName;
  if (caseRequestId) row.case_request_id = caseRequestId;
  if (subjectTable) row.subject_table = subjectTable;
  if (subjectId) row.subject_id = subjectId;
  if (payload) row.payload = payload;

  const { error } = await supabase.from("activity_events").insert(row);

  if (error) {
    console.error(
      "[recordActivity] failed to insert activity_events row:",
      "kind=", kind,
      "owner_user_id=", ownerUserId ?? "(none)",
      "case_request_id=", caseRequestId ?? "(none)",
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
  // The client asked for a revision inside the 48-hour window. Sends the order
  // back to `in_review` — no new status value, so no CHECK migration; the
  // revision itself lives at metadata.revisions. Written by
  // src/app/api/v1/service-requests/[id]/route.ts, which carried this literal
  // locally until this constant existed; the string is unchanged, so nothing
  // already recorded needs migrating.
  SERVICE_REQUEST_REVISION_REQUESTED: "service_request.revision_requested",
  // An order picked up by whoever will fulfil it. Not a new vocabulary word:
  // `service_request.assigned` was already the name both case timelines label
  // («تعيين المحامي» — see EVENT_LABELS in dashboard/{client,lawyer}/cases/
  // [id]/page.tsx); it simply had no constant here, so the admin queue's claim
  // fell back to the generic STATUS_CHANGED and was indistinguishable from a
  // cancellation in `request_events`. Routing is unaffected: resolvePath()
  // in src/lib/n8n/dispatch.ts has no branch for this event, exactly as it
  // had none for `status_changed` at status `in_review`.
  SERVICE_REQUEST_ASSIGNED: "service_request.assigned",
  // A manager ROUTED the order to a named member of the team, which is not the
  // same fact as SERVICE_REQUEST_ASSIGNED («استلمه من سيؤديه»). Both write
  // `assigned_to`, but only the claim means work has begun — the queue's
  // «توجيه» action deliberately leaves `status` where it was. They need
  // separate names or the audit log cannot answer «مين وجّه ومين استلم»,
  // which is the entire reason claim and cancel stopped sharing
  // STATUS_CHANGED. `request_events.event` is plain `text` with no CHECK
  // (see 20260518_client_workflow_backend_ready.sql:21), so this needs no
  // migration. Routing is unaffected: resolvePath() in src/lib/n8n/dispatch.ts
  // keys off STATUS, not event name, and «توجيه» changes no status.
  SERVICE_REQUEST_REASSIGNED: "service_request.reassigned",
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
 * Badge vocabulary for one activity row. It lives beside the event names so
 * every feed badges the same event the same way instead of each page
 * re-deciding — the lawyer activity log used to badge *everything* «مهمة».
 */
export type ActivityBadge =
  | "order"
  | "delivery"
  | "cancelled"
  | "notice"
  | "task"
  | "contract"
  | "hearing"
  | "client";

export interface DescribedEvent {
  title: string;
  description?: string;
  badge: ActivityBadge;
}

/**
 * Render one `request_events` row as Arabic a user can actually read.
 *
 * `request_events.event` holds raw namespaced tokens (`service_request.created`,
 * `notification.email_sent`, …) — those must never reach the UI. Some tokens
 * are deliberately coarse: a producer that has no more specific token falls back
 * to `service_request.status_changed`, and then the request's *current* status
 * is the only thing that separates one transition from another — so pass the
 * status in alongside the event. (The admin console used to be such a producer
 * for both "claim" and "cancel"; it now emits SERVICE_REQUEST_ASSIGNED and
 * SERVICE_REQUEST_CANCELLED explicitly. Older rows written before that change
 * still carry the coarse token, which is why the status fallback stays.)
 *
 * Unknown tokens fall back to a neutral Arabic line rather than echoing the
 * token, so an event name added elsewhere can never leak English into the UI.
 */
export function describeRequestEvent(opts: {
  event: string;
  status?: string | null;
  requestId?: string | null;
  serviceTitleAr?: string | null;
  requestTitle?: string | null;
}): DescribedEvent {
  const { event, status, requestId, serviceTitleAr, requestTitle } = opts;
  // `metadata.serviceTitleAr` is the Arabic service name the client picked
  // (e.g. «محترف العقود»); the request title is the fallback when an older
  // row predates it.
  const service = serviceTitleAr?.trim() || requestTitle?.trim() || "طلب خدمة";
  // Same short reference the admin console and the order page quote — one
  // helper now owns the format (owner item ٤), so a client reading it aloud
  // and an admin searching for it are looking at the same string.
  const ref = requestId ? ` برقم ${orderReference(requestId)}` : "";
  const delivered: DescribedEvent = {
    title: `تم إنجاز معاملتكم: ${service}`,
    description: "المستند جاهز للتحميل من صفحة الطلب.",
    badge: "delivery",
  };
  const cancelled: DescribedEvent = {
    title: `تم إلغاء طلبكم: ${service}`,
    badge: "cancelled",
  };
  const claimed: DescribedEvent = {
    title: `بدأ العمل على طلبكم: ${service}`,
    description: "استلم فريق نظامي الطلب وهو قيد التنفيذ الآن.",
    badge: "task",
  };

  switch (event) {
    case RequestEvent.SERVICE_REQUEST_CREATED:
      return {
        title: `تم قيد طلبكم: ${service}${ref}`,
        description: "تم استلام الطلب وهو بانتظار الاستلام من فريق نظامي.",
        badge: "order",
      };
    case RequestEvent.SERVICE_REQUEST_COMPLETED:
      return delivered;
    case RequestEvent.SERVICE_REQUEST_CANCELLED:
      return cancelled;
    case RequestEvent.SERVICE_REQUEST_UPDATED:
      return { title: `تم تحديث بيانات طلبكم: ${service}`, badge: "order" };
    case RequestEvent.SERVICE_REQUEST_ASSIGNED:
      return claimed;
    case RequestEvent.SERVICE_REQUEST_REASSIGNED:
      // Deliberately NOT `claimed`: routing an order to a colleague is not the
      // same promise as «بدأ العمل على طلبكم», and saying so would be the
      // exact class of claim this codebase has been removing. It also must not
      // fall through to the generic «تحديث على طلبكم», which says nothing.
      return {
        title: `تم توجيه طلبكم إلى المختص: ${service}`,
        description: "أُسند الطلب لعضو من فريق نظامي وسيبدأ العمل عليه.",
        badge: "task",
      };
    case RequestEvent.SERVICE_REQUEST_STATUS_CHANGED:
      // Claims recorded before `service_request.assigned` existed still arrive
      // here as the generic token — the request's status is what identifies them.
      if (status === "in_review" || status === "assigned") return claimed;
      if (status === "completed") return delivered;
      if (status === "cancelled") return cancelled;
      return { title: `تم تحديث حالة طلبكم: ${service}`, badge: "order" };
    case RequestEvent.TASK_CREATED:
      return { title: "تمت إضافة مهمة جديدة", badge: "task" };
    case RequestEvent.TASK_STATUS_CHANGED:
      return { title: "تم تحديث حالة مهمة", badge: "task" };
    case RequestEvent.TASK_DELETED:
      return { title: "تم حذف مهمة", badge: "task" };
    case RequestEvent.CONSULTATION_CREATED:
      return { title: `تم حجز استشارة: ${service}`, badge: "client" };
    case RequestEvent.CONSULTATION_STATUS_CHANGED:
      return { title: `تم تحديث حالة الاستشارة: ${service}`, badge: "client" };
    case RequestEvent.CONTRACT_CREATED:
      return { title: `تمت إضافة عقد: ${service}`, badge: "contract" };
    case RequestEvent.CONTRACT_STATUS_CHANGED:
      return { title: `تم تحديث حالة العقد: ${service}`, badge: "contract" };
    case RequestEvent.HEARING_CREATED:
      return { title: `تمت إضافة جلسة: ${service}`, badge: "hearing" };
    case RequestEvent.PAYMENT_CREATED:
      return { title: `تم تسجيل دفعة على طلبكم: ${service}`, badge: "order" };
    default:
      break;
  }

  // `notification.${channel}_${status}` — written by the n8n delivery callback
  // (`n8n/callback/route.ts`) with no user actor at all, so these rows only
  // became visible once the feeds stopped filtering on `actor_user_id`.
  if (event.startsWith("notification.")) {
    return {
      title: event.endsWith("_failed")
        ? `تعذّر إرسال إشعار بخصوص طلبكم: ${service}`
        : `تم إرسال إشعار بخصوص طلبكم: ${service}`,
      badge: "notice",
    };
  }

  return { title: `تحديث على طلبكم: ${service}`, badge: "order" };
}

/**
 * Render one `activity_events` row as Arabic. Reuses the SAME `RequestEvent`
 * vocabulary and `ActivityBadge` type as `describeRequestEvent` — one set of
 * event names for both tables — but the context is different: there is no
 * `service_requests` join here, so whatever the writer needs to name (a
 * hearing's title, a task's title, the new/old status) travels in `payload`.
 *
 * Unknown kinds fall back to a neutral line, same reasoning as
 * `describeRequestEvent`: an event name added elsewhere must never leak a raw
 * token into the UI.
 */
export function describeActivityEvent(opts: {
  kind: string;
  payload?: Record<string, unknown> | null;
}): DescribedEvent {
  const payload = opts.payload ?? {};
  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : "";

  switch (opts.kind) {
    case RequestEvent.HEARING_CREATED:
      return { title: title ? `تمت إضافة جلسة: ${title}` : "تمت إضافة جلسة", badge: "hearing" };
    case RequestEvent.TASK_CREATED:
      return { title: title ? `تمت إضافة مهمة: ${title}` : "تمت إضافة مهمة", badge: "task" };
    case RequestEvent.TASK_STATUS_CHANGED: {
      const status = typeof payload.status === "string" ? payload.status : "";
      const statusAr =
        status === "done" ? "مكتملة"
        : status === "in_progress" ? "قيد التنفيذ"
        : status === "archived" ? "مؤرشفة"
        : status === "todo" ? "لم تبدأ"
        : "";
      const suffix = statusAr ? ` — ${statusAr}` : "";
      return { title: title ? `تحديث حالة مهمة: ${title}${suffix}` : `تحديث حالة مهمة${suffix}`, badge: "task" };
    }
    default:
      return { title: "نشاط جديد مسجَّل", badge: "notice" };
  }
}

/**
 * Map a legacy free-text audit event string to the canonical namespaced
 * vocabulary. Already-namespaced values pass through unchanged. Unknown
 * strings also pass through (callers should log a warning) so audit data is
 * never silently dropped.
 *
 * Used by `src/app/api/v1/service-requests/[id]/events/route.ts` (and the other
 * service-request insert sites) to keep n8n routing consistent across every
 * insert site.
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