import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";
import { recordEvent, RequestEvent } from "@/lib/events";
import { recordNotification } from "@/lib/notify";
import { dispatchToN8n } from "@/lib/n8n/dispatch";
import { buildWebhookPayload } from "@/lib/n8n/payload";

/**
 * What happened when this route tried to hand the client's WhatsApp notice to
 * n8n. Recorded into `request_events` because the alternative was recording it
 * nowhere: dispatchToN8n() never throws, so an unreachable n8n, a 500 from the
 * workflow, and an unconfigured base URL all return `{ delivered: false }` —
 * a value this handler used to await and discard. The row was already
 * `completed` and the admin got a 200, which left "nobody could send it" and
 * "n8n has not answered yet" as the same blank state on the admin card, with
 * the difference visible only in the server console.
 *
 * Deliberately in the same `notification.whatsapp_` namespace n8n's own
 * callback writes (src/app/api/v1/n8n/callback/route.ts): the admin queue
 * surfaces the LATEST whatsapp event per order, and whether we managed to send
 * and whether it arrived are two answers to one question. A real receipt is
 * always written later than the attempt it answers, so it supersedes it with
 * no precedence rule. `request_events` has no metadata column, so — as with
 * every other event in this app — the name carries the entire signal.
 *
 * NOT_CONFIGURED is kept apart from DISPATCH_FAILED rather than folded into
 * it: `N8N_WEBHOOK_BASE_URL` is unset on the server today, so a single failure
 * state would paint every delivered order with an outage warning and teach
 * admins to ignore the one box that would matter during a real outage.
 *
 * Mirrored by the DISPATCH_* constants in
 * src/app/dashboard/admin/service-orders/page.tsx, the only reader.
 */
const WHATSAPP_DISPATCHED = "notification.whatsapp_dispatched";
const WHATSAPP_DISPATCH_FAILED = "notification.whatsapp_dispatch_failed";
const WHATSAPP_NOT_CONFIGURED = "notification.whatsapp_not_configured";

/**
 * Build the n8n payload for an order and post it, then record the outcome.
 *
 * Shared by the deliver branch and by the manual resend so the two send the
 * same thing — a resend that differed from the original would be a second
 * source of truth for what the client was told.
 *
 * Every failure path is swallowed exactly as before: this is a side-channel
 * and must never break (or un-do) the write that triggered it.
 */
