import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cronSecretMatches } from "@/lib/payments/fulfillDecision";
import { isMarketSqlMissing } from "@/lib/marketplace/marketSettings";
import { notifyMarketStaff } from "@/lib/marketplace/marketSettingsServer";

/**
 * POST /api/v1/cron/marketplace-acceptance-alerts — RAW[66]: «فإن انتهت [مهلة
 * الاعتماد] دون ردّ تُرسل الإدارة تنبيهاً ولا يُقبل المحامي تلقائياً».
 *
 * public.marketplace_overdue_acceptances(true) (20261202_70) stamps alerted_at
 * on every pending ask past its deadline that was not alerted yet and returns
 * exactly those, so each ask alerts the staff once, however often this runs.
 * Nothing is accepted: the ask stays pending until a staff member decides.
 * The admin market page also shows every overdue ask in red without this.
 *
 * AUTH — fails closed: header `x-cron-secret` must equal CRON_SECRET.
 * SCHEDULE (an ops step — not created by this batch):
 *   n8n: Schedule Trigger every 5 minutes → HTTP Request POST
 *        https://nezamy.sa/api/v1/cron/marketplace-acceptance-alerts  header x-cron-secret: <CRON_SECRET>
 * Before 20261202_70 runs: 200 {skipped: "schema_missing"}, nothing sent.
 */
export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const admin = await createServiceClient();
    const { data, error } = await admin.rpc("marketplace_overdue_acceptances", { p_mark: true });
    if (error) {
      if (isMarketSqlMissing(error.code)) return NextResponse.json({ skipped: "schema_missing" });
      console.error("[cron/marketplace-acceptance-alerts] rpc failed:", error.code);
      return NextResponse.json({ error: "rpc_failed" }, { status: 500 });
    }
    const rows = (Array.isArray(data) ? data : []) as Array<{ request_id?: string }>;
    if (rows.length === 0) return NextResponse.json({ alerted: 0, recipients: 0 });
    const ids = [...new Set(rows.map((r) => r.request_id).filter((v): v is string => typeof v === "string"))];
    const recipients = await notifyMarketStaff(
      admin,
      "انتهت مهلة اعتماد قبول من السوق",
      `${rows.length === 1 ? "طلب قبول واحد" : `${rows.length} طلبات قبول`} تجاوزت مهلة الاعتماد دون قرار (${ids.slice(0, 5).join("، ")}${ids.length > 5 ? "…" : ""}). لا يُقبل أي محامٍ تلقائياً؛ القرار للإدارة.`,
    );
    return NextResponse.json({ alerted: rows.length, recipients });
  } catch (err) {
    console.error("[cron/marketplace-acceptance-alerts] unexpected:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "unexpected" }, { status: 500 });
  }
}
