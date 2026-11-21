import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { recordNotification } from "@/lib/notify";
import {
  INTERMEDIARY_NOTICE_AR,
  MARKET_SQL_MISSING_AR,
  acceptResultReply,
  isMarketSqlMissing,
} from "@/lib/marketplace/marketSettings";
import { notifyMarketStaff, readMarketSettings } from "@/lib/marketplace/marketSettingsServer";

/**
 * POST /api/v1/lawyer/open-requests/[id]/accept — «اطلب القبول» on a market
 * request (owner answers of 20 Nov: Q130a, Q151 open → a setting).
 *
 * The decision is the database's: public.marketplace_request_accept (20261202_70)
 * runs with the caller's own session, checks that he is a verified lawyer and
 * not a test account, and that the request is still in the market.
 *   admin_approval (default, RAW[66]) → a pending ask with a deadline; the
 *     staff are alerted now, and again when the deadline passes (cron). The
 *     lawyer is NEVER accepted automatically.
 *   instant (Q151) → assigned at once by one atomic UPDATE; the client is told.
 * The request's status is never changed (the client's WhatsApp webhook keys
 * off status). Payment through the platform stays off.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase, user } = auth;

    const { id } = await params;
    if (typeof id !== "string" || id.length === 0 || id.length > 100) {
      return NextResponse.json({ error: "معرّف الطلب غير صالح" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("marketplace_request_accept", { p_request_id: id });
    if (error) {
      if (isMarketSqlMissing(error.code)) return NextResponse.json({ error: MARKET_SQL_MISSING_AR }, { status: 503 });
      console.error("[lawyer/open-requests/accept] rpc failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر إرسال طلبك الآن. حاول مجدداً." }, { status: 500 });
    }
    const reply = (data ?? {}) as { result?: string; id?: string; due_at?: string };

    const admin = await createServiceClient();
    const { settings } = await readMarketSettings(admin);
    const answer = acceptResultReply(reply.result, settings.approvalMinutes);

    if (reply.result === "pending") {
      await notifyMarketStaff(
        admin,
        "طلب قبول جديد من سوق الطلبات",
        `محامٍ موثَّق يطلب قبول الطلب ${id}. يُعتمد أو يُرفض من صفحة «طلبات السوق»، ولا يُقبل تلقائياً.`,
      );
    } else if (reply.result === "assigned" && reply.id) {
      // Instant mode: tell the staff and the client (never the lawyer's contact data).
      await notifyMarketStaff(admin, "أُسند طلب من السوق فورياً", `أُسند الطلب ${id} إلى محامٍ موثَّق بالقبول الفوري.`);
      const { data: order } = await admin
        .from("service_requests")
        .select("requester_user_id, assigned_to")
        .eq("id", id)
        .maybeSingle();
      const o = order as { requester_user_id?: string | null; assigned_to?: string | null } | null;
      if (o?.requester_user_id && o.assigned_to === user.id) {
        await recordNotification({
          userId: o.requester_user_id,
          title: "أُسند طلبك إلى محامٍ موثَّق",
          body: `أُسند طلبك إلى محامٍ موثَّق عبر سوق الطلبات. ${INTERMEDIARY_NOTICE_AR}`,
          href: `/ai/orders/${id}`,
        });
      }
    }

    return NextResponse.json(
      { result: reply.result ?? null, id: reply.id ?? null, dueAt: reply.due_at ?? null, message: answer.message },
      { status: answer.status },
    );
  } catch (err) {
    console.error("[lawyer/open-requests/accept] unexpected:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر إرسال طلبك الآن. حاول مجدداً." }, { status: 500 });
  }
}
