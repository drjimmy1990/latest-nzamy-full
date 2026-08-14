import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/service-requests/[id]/deliverable
 * Returns a short-lived signed URL for the order's deliverable.
 * The caller must own the order, be its assignee, or be an admin.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const admin = await createServiceClient();

  const { data: order } = await admin
    .from("service_requests")
    .select("id, requester_user_id, assigned_to, status, metadata")
    .eq("id", id)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });

  const { data: profile } = await admin
    .from("profiles").select("user_type").eq("id", user.id).single();

  const allowed =
    order.requester_user_id === user.id ||
    order.assigned_to === user.id ||
    profile?.user_type === "admin";

  if (!allowed) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const deliverable = (order.metadata as Record<string, unknown> | null)?.deliverable as
    | { documentId?: string; fileName?: string }
    | undefined;

  if (!deliverable?.documentId) {
    return NextResponse.json({ error: "لا يوجد مستند بعد" }, { status: 404 });
  }

  const { data: attachment } = await admin
    .from("attachments")
    .select("request_id, storage_path, file_name")
    .eq("id", deliverable.documentId)
    .maybeSingle();

  if (!attachment?.storage_path) {
    return NextResponse.json({ error: "المستند غير متاح" }, { status: 404 });
  }

  // Never trust `deliverable.documentId` as a free-floating pointer: it can be
  // client-tampered via the generic PATCH route (no column allowlist there yet).
  // Bind it to THIS order before signing anything — a mismatch means either
  // tampering or a bug upstream, and both are worth seeing in logs, but the
  // caller gets the same "no document yet" response either way so a mismatch
  // can't be used to fingerprint who else's document that id belongs to.
  if (attachment.request_id !== id) {
    console.error(
      `[deliverable] attachment/order mismatch: order=${id} documentId=${deliverable.documentId} attachment.request_id=${attachment.request_id}`,
    );
    return NextResponse.json({ error: "لا يوجد مستند بعد" }, { status: 404 });
  }

  const { data: signed, error: signErr } = await admin.storage
    .from("documents").createSignedUrl(attachment.storage_path as string, 300);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "تعذّر إنشاء رابط التحميل" }, { status: 500 });
  }

  return NextResponse.json({
    url: signed.signedUrl,
    fileName: deliverable.fileName ?? attachment.file_name ?? "document",
  });
}
