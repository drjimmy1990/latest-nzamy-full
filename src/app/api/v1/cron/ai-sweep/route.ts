import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cronSecretMatches } from "@/lib/payments/fulfillDecision";
import { runAiSweep } from "@/lib/ai/aiSweep";

/**
 * POST /api/v1/cron/ai-sweep — the AI runs' clean-up (20261027_10; plan §1.2, §3).
 *
 *   (default)         ai_sweep_runs: every run still `running` past its
 *                     deadline fails as `timeout` and gets its points back.
 *                     Every 10 minutes.
 *   ?task=retention   ai_runs_retention: clears input / output older than 90
 *                     days, keeping the money facts (owner decision D6). Then
 *                     progress_events_prune: events older than 7 days
 *                     (20261103_31). Daily.
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
 * "schema_missing" }, never a 500. The same holds for the prune before
 * 20261103_31 (src/lib/ai/aiSweep.ts).
 */

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const retention = request.nextUrl.searchParams.get("task") === "retention";
  const admin = await createServiceClient();
  const reply = await runAiSweep(admin, retention);
  return NextResponse.json(reply.body, { status: reply.status });
}
