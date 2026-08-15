import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/service-requests/[id]/attachments/[attachmentId]
 * Returns a short-lived signed URL for one of the order's attachments — an
 * intake document (contract, judgment, supporting file), NOT the deliverable
 * (see the sibling deliverable/route.ts for that; this route is its
 * counterpart for Task 9b, mirrored deliberately rather than diverging).
 * The caller must own the order, be its assignee, or be an admin.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const { id, attachmentId } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const admin = await createServiceClient();

  const { data: order } = await admin
    .from("service_requests")
    .select("id, requester_user_id, assigned_to")
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

  // Every "you get nothing" branch below returns this exact 404 body — the
  // same unification deliverable/route.ts uses for its NO_DOCUMENT branches,
  // for the same reason: a caller who can influence/guess `attachmentId`
  // must not be able to distinguish "doesn't exist" from "exists but belongs
  // to a different order" from the response and use that to enumerate
  // `attachments` row existence. The branches stay distinguishable
  // server-side via differently worded console.error calls only.
  const NOT_FOUND = { error: "المرفق غير موجود" } as const;

  // attachments.id is a bigserial (plain integer). The route param is a
  // string with nothing upstream validating its shape — enforce it here
  // rather than letting a non-numeric value fail downstream as a PostgREST
  // accident (mirrors the same check in deliverable/route.ts).
  if (!/^\d+$/.test(attachmentId)) {
    console.error(
      `[attachments] non-integer attachmentId: order=${id} attachmentId=${attachmentId}`,
    );
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  const { data: attachment } = await admin
    .from("attachments")
    .select("request_id, storage_path, file_name")
    .eq("id", attachmentId)
    .maybeSingle();

  if (!attachment?.storage_path) {
    // Missing row / no storage_path is a genuine data-integrity bug — never
    // legitimate — distinct from a binding mismatch below, so it gets its
    // own log line.
    console.error(
      `[attachments] attachment row missing or has no storage_path: order=${id} attachmentId=${attachmentId}`,
    );
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  // Bind attachmentId to THIS order before signing anything. A mismatch
  // means either tampering (attachmentId is a plain URL param, freely
  // client-chosen) or a bug upstream, and both are worth seeing in logs, but
  // the caller gets the identical "not found" response either way so a
  // mismatch can't be used to fingerprint who else's attachment that id
  // belongs to.
  if (attachment.request_id !== id) {
    console.error(
      `[attachments] attachment/order mismatch: order=${id} attachmentId=${attachmentId} attachment.request_id=${attachment.request_id}`,
    );
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  const { data: signed, error: signErr } = await admin.storage
    .from("documents").createSignedUrl(attachment.storage_path as string, 300);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "تعذّر إنشاء رابط التحميل" }, { status: 500 });
  }

  return NextResponse.json({
    url: signed.signedUrl,
    fileName: attachment.file_name ?? "document",
  });
}
