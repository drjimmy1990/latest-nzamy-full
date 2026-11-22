import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { toExtRunResponse, type ExtRunRow } from "@/lib/ext/extRuns";
import { extError, extJson, requireExtCaller } from "../../../_extAuth";

/**
 * GET /api/v1/ext/ai/runs/<id> — a run's status and result, for the token's own user only.
 * Read with the service role, so the row is filtered by user_id here by hand (no RLS on this
 * path); someone else's run, or none, is the same 404 so a run's existence is never revealed.
 * The reply is built field by field (toExtRunResponse): no input, no n8n id, no callback.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireExtCaller(request, "ai:run");
  if (caller instanceof NextResponse) return caller;
  const rid = caller.requestId;
  try {
    const { id } = await params;
    if (!UUID.test(id)) return extError(404, "not_found", "لم يُعثر على هذا التشغيل.", rid);
    const admin = await createServiceClient();
    const { data, error } = await admin
      .from("ai_runs")
      .select("id, tool, status, conversation_id, output, citations, error_code, progress_step, charged_points, refunded_at, created_at, finished_at")
      .eq("id", id)
      .eq("user_id", caller.userId)
      .maybeSingle();
    if (error) {
      console.error("[ext/ai/runs/:id] read failed:", error.code);
      return extError(503, "unavailable", "تعذّر تحميل التشغيل الآن — حاول بعد قليل.", rid);
    }
    if (!data) return extError(404, "not_found", "لم يُعثر على هذا التشغيل.", rid);
    // A stored "review" row (mode retired) stays held back: it reads as still running, output hidden.
    return extJson(200, toExtRunResponse(data as ExtRunRow, rid), rid);
  } catch (err) {
    console.error("[ext/ai/runs/:id] threw:", (err as { name?: string } | null)?.name ?? "error");
    return extError(503, "unavailable", "تعذّر تحميل التشغيل الآن — حاول بعد قليل.", rid);
  }
}
