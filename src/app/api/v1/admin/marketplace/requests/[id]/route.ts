import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { recordNotification } from "@/lib/notify";
import { recordEvent, RequestEvent } from "@/lib/events";
import {
  INTERMEDIARY_NOTICE_AR,
  MARKET_SQL_MISSING_AR,
  decideResultReply,
  isMarketSqlMissing,
} from "@/lib/marketplace/marketSettings";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/v1/admin/marketplace/requests/[id] — the admin's priority over
 * the market (l12 Q130a, RAW[22]: «تستطيع في أي وقت أن تسند الطلب إلى محامٍ
 * بعينه، فيُقفَل عن الباقين ويُسجَّل الإسناد»).
 * Body: { action: "assign_lawyer", lawyerUserId } | { action: "hide" } | { action: "unhide" }
 *
 *   assign_lawyer  public.marketplace_assign_lawyer (20261202_70): a verified,
 *                  non-test lawyer; the request must be free or only routed
 *                  inside the team; never over another lawyer. Status is not
 *                  changed (the client's WhatsApp webhook keys off status).
 *                  The lawyer and the client get an in-app notice.
 *   hide / unhide  marketplace_hidden_at — the request leaves / returns to
 *                  the lawyers' list without touching the order.
 * To take a request back from a lawyer, use «توجيه» on the service-orders
 * queue (assign to a team member or clear) — the order is never lost.
 * orders.manage; one audit row each.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireStaff("orders.manage");
    if (!gate.ok) return gate.response;
    const { id } = await params;
    if (!id || id.length > 100) return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });

    let body: { action?: unknown; lawyerUserId?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    const admin = await createServiceClient();

    if (body.action === "hide" || body.action === "unhide") {
      const hidden = body.action === "hide";
      const { data, error } = await admin
        .from("service_requests")
        .update({ marketplace_hidden_at: hidden ? new Date().toISOString() : null })
        .eq("id", id)
        .eq("receiver", "ai_workspace")
        .select("id")
        .maybeSingle();
      if (error) {
        if (error.code === "42703" || error.code === "PGRST204") {
          return NextResponse.json({ error: MARKET_SQL_MISSING_AR }, { status: 503 });
        }
        console.error("[admin/marketplace/requests PATCH] hide failed:", error.code);
        return NextResponse.json({ error: "تعذّر الحفظ." }, { status: 500 });
      }
      if (!data) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
      await logAdminAction({
        actorId: gate.userId,
        action: hidden ? "marketplace_request_hidden" : "marketplace_request_unhidden",
        targetType: "service_request",
        targetId: id,
      });
      return NextResponse.json({ message: hidden ? "أُخفي الطلب من السوق." : "أُعيد الطلب إلى السوق." });
    }

    if (body.action !== "assign_lawyer") {
      return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
    }
    const lawyerUserId = typeof body.lawyerUserId === "string" ? body.lawyerUserId.trim() : "";
    if (!UUID_RE.test(lawyerUserId)) return NextResponse.json({ error: "اختر محامياً." }, { status: 400 });

    const { data, error } = await admin.rpc("marketplace_assign_lawyer", {
      p_request_id: id,
      p_lawyer: lawyerUserId,
      p_actor: gate.userId,
    });
    if (error) {
      if (isMarketSqlMissing(error.code)) return NextResponse.json({ error: MARKET_SQL_MISSING_AR }, { status: 503 });
      console.error("[admin/marketplace/requests PATCH] assign failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر الإسناد." }, { status: 500 });
    }
    const result = (data as { result?: string } | null)?.result;
    const reply = decideResultReply(result);
    if (result !== "assigned") {
      const refusal = decideResultReply(result).message;
      return NextResponse.json({ result: result ?? null, error: refusal }, { status: reply.status });
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "marketplace_request_assigned_lawyer",
      targetType: "service_request",
      targetId: id,
      after: { assigned_to: lawyerUserId },
    });
    try {
      await recordEvent({
        supabase: admin,
        requestId: id,
        event: RequestEvent.SERVICE_REQUEST_REASSIGNED,
        actorUserId: gate.userId,
        actorName: "الإدارة ← محامٍ من السوق",
      });
    } catch (e) {
      console.error("[admin/marketplace/requests PATCH] recordEvent failed:", e);
    }
    await recordNotification({
      userId: lawyerUserId,
      title: "أسندت إليك الإدارة طلباً من السوق",
      body: `أُسند إليك الطلب ${id}. تجده في «طلبات أُسندت إليّ». ${INTERMEDIARY_NOTICE_AR}`,
      href: "/dashboard/lawyer/marketplace",
    });
    const { data: order } = await admin.from("service_requests").select("requester_user_id").eq("id", id).maybeSingle();
    const requester = (order as { requester_user_id?: string | null } | null)?.requester_user_id;
    if (requester) {
      await recordNotification({
        userId: requester,
        title: "أُسند طلبك إلى محامٍ موثَّق",
        body: `أُسند طلبك إلى محامٍ موثَّق عبر سوق الطلبات. ${INTERMEDIARY_NOTICE_AR}`,
        href: `/ai/orders/${id}`,
      });
    }
    return NextResponse.json({ result, message: reply.message });
  } catch (err) {
    console.error("[admin/marketplace/requests PATCH] unexpected:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر الحفظ." }, { status: 500 });
  }
}
