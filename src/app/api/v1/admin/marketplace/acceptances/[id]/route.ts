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
 * PATCH /api/v1/admin/marketplace/acceptances/[id] — the admin approves or
 * rejects a lawyer's ask (l12 Q130a, RAW[66]).
 * Body: { action: "approve" | "reject", note?: string (≤ 500, the lawyer reads it) }
 *
 * public.marketplace_acceptance_decide (20261202_70, service role) does it in
 * one transaction: approve assigns the request with one UPDATE … WHERE
 * assigned_to IS NULL (a second approve answers «taken»), supersedes the
 * other asks; the request's status is NOT changed (the client's WhatsApp
 * webhook keys off status). In-app notices only: the lawyer, and on approval
 * the client. orders.manage; one audit row.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireStaff("orders.manage");
    if (!gate.ok) return gate.response;
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });

    let body: { action?: unknown; note?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }
    if (body.action !== "approve" && body.action !== "reject") {
      return NextResponse.json({ error: "الإجراء: اعتماد أو رفض." }, { status: 400 });
    }
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    const approve = body.action === "approve";

    const admin = await createServiceClient();
    const { data, error } = await admin.rpc("marketplace_acceptance_decide", {
      p_id: id,
      p_actor: gate.userId,
      p_approve: approve,
      p_note: note || null,
    });
    if (error) {
      if (isMarketSqlMissing(error.code)) return NextResponse.json({ error: MARKET_SQL_MISSING_AR }, { status: 503 });
      console.error("[admin/marketplace/acceptances PATCH] rpc failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر حفظ القرار." }, { status: 500 });
    }
    const out = (data ?? {}) as { result?: string; request_id?: string; lawyer_user_id?: string };
    const reply = decideResultReply(out.result);

    if (out.result === "approved" || out.result === "rejected" || out.result === "taken") {
      await logAdminAction({
        actorId: gate.userId,
        action: out.result === "approved" ? "marketplace_ask_approved" : out.result === "rejected" ? "marketplace_ask_rejected" : "marketplace_ask_taken",
        targetType: "service_request",
        targetId: out.request_id ?? id,
        after: { acceptance_id: id, lawyer_user_id: out.lawyer_user_id ?? null, result: out.result },
        metadata: note ? { note } : {},
      });
    }

    if (out.lawyer_user_id && out.request_id) {
      if (out.result === "approved") {
        await recordNotification({
          userId: out.lawyer_user_id,
          title: "اعتُمد قبولك لطلب من السوق",
          body: `أُسند إليك الطلب ${out.request_id}. تجده في «طلبات أُسندت إليّ». ${INTERMEDIARY_NOTICE_AR}`,
          href: "/dashboard/lawyer/marketplace",
        });
        const { data: order } = await admin
          .from("service_requests")
          .select("requester_user_id")
          .eq("id", out.request_id)
          .maybeSingle();
        const requester = (order as { requester_user_id?: string | null } | null)?.requester_user_id;
        if (requester) {
          await recordNotification({
            userId: requester,
            title: "أُسند طلبك إلى محامٍ موثَّق",
            body: `أُسند طلبك إلى محامٍ موثَّق عبر سوق الطلبات. ${INTERMEDIARY_NOTICE_AR}`,
            href: `/ai/orders/${out.request_id}`,
          });
        }
        try {
          await recordEvent({
            supabase: admin,
            requestId: out.request_id,
            event: RequestEvent.SERVICE_REQUEST_REASSIGNED,
            actorUserId: gate.userId,
            actorName: "الإدارة ← محامٍ من السوق",
          });
        } catch (e) {
          console.error("[admin/marketplace/acceptances PATCH] recordEvent failed:", e);
        }
      } else if (out.result === "rejected" || out.result === "taken") {
        await recordNotification({
          userId: out.lawyer_user_id,
          title: out.result === "rejected" ? "لم يُعتمد قبولك لطلب من السوق" : "أُسند طلب السوق لغيرك",
          body:
            out.result === "rejected"
              ? `لم تعتمد الإدارة قبولك للطلب ${out.request_id}.${note ? ` السبب: ${note}` : ""}`
              : `أُسند الطلب ${out.request_id} قبل اعتماد قبولك.`,
          href: "/dashboard/lawyer/marketplace",
        });
      }
    }

    return NextResponse.json({ result: out.result ?? null, message: reply.message }, { status: reply.status });
  } catch (err) {
    console.error("[admin/marketplace/acceptances PATCH] unexpected:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر حفظ القرار." }, { status: 500 });
  }
}
