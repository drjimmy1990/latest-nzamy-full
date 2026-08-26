import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { recordEvent, RequestEvent } from "@/lib/events";
import { dispatchToN8n } from "@/lib/n8n/dispatch";
import { buildWebhookPayload } from "@/lib/n8n/payload";
import { recordNotification } from "@/lib/notify";
import { stripInternalNotes } from "@/lib/services/internalNotes";
import { canRequesterCancel } from "@/lib/services/orderTransitions";
import {
  evaluateOrderEditability,
  validateEditedDescription,
  appendEditHistory,
} from "@/lib/services/orderEditGate";

/* ── سياسة التعديلات: ٤٨ ساعة / تعديلان ──────────────────────────────────────
 *
 * Owner ruling, 25 August: after the team delivers, the client may ask for a
 * revision TWICE, free, within 48 hours of delivery.
 *
 * This module is the ENFORCEMENT, not the display. Both numbers below are
 * re-derived here on every request from data that is already persisted on the
 * row — nothing the client sends is trusted, and nothing about how long the
 * client's tab has been open matters:
 *
 *   - the count comes from `metadata.revisions.length`, so a reload, a second
 *     tab, or a hand-rolled fetch all see the same two-request budget;
 *   - the deadline comes from `metadata.deliverable.deliveredAt`, written by
 *     the admin deliver branch (src/app/api/v1/admin/service-orders/[id]/
 *     route.ts — `deliveredAt: nowIso` inside the `deliverable` object). There
 *     is no `delivered_at` column, and `updated_at` is NOT a substitute: an
 *     admin claim bumps it too, so it would start the client's 48 hours at a
 *     moment nothing was delivered.
 *
 * `revisions` lives TOP-LEVEL under `metadata`, deliberately NOT nested inside
 * `metadata.deliverable`. The deliver branch rewrites `deliverable` wholesale
 * on every (re-)delivery, so a nested history would be erased by the very
 * re-delivery a revision asks for — the client's second request would then be
 * counted as their first, forever.
 *
 * The admin queue reads this same array; the shape is the contract:
 *   metadata.revisions: { requestedAt: ISO string, notes: string, index: 1-based }[]
 */
const REVISION_LIMIT = 2;
const REVISION_WINDOW_HOURS = 48;
const REVISION_WINDOW_MS = REVISION_WINDOW_HOURS * 60 * 60 * 1000;

/** One entry of `metadata.revisions`. */
interface OrderRevision {
  requestedAt: string;
  notes: string;
  index: number;
}

/**
 * `metadata.revisions`, defensively. `service_requests.metadata` is a JSONB
 * column stored verbatim from the client's POST body with no shape validation
 * (see the note in the admin route), so this must never assume it holds what
 * we last wrote — a non-array, or an array of nulls, has to count as "no
 * revisions used" without throwing, and it can only ever *lower* the count for
 * an order nobody has tampered with.
 */
function readRevisions(metadata: Record<string, unknown> | null | undefined): OrderRevision[] {
  const raw = metadata?.revisions;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is OrderRevision => entry != null && typeof entry === "object",
  );
}

/**
 * When the order was delivered, in epoch ms — or null when it has not been
 * delivered by the team at all.
 *
 * Fails closed on every unusable value (absent, empty, unparseable). Null is
 * not "assume now": defaulting to `Date.now()` — as the earlier draft of this
 * feature on `owner-edits` did — would hand a fresh 48-hour window to an order
 * with no delivery behind it. /ai/contract-drafter creates `ai_workspace` rows
 * already at status `completed` with no `metadata.deliverable` at all, so that
 * is a live case, not a hypothetical.
 */
