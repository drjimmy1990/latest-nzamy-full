import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { NO_STORE, TRACKING_LINK_SELECT, toTrackingLinkDto, type TrackingLinkRow } from "../_shared";

/**
 * PATCH /api/v1/cases/[id]/tracking-links/[linkId]  { revoke: true }
 *
 * Revokes a client tracking link. Anyone who works on the case may revoke
 * (a departed member's link included); nobody can bring a revoked link back
 * — the table grants sessions UPDATE on revoked_at only, and its policy's
 * WITH CHECK refuses a NULL there (20261025_32). There is no DELETE.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; linkId: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id, linkId } = await context.params;
    if (!UUID_RE.test(linkId)) return NextResponse.json({ error: "الرابط غير موجود." }, { status: 404, headers: NO_STORE });

    const body = (await request.json().catch(() => null)) as { revoke?: unknown } | null;
    if (body?.revoke !== true) {
      return NextResponse.json({ error: "الإجراء الوحيد المتاح هو إيقاف الرابط." }, { status: 400, headers: NO_STORE });
    }

    const { data, error } = await supabase
      .from("case_tracking_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", linkId)
      .eq("case_request_id", id)
      .is("revoked_at", null)
      .select(TRACKING_LINK_SELECT)
      .maybeSingle();
    if (error) {
      console.error("[tracking-links PATCH] failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر إيقاف الرابط." }, { status: 500, headers: NO_STORE });
    }
    if (!data) return NextResponse.json({ error: "الرابط غير موجود أو موقوف من قبل." }, { status: 404, headers: NO_STORE });
    return NextResponse.json({ data: toTrackingLinkDto(data as TrackingLinkRow, user.id) }, { headers: NO_STORE });
  } catch (err) {
    console.error("[tracking-links PATCH] unexpected:", err);
    return NextResponse.json({ error: "تعذّر إيقاف الرابط." }, { status: 500, headers: NO_STORE });
  }
}
