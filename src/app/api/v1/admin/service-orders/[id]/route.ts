import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";
import { recordEvent, RequestEvent } from "@/lib/events";
import { recordNotification } from "@/lib/notify";
import { dispatchToN8n } from "@/lib/n8n/dispatch";
import { buildWebhookPayload } from "@/lib/n8n/payload";

/**
 * PATCH /api/v1/admin/service-orders/[id]
 * Body: { action: "claim" | "deliver" | "cancel", documentId?, fileName?, notes?, reason? }
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
    action?: "claim" | "deliver" | "cancel";
    documentId?: string; fileName?: string; notes?: string; reason?: string;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 }); }

  const admin = await createServiceClient();
  const { data: order } = await admin
    .from("service_requests").select("*").eq("id", id).eq("receiver", "ai_workspace").maybeSingle();

  if (!order) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
  if (order.status === "completed" || order.status === "cancelled") {
    return NextResponse.json({ error: "تم البت في هذا الطلب مسبقًا" }, { status: 409 });
  }

  const nowIso = new Date().toISOString();
  const metadata = (order.metadata ?? {}) as Record<string, unknown>;
  let patch: Record<string, unknown>;
  let notifyTitle = "";
  let eventName: string = RequestEvent.SERVICE_REQUEST_STATUS_CHANGED;

  if (body.action === "claim") {
    patch = { status: "in_review", assigned_to: adminUserId, updated_at: nowIso };
    notifyTitle = "بدأ العمل على طلبك";
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
          notes: body.notes ?? "",
          internalNotes: (body as any).internalNotes ?? "",
          deliveredAt: nowIso, deliveredBy: adminUserId,
        },
      },
    };

    notifyTitle = "طلبك جاهز";
    eventName = RequestEvent.SERVICE_REQUEST_COMPLETED;
  } else if (body.action === "cancel") {
    patch = {
      status: "cancelled", updated_at: nowIso,
      metadata: { ...metadata, cancelReason: body.reason ?? "" },
    };
    notifyTitle = "تم إلغاء طلبك";
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

  try {
    const { data: requesterProfile } = await admin
      .from("profiles").select("id, display_name, phone, email, user_type")
      .eq("id", order.requester_user_id as string).maybeSingle();
    const { data: actorProfile } = await admin
      .from("profiles").select("id, display_name, user_type").eq("id", adminUserId).maybeSingle();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const payload = buildWebhookPayload({
      event: eventName, timestamp: nowIso,
      request: updated as unknown as Record<string, unknown>,
      actor: actorProfile as unknown as Record<string, unknown> | null,
      requesterProfile: requesterProfile as unknown as Record<string, unknown> | null,
    });
    payload.data = {
      ...payload.data,
      service: (metadata.service as string) ?? "draft",
      serviceTitleAr: (metadata.serviceTitleAr as string) ?? "",
      orderUrl: `${appUrl}/ai/orders/${id}`,
      ...(body.action === "deliver"
        ? { deliverable: { fileName: body.fileName, notes: body.notes ?? "" } }
        : {}),
    };
    await dispatchToN8n(eventName, payload);
  } catch (e) { console.error("[service-orders] dispatchToN8n failed:", e); }

  return NextResponse.json({ success: true, data: updated });
}
