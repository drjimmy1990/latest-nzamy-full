import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { MARKET_SQL_MISSING_AR, isMarketSqlMissing } from "@/lib/marketplace/marketSettings";
import { toOpenRequestItem } from "@/lib/services/openRequestsView";

/**
 * GET /api/v1/admin/marketplace/requests — what verified lawyers see in the
 * market right now (l12 Q130a), with the title (staff only), whether staff
 * published it, and how many asks wait on it.
 * public.marketplace_open_requests_admin (20261202_70, service role) uses the
 * same predicate as the lawyers' list. orders.manage.
 */
export async function GET() {
  try {
    const gate = await requireStaff("orders.manage");
    if (!gate.ok) return gate.response;
    const admin = await createServiceClient();
    const { data, error } = await admin.rpc("marketplace_open_requests_admin", { p_limit: 200, p_offset: 0 });
    if (error) {
      if (isMarketSqlMissing(error.code)) return NextResponse.json({ installed: false, data: [], message: MARKET_SQL_MISSING_AR });
      console.error("[admin/marketplace/requests] rpc failed:", error.code);
      return NextResponse.json({ error: "تعذّر تحميل طلبات السوق." }, { status: 500 });
    }
    const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
    return NextResponse.json({
      installed: true,
      data: rows.map((r) => ({
        ...toOpenRequestItem(r),
        title: typeof r.title === "string" ? r.title : "",
        published: r.published === true,
        pendingAsks: typeof r.pending_asks === "number" ? r.pending_asks : 0,
      })),
    });
  } catch (err) {
    console.error("[admin/marketplace/requests] unexpected:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر تحميل طلبات السوق." }, { status: 500 });
  }
}