async function dispatchOrderNotice(opts: {
  admin: SupabaseClient;
  orderId: string;
  /** The service_requests row as it stands AFTER the write. */
  order: Record<string, unknown>;
  requesterUserId: string | null;
  adminUserId: string;
  eventName: string;
  nowIso: string;
  /** Which outbound message this is, for n8n's own routing/idempotency. */
  kind: "delivery" | "delivery_resend" | "status_change";
}): Promise<void> {
  const { admin, orderId, order, requesterUserId, adminUserId, eventName, nowIso, kind } = opts;
  try {
    const { data: requesterProfile } = await admin
      .from("profiles").select("id, display_name, phone, email, user_type")
      .eq("id", requesterUserId as string).maybeSingle();
    const { data: actorProfile } = await admin
      .from("profiles").select("id, display_name, user_type").eq("id", adminUserId).maybeSingle();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const payload = buildWebhookPayload({
      event: eventName, timestamp: nowIso,
      request: order,
      actor: actorProfile as unknown as Record<string, unknown> | null,
      requesterProfile: requesterProfile as unknown as Record<string, unknown> | null,
      // The order link the owner asked n8n to send. Threaded through the
      // builder rather than pasted onto payload.data afterwards so it goes
      // through the ai_workspace allow-list instead of around it — see the
      // note on `deliverable` below for why "afterwards" is the dangerous
      // shape here.
      orderUrl: `${appUrl}/ai/orders/${orderId}`,
    });
    // Anything set here lands AFTER buildWebhookPayload's ai_workspace
    // redaction and is therefore invisible to it. So these two mirror the
    // copies the redaction already produced — `payload.data.metadata` —
    // instead of re-reading `order.metadata`, and that distinction is the
    // whole point. `service_requests.metadata` is a JSONB column stored
    // verbatim from the client's POST body
    // (src/app/api/v1/service-requests/route.ts:214, `metadata:
    // requestData.metadata ?? {}` — no shape validation of any kind), so
    // reading it here would go around the allow-list's primitive filter
    // (pickPrimitives, src/lib/n8n/payload.ts) and could ship
    // `{ caseText: "..." }` as `data.service` even though the redaction had
    // just dropped it.
    //
    // What this does NOT claim: that these two values are safe vocabulary.
    // Filtering to primitives only stops a nested object or array from riding
    // along on an allowed key. The values are still client-controlled and are
    // NOT checked against SERVICE_TITLE_AR
    // (src/lib/services/orderIntake.ts:20) — that constant is the intake
    // wizard's convention, not a constraint the server enforces, so a crafted
    // POST can put an arbitrary plain string in either key. Mirroring adds no
    // exposure the redacted payload does not already have: the identical
    // string is sitting in `payload.data.metadata` two keys away.
    //
    // The `?? "draft"` default these keys used to carry is gone, because it
    // was a fabrication n8n could act on. Not every ai_workspace order comes
    // from the AI intake wizard: the client consultation flow
    // (src/app/dashboard/client/consultation/new/page.tsx:148, `receiver:
    // path === "ai" ? "ai_workspace" : "lawyer"`) writes metadata with no
    // `service` key at all, and the admin queue filters on `receiver` alone
    // (../route.ts:42) — so the default told n8n that an AI consultation was
    // a "draft". An empty string says "not known" instead. Both keys stay
    // present, so for the live workflow this is a value change in its input,
    // never a shape change.
    //
    // `notificationKind` and `messageId` are added here too, and the warning
    // above does not extend to them: they are composed on this line from the
    // order id, this handler's own timestamp and a fixed literal, with no
    // client-controlled component to smuggle anything through. They exist so
    // the resend below is distinguishable — without them a client who is
    // messaged twice about the same order sends n8n two identical bodies, and
    // the workflow cannot tell the duplicate from the original or dedupe on
    // anything. Flat strings, not a nested object: nested is the shape the
    // primitive filter exists to stop, and there is no reason to reintroduce
    // it past the redaction.
    //
    // `deliverable: { fileName, notes }` used to be re-added here on the
    // deliver branch and is now gone: `notes` is the admin's free-text note
    // about the case (body.notes, written into metadata.deliverable at the
    // top of this handler) and `fileName` is a client- or admin-chosen file
    // name that routinely names the parties. Both are exactly the case
    // detail the owner ruled must not reach n8n, and the completion workflow
    // does not need either — `event`/`entity.status` say the order is done
    // and `orderUrl` is where the file actually is. No receiver check guards
    // this: the order lookup at the top of this handler is
    // `.eq("receiver", "ai_workspace")`, so every order this route can reach
    // is an AI order and an `if` here would have a dead false branch.
    const redactedMetadata = (payload.data.metadata ?? {}) as Record<string, unknown>;
    payload.data = {
      ...payload.data,
      service: typeof redactedMetadata.service === "string" ? redactedMetadata.service : "",
      serviceTitleAr:
        typeof redactedMetadata.serviceTitleAr === "string" ? redactedMetadata.serviceTitleAr : "",
      notificationKind: kind,
      messageId: `${orderId}:${kind}:${nowIso}`,
    };

    // Read BEFORE the call, because the return value cannot tell the two
    // apart: dispatchToN8n() answers `{ delivered: false }` both when it made
    // a request that failed and when it made no request at all.
    const configured = Boolean(process.env.N8N_WEBHOOK_BASE_URL);
    const { delivered } = await dispatchToN8n(eventName, payload);

    // Only the completion event reaches a webhook that messages the client —
    // resolvePath() returns null for everything else this route sends, so
    // recording an outcome for a claim or a cancellation would report a
    // failure to send something that was never meant to be sent.
    if (eventName !== RequestEvent.SERVICE_REQUEST_COMPLETED) return;

    await recordEvent({
      supabase: admin,
      requestId: orderId,
      event: !configured
        ? WHATSAPP_NOT_CONFIGURED
        : delivered ? WHATSAPP_DISPATCHED : WHATSAPP_DISPATCH_FAILED,
      actorUserId: adminUserId,
      actorName: "الإدارة",
    });
  } catch (e) { console.error("[service-orders] dispatchToN8n failed:", e); }
}