function deliveredAtMs(metadata: Record<string, unknown> | null | undefined): number | null {
  const deliverable = metadata?.deliverable as Record<string, unknown> | undefined;
  const at = deliverable?.deliveredAt;
  if (typeof at !== "string" || at.trim() === "") return null;
  const ms = new Date(at).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Whether this order has ever been delivered by the team.
 *
 * Used by the cancel gate below, and it is load-bearing there: a revision
 * moves a delivered order back to `in_review`, which IS in
 * REQUESTER_CANCELLABLE, so without this check «طلب تعديل ثم إلغاء» would be a
 * two-step route around owner decision س٢ (a client must not cancel an order
 * that was already delivered) — with the real deliverable still attached.
 */
function hasBeenDelivered(metadata: Record<string, unknown> | null | undefined): boolean {
  return deliveredAtMs(metadata) !== null;
}

/**
 * The audit-log name for a revision request.
 *
 * `src/lib/events.ts` has no constant for this yet and is owned by another
 * agent this wave, so the literal lives here — matching the namespaced
 * vocabulary the rest of RequestEvent uses, and matching how the admin route
 * already writes its own `notification.whatsapp_*` names outside the enum.
 * `request_events.event` is a plain `text` column with no CHECK constraint
 * (20260518_client_workflow_backend_ready.sql:24), so this records correctly
 * today; when `RequestEvent.SERVICE_REQUEST_REVISION_REQUESTED` is added with
 * this exact value, swap the reference and no data migrates.
 */
const REVISION_REQUESTED_EVENT = RequestEvent.SERVICE_REQUEST_REVISION_REQUESTED;

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

  // ── «طلب تعديل» — the revisions policy ────────────────────────────────────
  //
  // Handled BEFORE `rawPatch` below, and it has to be: this action carries no
  // `status`, so falling through would hit ALLOWED_PATCH_FIELDS, drop every
  // key, and answer 400 «لا توجد حقول صالحة للتحديث» — a refusal that says
  // nothing about the policy. It also must not be expressible as an ordinary
  // patch: `metadata` is off the allowlist precisely so a client can never
  // write that column directly, and this handler composes the new metadata
  // itself rather than accepting one.
  if (body.action === "request_revision") {
    // `metadata` is needed for BOTH the deadline and the count; `title` for
    // the team's notification body. The RLS-scoped client is deliberate — the
    // requester's own SELECT/UPDATE policies cover their own row, so there is
    // no reason to reach for the service client and lose that second check.
    const { data: existing, error: existingError } = await supabase
      .from("service_requests")
      .select("requester_user_id, assigned_to, receiver, status, metadata, title")
      .eq("id", id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    }

    // Ownership. Only the person who ordered the work may ask for it to be
    // changed — not the assignee, not an admin (the admin route is where the
    // team acts), and not a stranger who guessed the id.
    if ((existing.requester_user_id as string | null) !== user.id) {
      console.error(
        `[service-requests PATCH] revision refused (not requester): order=${id} caller=${user.id}`,
      );
      return NextResponse.json(
        { error: "غير مسموح بطلب تعديل على هذا الطلب.", reason: "not_owner" },
        { status: 403 },
      );
    }

    // The policy is the owner's ruling for the four AI-fulfilled services.
    // A `lawyer`/`firm` row reaching here would be a different agreement
    // entirely, so it is refused rather than quietly governed by these numbers.
    if ((existing.receiver as string | null) !== "ai_workspace") {
      return NextResponse.json(
        { error: "سياسة التعديلات لا تنطبق على هذا الطلب.", reason: "not_applicable" },
        { status: 409 },
      );
    }

    const metadata = (existing.metadata ?? {}) as Record<string, unknown>;
    const deliveredMs = deliveredAtMs(metadata);

    // Two conditions, one message: there is nothing to revise unless the team
    // has actually delivered. `status === "completed"` alone is not enough —
    // /ai/contract-drafter writes `completed` rows with no deliverable — and a
    // `deliveredAt` alone is not enough either, since an already-cancelled
    // order can carry one.
    if (existing.status !== "completed" || deliveredMs === null) {
      return NextResponse.json(
        {
          error: "لا يمكن طلب تعديل قبل تسليم المستند من فريق نظامي.",
          reason: "not_delivered",
        },
        { status: 409 },
      );
    }

    // Exact milliseconds, not the floored whole hours the earlier draft used:
    // flooring made the 49th hour read as "48" and pass the check, handing out
    // an extra hour of window at the boundary.
    const deadlineMs = deliveredMs + REVISION_WINDOW_MS;
    if (Date.now() > deadlineMs) {
      return NextResponse.json(
        {
          error: `انتهت مهلة التعديلات المجانية (${REVISION_WINDOW_HOURS} ساعة من التسليم). يمكنك فتح تذكرة دعم.`,
          reason: "window_expired",
        },
        { status: 409 },
      );
    }

    const revisions = readRevisions(metadata);
    if (revisions.length >= REVISION_LIMIT) {
      return NextResponse.json(
        {
          error: `استُهلك الحد الأقصى للتعديلات المجانية (${REVISION_LIMIT}). يمكنك فتح تذكرة دعم.`,
          reason: "quota_exhausted",
        },
        { status: 409 },
      );
    }

    // A revision with no notes is a re-delivery request the team cannot act
    // on. The cap is here so a single field cannot bloat the JSONB column the
    // whole order lives in.
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    if (notes === "") {
      return NextResponse.json(
        { error: "اكتب ملاحظات التعديل المطلوب.", reason: "empty_notes" },
        { status: 400 },
      );
    }
    if (notes.length > 2000) {
      return NextResponse.json(
        { error: "ملاحظات التعديل طويلة جداً (الحد ٢٠٠٠ حرف).", reason: "notes_too_long" },
        { status: 400 },
      );
    }

    const nowIso = new Date().toISOString();
    const revision: OrderRevision = {
      requestedAt: nowIso,
      notes,
      // 1-based, so it reads as the client sees it («تعديل ٢ من ٢») and so a
      // truncated/absent array can never produce index 0.
      index: revisions.length + 1,
    };

    // Compare-and-swap on `status`. Two clicks landing together would both
    // read `revisions.length === 0` above and both write index 1, spending one
    // budget slot on two requests; the `.eq("status", "completed")` makes the
    // second update match zero rows, because the first already moved the order
    // to `in_review`. `maybeSingle()` rather than `single()` so that case comes
    // back as a null row to answer, not a thrown PostgREST error.
    //
    // The whole `metadata` object is written back, not just `revisions`:
    // PostgREST replaces a JSONB column wholesale, so spreading `metadata`
    // preserves `deliverable`, `intake`, `attachments` — and `internalNotes`,
    // the team's private note, which must survive this write untouched (it is
    // stripped on the way OUT, in GET and in the response below, never
    // deleted from the row).
    const { data: updated, error: updateError } = await supabase
      .from("service_requests")
      .update({
        // Deliberately an EXISTING status value. A dedicated
        // `revision_requested` status would need a CHECK-constraint migration
        // on service_requests.status, and every status-filtered consumer
        // (admin queue, timelines, ORDER_STATUS_AR) would have to learn it.
        // `in_review` is what the admin claim already writes, so the order
        // reappears in the admin queue exactly where an unfinished order
        // belongs; `metadata.revisions` is what tells the team it is a
        // revision rather than a first pass.
        status: "in_review",
        metadata: { ...metadata, revisions: [...revisions, revision] },
        updated_at: nowIso,
      })
      .eq("id", id)
      .eq("status", "completed")
      .select()
      .maybeSingle();

    if (updateError) {
      console.error("[service-requests PATCH] revision update failed:", updateError.message);
      return NextResponse.json(
        { error: "تعذّر تسجيل طلب التعديل. حاول مرة أخرى.", reason: "write_failed" },
        { status: 500 },
      );
    }
    if (!updated) {
      return NextResponse.json(
        { error: "تغيّرت حالة الطلب. حدّث الصفحة ثم حاول مرة أخرى.", reason: "conflict" },
        { status: 409 },
      );
    }

    // ── side-channels: best-effort, never break the write ────────────────────
    // Same shape as the admin route's deliver/cancel branches: one
    // `request_events` row for the audit log, one in-app notification for the
    // other side. No n8n dispatch — resolvePath() has no path for this event,
    // so a call would be inert, and the outbound WhatsApp workflows are about
    // telling the CLIENT something, which is the wrong direction here.
    try {
      await recordEvent({
        supabase,
        requestId: id,
        event: REVISION_REQUESTED_EVENT,
        actorUserId: user.id,
        actorName: "العميل",
      });
    } catch (e) {
      console.error("[service-requests PATCH] revision recordEvent failed:", e);
    }

    // Whoever the order is assigned to; falling back to the admin who
    // delivered it, since `assigned_to` can be null on an order delivered
    // without a claim.
    //
    // Both candidates are CLIENT-SUPPLIED and must be treated as such. The
    // POST route writes `assigned_to: requestData.assignedTo ?? ... ?? null`
    // and `metadata: requestData.metadata ?? {}` verbatim from the request
    // body (src/app/api/v1/service-requests/route.ts:241,245 — no validation
    // of either), and CREATE_STATUS_ALLOWLIST there admits `"completed"`
    // (:213, which is how /ai/contract-drafter creates its rows). So a
    // requester can create their OWN ai_workspace order that already looks
    // delivered — forged `deliverable.deliveredAt`, `deliveredBy` pointing at
    // any user id they like, and a `title` of their choosing — and then call
    // this action. Every gate above passes legitimately: it IS their order,
    // it IS `completed`, it DOES have a deliveredAt. Handing that
    // `teamUserId` straight to recordNotification would make this endpoint a
    // notification cannon: arbitrary recipient, attacker-written body, twice
    // per order and unlimited orders.
    //
    // So the recipient is confirmed to be an admin before anything is sent.
    // The service-role client is required for this lookup, not a shortcut:
    // `profiles` only has "read own profile" and "admins read all profiles"
    // SELECT policies, so the RLS-scoped client would return null for every
    // other user and the check would refuse every legitimate notification too
    // — the same trap the n8n block further down documents. Read-only, one
    // column, inside a best-effort block that never touches the write above.
    const deliverable = metadata.deliverable as Record<string, unknown> | undefined;
    const teamUserId =
      (existing.assigned_to as string | null) ??
      (typeof deliverable?.deliveredBy === "string" ? deliverable.deliveredBy : null);
    if (teamUserId) {
      try {
        const svc = await createServiceClient();
        const { data: teamProfile } = await svc
          .from("profiles")
          .select("user_type")
          .eq("id", teamUserId)
          .maybeSingle();
        if ((teamProfile?.user_type as string | undefined) === "admin") {
          await recordNotification({
            userId: teamUserId,
            title: "طلب تعديل من العميل",
            body: `${(existing.title as string | null) ?? "طلب خدمة"} — التعديل ${revision.index} من ${REVISION_LIMIT}`,
            href: "/dashboard/admin/service-orders",
          });
        } else {
          // Not an error state worth failing on: a genuinely unclaimed order
          // has no admin to notify, and the revision is recorded either way —
          // the admin queue surfaces it from `metadata.revisions`, which is
          // the durable signal. Logged because the other reason to land here
          // is the forgery above.
          console.error(
            `[service-requests PATCH] revision notification skipped, recipient is not an admin: order=${id} recipient=${teamUserId}`,
          );
        }
      } catch (e) {
        console.error("[service-requests PATCH] revision notification failed:", e);
      }
    }

    // Never return `updated` wholesale: `select()` brings back the raw row,
    // `metadata.internalNotes` included, and the caller here is by definition
    // the client. Same strip the GET above applies, with `isAdmin: false` —
    // this branch already proved the caller is the requester, and a requester
    // reading their own order is exactly the case the note must not cross.
    return NextResponse.json({
      data: toWorkflowRequest({
        ...(updated as Record<string, unknown>),
        metadata: stripInternalNotes(
          (updated as Record<string, unknown>).metadata as Record<string, unknown> | null,
          false,
        ),
      }),
    });
  }

  // ── «تعديل الطلب» — owner item ٥ ──────────────────────────────────────────
  //
  // Handled here, before `rawPatch`, for exactly the reason `request_revision`
  // above is: this action carries no `status`, so falling through would hit
  // ALLOWED_PATCH_FIELDS, drop every key and answer «لا توجد حقول صالحة
  // للتحديث» — a refusal that tells the client nothing about why. And it must
  // not be expressible as an ordinary patch: `description` is off the
  // allowlist on purpose (RLS lets any participant write ANY column on their
  // own row), so this handler is the only path that can change it, and it
  // enforces the window before it does.
  if (body.action === "edit_details") {
    const { data: existing, error: existingError } = await supabase
      .from("service_requests")
      .select("requester_user_id, assigned_to, status, metadata, description, title")
      .eq("id", id)
      .single();

    if (existingError || !existing) {
      return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    }

    const gate = evaluateOrderEditability({
      requesterUserId: existing.requester_user_id as string | null,
      callerUserId: user.id,
      status: existing.status as string | null,
      assignedTo: existing.assigned_to as string | null,
      metadata: existing.metadata as Record<string, unknown> | null,
    });
    if (!gate.editable) {
      // 403 for "not yours", 409 for "the work moved on" — the second is a
      // state conflict the client can see explained on the page, not an
      // authorisation failure.
      return NextResponse.json(
        { error: gate.message, reason: gate.reason },
        { status: gate.reason === "not_owner" ? 403 : 409 },
      );
    }

    const validated = validateEditedDescription(body.description);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const previous = typeof existing.description === "string" ? existing.description : "";
    if (validated.value === previous) {
      // Not an error, and deliberately not a write either: an unchanged save
      // would append a history entry recording that nothing changed and put a
      // «عُدِّل» pill on the admin card for no reason.
      return NextResponse.json({ success: true, unchanged: true });
    }

    const nowIso = new Date().toISOString();
    const metadata = (existing.metadata ?? {}) as Record<string, unknown>;
    const { data: updated, error: updateError } = await supabase
      .from("service_requests")
      .update({
        description: validated.value,
        // The previous text is kept, not overwritten. This is a law office —
        // what the client originally asked for has to stay answerable after
        // he has changed what he asked for.
        metadata: { ...metadata, editHistory: appendEditHistory(metadata, previous, nowIso) },
        updated_at: nowIso,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Best-effort, exactly like every other side-channel in this file: the
    // edit is already saved and a failed audit row must not undo it.
    try {
      await recordEvent({
        supabase,
        requestId: id,
        event: RequestEvent.SERVICE_REQUEST_UPDATED,
        actorUserId: user.id,
        actorName: "العميل",
      });
    } catch (e) {
      console.error("[service-requests PATCH] edit_details recordEvent failed:", e);
    }

    return NextResponse.json({ success: true, data: updated });
  }

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
      //
      // `metadata` joined it for the revisions policy: the lock has to survive
      // an order that was delivered and then sent back to `in_review` by a
      // revision request. See hasBeenDelivered() at the top of this file.
      .select("requester_user_id, assigned_to, receiver, status, metadata")
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
      //
      // The `!hasBeenDelivered` conjunct is the revisions policy's half of
      // that same lock, and it exists because the policy opened a way around
      // the status check rather than through it: «طلب تعديل» moves a delivered
      // order from `completed` back to `in_review`, and `in_review` IS in
      // REQUESTER_CANCELLABLE. Without this, a client could request a
      // revision and then cancel the order — the delivered file still
      // attached, the team's work already done. Deriving it from
      // `metadata.deliverable.deliveredAt` rather than from the status makes
      // the lock a property of "was this ever delivered", which no later
      // status change can undo.
      //
      // It only ever NARROWS what was permitted before: an order that has
      // never been delivered has no `metadata.deliverable`, so the conjunct is
      // true and the outcome is identical for every ordinary cancel. The one
      // status where a deliverable normally exists — `completed` — was already
      // refused by canRequesterCancel. /ai/contract-drafter's `completed` rows
      // carry no `deliverable` at all (page.tsx:103-113) and are likewise
      // unaffected, being refused by the status check as before.
      permitted =
        isRequester &&
        targetStatus === "cancelled" &&
        canRequesterCancel(String(existing.status ?? "")) &&
        !hasBeenDelivered(existing.metadata as Record<string, unknown> | null);
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

/**
 * POST /api/v1/service-requests/[id] — «فتح تذكرة دعم / شكوى»
 * Body: { action: "support_ticket", notes: string }
 *
 * The escalation path once the 48-hour revisions window has closed or both
 * free revisions are spent. It opens a real row in `support_tickets` — the
 * same table /dashboard/admin/tickets already lists — pre-filled with the
 * order reference, so the team opens the ticket already knowing which order
 * it is about.
 *
 * Why it lives on this route rather than a client-facing /api/v1/tickets:
 * there is no such endpoint, and the only tickets route that exists
 * (/api/v1/admin/tickets) is behind requireAdmin() and inserts with the
 * service client, so a client cannot use it. A ticket about an order is a
 * sub-resource of that order, and this route already establishes who the
 * caller is and whether the order is theirs — so the ticket is opened here
 * instead of shipping a button with nothing behind it.
 *
 * The insert deliberately uses the RLS-scoped client and sets `user_id` to the
 * caller: `support_tickets` has a `tickets_insert_own` policy
 * (`with check (user_id = auth.uid())`, 20260706_content_and_ops.sql:85), so
 * the database itself guarantees a client can only ever file a ticket in their
 * own name — no service-role escalation is needed or wanted here.
 *
 * NOT gated on the revisions window on purpose. The UI offers it only in the
 * escalated state, but a support channel that refuses to hear from someone is
 * the failure mode support exists to prevent — and a client with a live
 * revision left may still have a complaint that is not a revision.
 */
export async function POST(
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

  let body: { action?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  if (body.action !== "support_ticket") {
    return NextResponse.json(
      { error: "إجراء غير معروف", reason: "unknown_action" },
      { status: 400 },
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("service_requests")
    .select("requester_user_id, title, metadata")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
  }

  // Same ownership rule as the revision branch: a ticket ABOUT an order may
  // only be opened by the person whose order it is. Without this the endpoint
  // would let any signed-in user attach a complaint to an order id they
  // guessed, and the title we pre-fill would tell them that order's subject.
  if ((existing.requester_user_id as string | null) !== user.id) {
    console.error(
      `[service-requests POST] ticket refused (not requester): order=${id} caller=${user.id}`,
    );
    return NextResponse.json(
      { error: "غير مسموح بفتح تذكرة على هذا الطلب.", reason: "not_owner" },
      { status: 403 },
    );
  }

  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (notes === "") {
    return NextResponse.json(
      { error: "اكتب تفاصيل الشكوى أو الاستفسار.", reason: "empty_notes" },
      { status: 400 },
    );
  }
  if (notes.length > 4000) {
    return NextResponse.json(
      { error: "النص طويل جداً (الحد ٤٠٠٠ حرف).", reason: "notes_too_long" },
      { status: 400 },
    );
  }

  const metadata = (existing.metadata ?? {}) as Record<string, unknown>;
  const serviceTitleAr =
    typeof metadata.serviceTitleAr === "string" ? metadata.serviceTitleAr : "";
  const orderTitle = (existing.title as string | null) ?? "طلب خدمة";

  // One open ticket per order. Best-effort in both directions: the admin
  // tickets route notes that `support_tickets` may not be applied on the
  // remote DB yet, so a failing SELECT here must not become a 500 and must not
  // block the insert — it just means the duplicate check could not run, and a
  // duplicate ticket is a far smaller problem than a support channel that
  // errors out. `tickets_select_own` scopes this to the caller's own rows.
  // `error` is destructured and logged rather than left to the catch:
  // supabase-js RESOLVES with `{ data: null, error }` instead of throwing, so
  // a missing table would otherwise fall through to the insert with no trace
  // anywhere of why the check did not run. Falling through is still the right
  // behaviour — it is only the silence that is wrong.
  try {
    const { data: openTicket, error: dupError } = await supabase
      .from("support_tickets")
      .select("id")
      .eq("user_id", user.id)
      .eq("metadata->>orderId", id)
      .in("status", ["open", "pending"])
      .limit(1)
      .maybeSingle();
    if (dupError) {
      console.error(
        "[service-requests POST] duplicate-ticket check failed:",
        dupError.message,
        dupError.code,
      );
    }
    if (openTicket) {
      return NextResponse.json(
        {
          error: "لديك تذكرة مفتوحة بالفعل لهذا الطلب، وفريق الدعم يراجعها.",
          reason: "duplicate_open",
        },
        { status: 409 },
      );
    }
  } catch (e) {
    console.error("[service-requests POST] duplicate-ticket check failed:", e);
  }

  const { data: ticket, error: insertError } = await supabase
    .from("support_tickets")
    .insert({
      user_id: user.id,
      // `subject` is `not null`; the order reference goes in it so the admin
      // list is useful without opening each row.
      subject: `شكوى/استفسار بخصوص الطلب #${id}${serviceTitleAr ? ` — ${serviceTitleAr}` : ""}`,
      body: notes,
      category: "order",
      priority: "normal",
      status: "open",
      // `orderId` is the key the duplicate check above reads, and the link the
      // admin console needs to jump from the ticket back to the order.
      metadata: { orderId: id, orderTitle, serviceTitleAr },
    })
    .select("id")
    .single();

  if (insertError || !ticket) {
    // The client falls back to the WhatsApp support contact on this response —
    // see RevisionPanel.tsx. That fallback is the reason this returns a
    // distinguishable code rather than a bare 500: an unapplied
    // `support_tickets` table must not leave the client with no way to reach
    // anyone.
    console.error(
      "[service-requests POST] ticket insert failed:",
      insertError?.message ?? "(no row returned)",
    );
    return NextResponse.json(
      {
        error: "تعذّر فتح التذكرة حالياً. تواصل مع الدعم عبر واتساب.",
        reason: "tickets_unavailable",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ data: { id: ticket.id } }, { status: 201 });
}
