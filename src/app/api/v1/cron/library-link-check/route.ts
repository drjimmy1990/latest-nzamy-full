import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cronSecretMatches } from "@/lib/payments/fulfillDecision";
import { LINK_CHECK_SAMPLE, linkCheckAlertText, shouldAlertLinkCheck } from "@/lib/library/linkCheck";

/**
 * POST /api/v1/cron/library-link-check — the daily broken-reference check of
 * the library's links (owner file 10 ب34; batch l12, 20261202_30).
 *
 * graph_rag_link_check_run(): re-points the owner's links by their stable ids
 * (the owner-edges resolver), then stores one row with the graph nodes that
 * carry reader links while their library row (or document) is gone. When the
 * count is above zero and higher than the last check, every admin gets one
 * notification (library_monitor_notify_admins, 20261031_10). Nothing is
 * deleted or rewritten here: the reader already shows such a link as its
 * document (or drops it), and the next graph pass rebuilds the automatic links.
 *
 * ── AUTH — fails CLOSED, as the other crons ─────────────────────────────────
 * Header `x-cron-secret` must equal CRON_SECRET (cronSecretMatches).
 *
 * ── SCHEDULE (n8n, to be added live) ────────────────────────────────────────
 *   daily 04:10 (after the graph watchdog's night pass)
 *     → POST https://nezamy.sa/api/v1/cron/library-link-check
 *   header x-cron-secret: <CRON_SECRET>
 *
 * Before 20261202_30 runs: 200 { skipped: "schema_missing" }, never a 500.
 */

export const dynamic = "force-dynamic";

function missing(code: string | null | undefined): boolean {
  return code === "PGRST202" || code === "42883" || code === "42P01";
}

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = await createServiceClient();
  const { data, error } = await admin.rpc("graph_rag_link_check_run", { p_sample: LINK_CHECK_SAMPLE });
  if (error) {
    if (missing(error.code)) return NextResponse.json({ skipped: "schema_missing" });
    console.error("[cron/library-link-check] failed:", error.code ?? "no-code", error.message);
    return NextResponse.json({ error: "link_check_failed" }, { status: 500 });
  }
  const r = (data ?? {}) as { broken?: unknown; previous_broken?: unknown; by_reason?: unknown; owner_edges?: unknown };
  const broken = typeof r.broken === "number" ? r.broken : 0;
  const previous = typeof r.previous_broken === "number" ? r.previous_broken : null;
  let alerted = false;
  if (shouldAlertLinkCheck(broken, previous)) {
    const n = linkCheckAlertText(broken);
    const { error: notifyError } = await admin.rpc("library_monitor_notify_admins", { p_title: n.title, p_body: n.body, p_href: n.href });
    if (notifyError) console.error("[cron/library-link-check] notify failed:", notifyError.code ?? "no-code");
    else alerted = true;
  }
  return NextResponse.json({ ok: true, broken, previous, alerted, by_reason: r.by_reason ?? {}, owner_edges: r.owner_edges ?? {} });
}
