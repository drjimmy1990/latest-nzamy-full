import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cronSecretMatches } from "@/lib/payments/fulfillDecision";

/**
 * POST /api/v1/cron/ai-sweep — the AI runs' clean-up (20261027_10; plan §1.2, §3).
 *
 *   (default)         ai_sweep_runs: every run still `running` past its
 *                     deadline fails as `timeout` and gets its points back.
 *                     Every 10 minutes.
 *   ?task=retention   ai_runs_retention: clears input / output older than 90
 *                     days, keeping the money facts (owner decision D6). Daily.
 *
 * ── AUTH — fails CLOSED, as the other crons ─────────────────────────────────
 * Header `x-cron-secret` must equal CRON_SECRET (cronSecretMatches).
 *
 * ── SCHEDULE (n8n) ──────────────────────────────────────────────────────────
 *   every 10 min → POST https://nezamy.sa/api/v1/cron/ai-sweep
 *   daily 03:30  → POST https://nezamy.sa/api/v1/cron/ai-sweep?task=retention
 *   header x-cron-secret: <CRON_SECRET>
 *
 * Before 20261027_10 runs the functions do not exist: 200 { skipped:
 * "schema_missing" }, never a 500.
 */

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const retention = request.nextUrl.searchParams.get("task") === "retention";
  const fn = retention ? "ai_runs_retention" : "ai_sweep_runs";
  const admin = await createServiceClient();
  const { data, error } = await admin.rpc(fn);
  if (error) {
    if (error.code === "42883" || error.code === "PGRST202") {
      return NextResponse.json({ ok: true, skipped: "schema_missing" });
    }
    console.error(`[cron/ai-sweep] ${fn} failed:`, error.code, error.message);
    return NextResponse.json({ error: `${fn} failed` }, { status: 500 });
  }
  const count = typeof data === "number" ? data : 0;
  if (count > 0) console.info(`[cron/ai-sweep] ${fn}:`, count);
  return NextResponse.json({ ok: true, task: retention ? "retention" : "sweep", count });
}
