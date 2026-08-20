import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { recordEvent, RequestEvent } from "@/lib/events";
import { dispatchToN8n } from "@/lib/n8n/dispatch";
import { buildWebhookPayload } from "@/lib/n8n/payload";
import { recordNotification } from "@/lib/notify";
import { stripInternalNotes } from "@/lib/services/internalNotes";
import { canRequesterCancel } from "@/lib/services/orderTransitions";

/**
 * Map a raw service_requests row (snake_case) to the WorkflowRequest shape
 * (camelCase). `events` are attached separately by the GET [id] route and are
 * left untouched here.
 */
function toWorkflowRequest(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    createdAt: row.created_at ?? null,
    sourcePath: row.source_path ?? "",
    assignedTo: row.assigned_to ?? null,
    auditTrail: [],
  };
}

/**
 * GET /api/v1/service-requests/[id] — Get request detail with events
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const { data: serviceRequest, error } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !serviceRequest) {
    return NextResponse.json(
      { error: "Service request not found" },
      { status: 404 },
    );
  }

  // Fetch events for this request
  const { data: events } = await supabase
    .from("request_events")
    .select("*")
    .eq("request_id", id)
    .order("created_at", { ascending: true });

  // F7 — fetch attachments for this request.
  // attachments schema: id, request_id, owner_user_id, file_name, storage_path,
  // mime_type, size_bytes, created_at. Map to the camelCase contract the
  // dashboard detail page expects.
  const { data: attachmentsRows } = await supabase
    .from("attachments")
    .select("*")
    .eq("request_id", id)
    .order("created_at", { ascending: false });

  const attachments = (attachmentsRows ?? []).map((row) => {
    const a = row as Record<string, unknown>;
    return {
      id: a.id,
      name: a.file_name ?? "",
      file_size: a.size_bytes ?? null,
      storage_path: a.storage_path ?? "",
      ...(a.mime_type != null ? { mime_type: a.mime_type } : {}),
      created_at: a.created_at ?? null,
    };
  });

  // Task 3 — metadata.internalNotes is a private note admins write for the
  // team (see the admin PATCH route's deliver/cancel branches) and must
  // never reach a non-admin caller. This route serves it wholesale via
  // `select("*")`, and RLS alone does not answer "who is asking": once an
  // admin claims an ai_workspace order they become `assigned_to`, so an
  // admin viewing their own claimed order is a legitimate case, not just the
  // requester. Resolve admin-ness from profiles.user_type directly (same
  // pattern as this route's own PATCH handler below) and let the shared
  // stripInternalNotes() helper (also used by the list route and by
  // buildWebhookPayload) do the actual scrub — a single implementation
  // instead of a `delete` copied at every boundary this field crosses.
  const rawMetadata = (serviceRequest as Record<string, unknown>).metadata as
    | Record<string, unknown>
    | null;
  let isAdmin = false;
  if (rawMetadata && typeof rawMetadata === "object" && "internalNotes" in rawMetadata) {
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("user_type")
      .eq("id", user.id)
      .maybeSingle();
    isAdmin = (callerProfile?.user_type as string | undefined) === "admin";
  }
  const sanitizedRequest = {
    ...(serviceRequest as Record<string, unknown>),
    metadata: stripInternalNotes(rawMetadata, isAdmin),
  };

  return NextResponse.json({
    data: {
      ...toWorkflowRequest(sanitizedRequest),
      events: events ?? [],
      attachments,
    },
  });
}

/**
 * PATCH /api/v1/service-requests/[id] — Update request status/fields
 * Auto-creates an audit event for the status change.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();

  const rawPatch = body.patch ?? body;
  const keyMap: Record<string, string> = {
    sourcePath: 'source_path',
    assignedTo: 'assigned_to',
    auditEvent: '__skip__',
  };
  // Column allowlist — a participant (requester or assignee) may only move a
  // request's status through this endpoint. `metadata`, `assigned_to`,
  // `payment`, `type`, and `receiver` are deliberately excluded: RLS lets any
  // participant write ANY column on their own row, and this was half of a
  // cross-tenant document leak (a client could point metadata.deliverable at
  // another tenant's attachment). No real caller sends anything beyond
  // `status` today (verified against every call site behind
  // workflowService.ts and clientWorkflowRepository.ts). Keys not on this
  // list are silently dropped (not 400'd), matching the existing
  // `auditEvent` skip below.
  const ALLOWED_PATCH_FIELDS = new Set<string>(['status']);
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawPatch)) {
    if (keyMap[k] === '__skip__') continue;
    const mapped = keyMap[k] ?? k;
    if (!ALLOWED_PATCH_FIELDS.has(mapped)) continue;
    patch[mapped] = v;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "لا توجد حقول صالحة للتحديث" },
      { status: 400 },
    );
  }

  // Task 6d — gate status transitions by role. RLS's UPDATE policy is
  // `requester_user_id = auth.uid() or assigned_to = auth.uid()`, which lets a
  // requester PATCH their own order's status to ANYTHING, including
  // `completed` — sending themselves a false completion notification/n8n
  // dispatch and pulling their own order out of the admin queue. The base
  // rule guards on the *target* status: a requester may only cancel their own
  // order; every other target requires the assignee or an admin. Task 1 then
  // adds a *current*-status guard on top, for `ai_workspace` orders only —
  // see canRequesterCancel below.
  if ("status" in patch) {
    // Gate on presence, not on being a string: a non-string status (e.g.
    // `{status: 0}`) still passes the Task 6b allowlist and must not slip
    // past this check unexamined — it can never equal "cancelled" below, so
    // a bare requester correctly gets refused rather than silently writing
    // an unrecognized status that would vanish from the status-filtered
    // admin queue.
    const targetStatus = patch.status;

    const { data: existing, error: existingError } = await supabase
      .from("service_requests")
      // `status` is here for Task 1's cancellation lock below. Without it
      // `existing.status` is `undefined`, `canRequesterCancel(String(...))`
      // sees `""` and refuses EVERY client cancel — the guard would fail
      // closed so hard it would break the working case.
      .select("requester_user_id, assigned_to, receiver, status")
      .eq("id", id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json(
        { error: "Service request not found" },
        { status: 404 },
      );
    }

    const requesterId = (existing.requester_user_id as string | null) ?? null;
    const assigneeId = (existing.assigned_to as string | null) ?? null;
    const receiver = (existing.receiver as string | null) ?? null;
    const isRequester = requesterId === user.id;
    const isAssignee = assigneeId != null && assigneeId === user.id;

    let permitted: boolean;

    if (receiver === "ai_workspace") {
      // Follow-up to the original Task 6d fix: `assigned_to` is client-
      // supplied at POST with no server-side check (only `requester_user_id`
      // is RLS-constrained on insert), so a requester could self-assign at
      // creation and satisfy `isAssignee` below on their own order — the
      // exact "self-assign then self-complete" bypass a security review
      // caught. Rather than weaken `isAssignee` in a way that also 403s the
      // lawyer dashboard's legitimate self-tracking of its own
      // contracts/cases (same person is intentionally both requester and
      // assignee there — see the `else` branch), the four AI-fulfillment
      // services (`receiver='ai_workspace'`) get their own, stricter rule:
      // through this RLS-scoped handler, the ONLY allowed move is the
      // requester cancelling their own order. Every other transition for
      // these orders belongs to Task 8's admin route, which uses
      // `createServiceClient()` and never reaches this handler — so there is
      // no legitimate `isAssignee`/`isAdmin` case to preserve here.
      //
      // This holds even though `receiver` is itself client-supplied at POST:
      // Task 8's admin queue filters on `receiver='ai_workspace'`, the same
      // field this gate keys on. A requester who lies about `receiver` to
      // dodge this branch has simultaneously pulled their order out of the
      // only queue an admin will ever look at — self-completing an order no
      // admin was ever going to fulfil, with no real deliverable behind it.
      // Dodging the gate means dodging the prize, so `receiver` does not
      // need to be locked down at POST for this to hold.
      //
      // Task 1 (owner decision س٢, 20 August): «قفل إمكانية الإلغاء على
      // مستوى الـ Backend Server فور تحول الطلب إلى completed، ولا يُعتمد
      // على إخفاء الزر فقط.» Until now this branch checked only the CALLER
      // and the TARGET status, never the CURRENT one, so a direct PATCH
      // cancelled an order the admin had already delivered — the real
      // deliverable still attached to it. `canRequesterCancel` adds the
      // missing source-status check and fails closed on anything it does
      // not model. `String(existing.status ?? "")` rather than a cast: a
      // null/absent status must land on `""` (refused), not on the string
      // "null", and never throw here.
      permitted =
        isRequester &&
        targetStatus === "cancelled" &&
        canRequesterCancel(String(existing.status ?? ""));
    } else {
      // Unchanged from the original Task 6d rule. Covers lawyer/firm
      // self-tracking (contracts, cases, hearings) where the same person is
      // legitimately both requester and assignee of their own record —
      // `assigned_to` is null until an admin claims an order (Task 8), so an
      // admin acting on an unclaimed order is NOT the assignee; resolve
      // admin-ness from `profiles.user_type` directly rather than assuming
      // either implies the other.
      let isAdmin = false;
      if (!isAssignee) {
        const { data: callerProfile } = await supabase
          .from("profiles")
          .select("user_type")
          .eq("id", user.id)
          .single();
        isAdmin = (callerProfile?.user_type as string | undefined) === "admin";
      }
      permitted =
        isAssignee || isAdmin || (isRequester && targetStatus === "cancelled");
    }

    if (!permitted) {
      console.error(
        `[service-requests PATCH] refused status transition: order=${id} caller=${user.id} target=${targetStatus}`,
      );
      return NextResponse.json(
        { error: "غير مسموح بتنفيذ هذا الإجراء" },
        { status: 403 },
      );
    }
  }

  const { data, error } = await supabase
    .from("service_requests")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-create audit event (namespaced vocabulary via recordEvent).
  const eventName = patch.status
    ? RequestEvent.SERVICE_REQUEST_STATUS_CHANGED
    : RequestEvent.SERVICE_REQUEST_UPDATED;
  await recordEvent({
    supabase,
    requestId: id,
    event: eventName,
    actorUserId: user.id,
  });

  // Best-effort push to n8n (inert unless N8N_WEBHOOK_BASE_URL is set): dispatch.ts
  // routes to /request-assigned or /request-completed by the new status. Never breaks the update.
  try {
    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("id, display_name, user_type")
      .eq("id", user.id)
      .single();

    // Task 3 added `requesterProfile` to buildWebhookPayload so completion
    // events carry the requester's phone for outbound channels (WhatsApp).
    // This route is generic: the caller completing/cancelling the order is
    // often the ASSIGNEE (lawyer/firm/admin), not the requester, so the
    // requester's profile must be looked up separately. The RLS-scoped
    // `supabase` client cannot be used for this lookup — `profiles` only has
    // "read own profile" and "admins read all profiles" SELECT policies, so
    // a non-admin assignee reading a different user's row would silently get
    // null, defeating the fix on exactly the path it exists for. Use the
    // service-role client for this one read; it's still inside this
    // best-effort try and never blocks or fails the parent update.
    const svc = await createServiceClient();
    const { data: requesterProfile } = await svc
      .from("profiles")
      .select("id, display_name, phone, email, user_type")
      .eq("id", data.requester_user_id as string)
      .maybeSingle();

    await dispatchToN8n(
      eventName,
      buildWebhookPayload({
        event: eventName,
        timestamp: new Date().toISOString(),
        request: data as unknown as Record<string, unknown>,
        actor: actorProfile as unknown as Record<string, unknown> | null,
        requesterProfile: requesterProfile as unknown as Record<string, unknown> | null,
      }),
    );
  } catch (e) {
    console.error("[service-requests PATCH] n8n dispatch failed:", (e as Error).message);
  }

  // In-app notifications on meaningful status transitions (best-effort).
  const newStatus = typeof patch.status === "string" ? patch.status : null;
  if (newStatus) {
    const row = data as Record<string, unknown>;
    const requesterId = (row.requester_user_id as string | null) ?? null;
    const assignee = (row.assigned_to as string | null) ?? null;
    if (newStatus === "assigned" || newStatus === "in_progress") {
      if (requesterId) {
        await recordNotification({
          userId: requesterId,
          title: "تم تعيين مختص لطلبك",
          body: "بدأ العمل على طلبك.",
          href: "/dashboard",
        });
      }
      if (assignee && assignee !== requesterId) {
        await recordNotification({
          userId: assignee,
          title: "طلب جديد بانتظارك",
          body: "تم تعيين طلب خدمة جديد لك.",
          href: "/dashboard",
        });
      }
    } else if (newStatus === "completed") {
      if (requesterId) {
        await recordNotification({
          userId: requesterId,
          title: "تم إكمال طلبك",
          body: "اكتمل تنفيذ طلبك بنجاح.",
          href: "/dashboard",
        });
      }
    }
  }

  return NextResponse.json({ data: toWorkflowRequest(data as unknown as Record<string, unknown>) });
}
