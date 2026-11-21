import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { MARKET_SQL_MISSING_AR, isMarketSqlMissing } from "@/lib/marketplace/marketSettings";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/v1/lawyer/market-requests/[id]/withdraw — the lawyer withdraws his
 * own pending ask (l12 Q130a). public.marketplace_acceptance_withdraw
 * (20261202_70) touches only his own row, and only while it is pending.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });

    const { data, error } = await auth.supabase.rpc("marketplace_acceptance_withdraw", { p_id: id });
    if (error) {
      if (isMarketSqlMissing(error.code)) return NextResponse.json({ error: MARKET_SQL_MISSING_AR }, { status: 503 });
      console.error("[lawyer/market-requests/withdraw] rpc failed:", error.code);
      return NextResponse.json({ error: "تعذّر السحب الآن." }, { status: 500 });
    }
    const result = (data as { result?: string } | null)?.result;
    if (result !== "withdrawn") {
      return NextResponse.json({ error: "لا يُسحب إلا طلب ما زال بانتظار الاعتماد." }, { status: 409 });
    }
    return NextResponse.json({ result, message: "سُحب طلبك." });
  } catch (err) {
    console.error("[lawyer/market-requests/withdraw] unexpected:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر السحب الآن." }, { status: 500 });
  }
}