/**
 * PATCH /api/v1/admin/service-orders/[id]
 * Body: { action: "claim" | "assign" | "deliver" | "cancel" | "resend_whatsapp",
 *         documentId?, fileName?, notes?, reason?, sendWhatsapp?, assigneeUserId? }
 * Side-channels (event, notification, n8n) are best-effort and never break the write.
 *
 * "claim" is intentionally idempotent-as-takeover, not a 409: re-claiming an
 * already-claimed (in_review) order re-assigns it to whichever admin calls
 * claim last, rather than refusing. There is no reassignment route anywhere
 * else in the codebase, and POST /api/v1/documents (the only way to upload a
 * deliverable) only accepts a request_id whose order has
 * requester_user_id === caller OR assigned_to === caller. If claim 409'd on a
 * second call, an order claimed by one admin who then goes AWOL could never
 * be delivered by anyone else — permanently stuck at in_review with no
 * recovery path. Allowing takeover is the only unstick mechanism available.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const gate = await requireAdmin();
  if (!gate.isAdmin || !gate.userId) {
    return NextResponse.json({ error: gate.error ?? "غير مصرح" }, { status: gate.status ?? 403 });
  }
  const adminUserId = gate.userId;

  let body: {
    action?: "claim" | "assign" | "deliver" | "cancel" | "resend_whatsapp";
    documentId?: string; fileName?: string; notes?: string; reason?: string;
    internalNotes?: string; sendWhatsapp?: boolean;
    /** "assign" only — the admin to route this order to, or null to clear it. */
    assigneeUserId?: string | null;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 }); }

  const admin = await createServiceClient();
  const { data: order } = await admin
    .from("service_requests").select("*").eq("id", id).eq("receiver", "ai_workspace").maybeSingle();

  if (!order) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });

  const nowIso = new Date().toISOString();

  // Re-send the completion notice, changing nothing about the order.
  //
  // Handled BEFORE the decided-already guard below, and it is the one action
  // that has to be: a resend only makes sense for an order that is already
  // `completed`, which is precisely what that guard refuses. It carries no
  // `patch`, so nothing about the row can drift; and no recordNotification,
  // because the in-app «طلبك جاهز» was already delivered by the original and
  // a duplicate would put a second identical entry in the client's bell for a
  // WhatsApp problem they have no part in.
  if (body.action === "resend_whatsapp") {
    if (order.status !== "completed") {
      return NextResponse.json(
        { error: "لا يمكن إعادة إرسال الإشعار إلا بعد تسليم المستند" },
        { status: 409 },
      );
    }
    // Awaited, unlike a fire-and-forget side-channel: the admin card refetches
    // as soon as this responds, and an outcome row written after that refetch
    // would leave the button looking like it did nothing.
    await dispatchOrderNotice({
      admin, orderId: id, order,
      requesterUserId: (order.requester_user_id as string | null) ?? null,
      adminUserId, eventName: RequestEvent.SERVICE_REQUEST_COMPLETED, nowIso,
      kind: "delivery_resend",
    });
    return NextResponse.json({ success: true, data: order });
  }

  if (order.status === "completed" || order.status === "cancelled") {
    return NextResponse.json({ error: "تم البت في هذا الطلب مسبقًا" }, { status: 409 });
  }

  // ── "assign" — route the order to a named member of the team ───────────────
  //
  // Owner item ١٣ («توزيع المهام على أشرف ورامي بالاسم»). Handled as its own
  // early return rather than as another `patch` branch below, because all
  // THREE of the shared side-channels down there are wrong for it:
  //
  //   • recordNotification — a manager routing work internally is not a fact
  //     about the client's order. «بدأ العمل على طلبك» would be a claim we
  //     have not earned; the member has not opened it yet.
  //   • dispatchOrderNotice — the same message, over WhatsApp.
  //   • the `status` write — deliberately absent. resolvePath()
  //     (src/lib/n8n/dispatch.ts) keys the outbound webhook off STATUS, not
  //     the event name, so moving an order to `in_review` on a routing
  //     decision would fire the client's "work started" workflow. An order
  //     that is `pending_assignment` WITH an `assigned_to` is the honest
  //     state: routed, not started. The member's own «استلام» (claim) is
  //     still what moves it to `in_review`.
  //
  // Clearing (assigneeUserId: null) is supported so a wrong routing can be
  // undone without inventing a second action.
  if (body.action === "assign") {
    const assigneeUserId =
      typeof body.assigneeUserId === "string" && body.assigneeUserId.trim()
        ? body.assigneeUserId.trim()
        : null;

    // The id arrives from a <select> the admin console fills from
    // GET /api/v1/admin/teams, but this route is reachable directly and
    // `assigned_to` is what POST /api/v1/documents checks before letting
    // someone upload a deliverable onto this order. An unvalidated id here
    // would hand that permission to any user in the system.
    let assigneeName: string | null = null;
    if (assigneeUserId) {
      const { data: assignee } = await admin
        .from("profiles")
        .select("id, display_name, email, user_type")
        .eq("id", assigneeUserId)
        .maybeSingle();
      if (!assignee || assignee.user_type !== "admin") {
        return NextResponse.json(
          { error: "لا يمكن توجيه الطلب إلا لعضو من فريق الإدارة" },
          { status: 400 },
        );
      }
      assigneeName =
        (assignee.display_name as string | null)?.trim() ||
        (assignee.email as string | null) ||
        null;
    }

    const { data: routed, error: routeError } = await admin
      .from("service_requests")
      .update({ assigned_to: assigneeUserId, updated_at: nowIso })
      .eq("id", id)
      .select()
      .single();
    if (routeError) {
      return NextResponse.json({ error: routeError.message }, { status: 500 });
    }

    try {
      await recordEvent({
        supabase: admin,
        requestId: id,
        event: RequestEvent.SERVICE_REQUEST_REASSIGNED,
        actorUserId: adminUserId,
        // The audit row is the only place the routing decision is written
        // down, so it names the destination. Falls back to the raw id rather
        // than to «الإدارة» — an unnamed profile still has to be traceable.
        actorName: assigneeName
          ? `الإدارة ← ${assigneeName}`
          : assigneeUserId
            ? `الإدارة ← ${assigneeUserId}`
            : "الإدارة (إلغاء التوجيه)",
      });
    } catch (e) {
      console.error("[service-orders] assign recordEvent failed:", e);
    }

    return NextResponse.json({ success: true, data: routed });
  }

  const metadata = (order.metadata ?? {}) as Record<string, unknown>;
  let patch: Record<string, unknown>;
  let notifyTitle = "";
  let eventName: string = RequestEvent.SERVICE_REQUEST_STATUS_CHANGED;

  if (body.action === "claim") {
    patch = { status: "in_review", assigned_to: adminUserId, updated_at: nowIso };
    notifyTitle = "بدأ العمل على طلبك";
    // Claim and cancel both used to fall through to the generic
    // STATUS_CHANGED default, which made an order picked up and an order
    // killed literally the same row in `request_events` — the audit log could
    // not answer "who cancelled this and when". Both now name themselves. No
    // dispatch changes hands: resolvePath() (src/lib/n8n/dispatch.ts) has no
    // branch for either name, exactly as it had none for `status_changed` at
    // status `in_review` or `cancelled`.
    eventName = RequestEvent.SERVICE_REQUEST_ASSIGNED;
  } else if (body.action === "deliver") {
    if (!body.documentId || !body.fileName) {
      return NextResponse.json({ error: "المستند مطلوب" }, { status: 400 });
    }

    // Bind documentId to THIS order before ever writing it into metadata.
    // attachments.id is a bigserial (plain integer) and attachments.request_id
    // is nullable by design — without this check an admin (or a buggy client)
    // could mark the order completed pointing at an attachment with no
    // request_id (or another order's), which would fire the "طلبك جاهز"
    // notification and the n8n webhook while the download endpoint
    // (deliverable/route.ts) permanently 404s, and the order can never be
    // re-opened afterward because of the completed/cancelled guard above.
    // Mirrors the same check in deliverable/route.ts.
    if (!/^\d+$/.test(body.documentId)) {
      return NextResponse.json({ error: "معرف المستند غير صالح" }, { status: 400 });
    }
    const { data: attachment } = await admin
      .from("attachments").select("request_id").eq("id", body.documentId).maybeSingle();
    if (!attachment || attachment.request_id !== id) {
      console.error(
        `[admin service-orders] deliver refused: order=${id} documentId=${body.documentId} attachment.request_id=${attachment?.request_id ?? "(none)"}`,
      );
      return NextResponse.json({ error: "المستند غير مرتبط بهذا الطلب" }, { status: 400 });
    }

    patch = {
      status: "completed", updated_at: nowIso,
      metadata: {
        ...metadata,
        deliverable: {
          documentId: body.documentId, fileName: body.fileName,
          notes: body.notes ?? "", deliveredAt: nowIso, deliveredBy: adminUserId,
          // The admin's answer to «إرسال إشعار وتسليم المستند للموكل عبر
          // الواتساب». Recorded on the order rather than inferred later,
          // because a silent delivery and a notice that never went out are
          // indistinguishable after the fact — both leave no trace on the
          // WhatsApp channel at all. Defaults to true so an older client, or
          // any caller that omits the flag, keeps notifying: silence has to
          // be asked for.
          whatsappNotified: body.sendWhatsapp !== false,
        },
        // Task 3 — a note for the team, never sent to the client and never
        // sent to n8n. This route only has to write it: both the client's
        // GET routes (service-requests/[id] and the service-requests list)
        // and buildWebhookPayload() (used a few lines below, for the n8n
        // dispatch) strip it via the shared stripInternalNotes() helper —
        // see src/lib/services/internalNotes.ts. (Review round 2, Critical
        // 1/2: an earlier version of this comment claimed the client-facing
        // strip alone was enough and missed that this same handler also
        // forwards `updated` — internalNotes included — to n8n a few lines
        // down; the strip now lives inside the payload builder itself so no
        // caller of it can reintroduce either leak.)
        internalNotes: body.internalNotes ?? "",
      },
    };
    notifyTitle = "طلبك جاهز";
    eventName = RequestEvent.SERVICE_REQUEST_COMPLETED;
  } else if (body.action === "cancel") {
    patch = {
      status: "cancelled", updated_at: nowIso,
      metadata: { ...metadata, cancelReason: body.reason ?? "", internalNotes: body.internalNotes ?? "" },
    };
    notifyTitle = "تم إلغاء طلبك";
    // See the note on the claim branch. RequestEvent.SERVICE_REQUEST_CANCELLED
    // has existed since the vocabulary was written and this handler simply
    // never reached for it.
    eventName = RequestEvent.SERVICE_REQUEST_CANCELLED;
  } else {
    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("service_requests").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── side-channels: best-effort, never break the write ──────────────────────
  try {
    await recordEvent({ supabase: admin, requestId: id, event: eventName, actorUserId: adminUserId, actorName: "الإدارة" });
  } catch (e) { console.error("[service-orders] recordEvent failed:", e); }

  if (order.requester_user_id) {
    await recordNotification({
      userId: order.requester_user_id as string,
      title: notifyTitle,
      body: (updated.title as string) ?? "",
      href: `/ai/orders/${id}`,
    });
  }

  // The client's WhatsApp notice. Skipped entirely — not attempted and
  // recorded as failed — when the admin unticked the toggle: nothing was
  // meant to leave, so no outcome row is written and the card reads the
  // suppression off metadata.deliverable.whatsappNotified instead. On every
  // other action the flag is absent and this runs exactly as it always did
  // (claim and cancel resolve to no webhook path anyway).
  if (body.sendWhatsapp !== false) {
    await dispatchOrderNotice({
      admin, orderId: id, order: updated as unknown as Record<string, unknown>,
      requesterUserId: (order.requester_user_id as string | null) ?? null,
      adminUserId, eventName, nowIso,
      kind: body.action === "deliver" ? "delivery" : "status_change",
    });
  }

  return NextResponse.json({ success: true, data: updated });
}
