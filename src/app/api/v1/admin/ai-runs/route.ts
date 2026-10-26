import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { AI_TOOLS } from "@/lib/ai/tools";
import { resolveToolRuntime } from "@/lib/ai/aiToolsConfig";

/**
 * GET /api/v1/admin/ai-runs — «تشغيلات الذكاء الاصطناعي» (AI wave 0, plan §5).
 *
 *   tools   every registered tool with its runtime mode and daily limit
 *           (platform_settings.ai_tools over the registry default) — the
 *           switches themselves are written through PATCH /api/v1/admin/settings
 *           (key ai_tools, settings.write);
 *   runs    the last 100 runs (?tool=, ?status= to filter) with who ran them,
 *           what was charged or refunded, the error code, tokens and time;
 *   charging  platform_settings.points_enforcement.
 *
 * Any staff role may read (requireStaff("read")). Service client: ai_runs has
 * no admin policy, and usage / model are not readable by sessions.
 */

export const dynamic = "force-dynamic";

const STATUSES = new Set(["running", "review", "succeeded", "failed"]);

export async function GET(request: NextRequest) {
  const gate = await requireStaff("read");
  if (!gate.ok) return gate.response;

  try {
    const admin = await createServiceClient();
    const { data: settings } = await admin
      .from("platform_settings")
      .select("key, value")
      .in("key", ["ai_tools", "points_enforcement"]);
    const byKey = new Map((settings ?? []).map((s: { key: string; value: unknown }) => [s.key, s.value]));
    const aiTools = byKey.get("ai_tools") ?? null;

    const tools = Object.values(AI_TOOLS).map((spec) => {
      const rt = resolveToolRuntime(spec, aiTools);
      return {
        id: spec.id,
        class: spec.class,
        tier: spec.tier,
        price: spec.price({}, { pages: null }),
        mode: rt.mode,
        dailyLimit: rt.dailyLimit,
        defaultMode: spec.defaultMode,
        defaultDailyLimit: spec.dailyLimit,
      };
    });

    let query = admin
      .from("ai_runs")
      .select(
        "id, user_id, tool, class, status, model, price_points, charged_points, charged, error_code, usage, progress_step, created_at, finished_at, refunded_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    const tool = request.nextUrl.searchParams.get("tool");
    if (tool && Object.prototype.hasOwnProperty.call(AI_TOOLS, tool)) query = query.eq("tool", tool);
    const status = request.nextUrl.searchParams.get("status");
    if (status && STATUSES.has(status)) query = query.eq("status", status);
    const { data: runs, error } = await query;
    if (error) {
      // Before 20261027_10 runs there is no table: show the tools, no runs.
      if (error.code === "42P01" || error.code === "PGRST205") {
        return NextResponse.json({ tools, runs: [], charging: byKey.get("points_enforcement") === true, schemaMissing: true });
      }
      console.error("[admin/ai-runs] read failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر تحميل التشغيلات" }, { status: 503 });
    }

    const ids = [...new Set((runs ?? []).map((r: { user_id: string }) => r.user_id))];
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profiles } = await admin.from("profiles").select("id, display_name, email").in("id", ids);
      for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>) {
        names.set(p.id, p.display_name || p.email || p.id.slice(0, 8));
      }
    }

    return NextResponse.json(
      {
        tools,
        charging: byKey.get("points_enforcement") === true,
        runs: (runs ?? []).map((r: { user_id: string; created_at: string; finished_at: string | null }) => ({
          ...r,
          user_name: names.get(r.user_id) ?? r.user_id.slice(0, 8),
          duration_ms: r.finished_at ? new Date(r.finished_at).getTime() - new Date(r.created_at).getTime() : null,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("[admin/ai-runs] threw:", err);
    return NextResponse.json({ error: "تعذّر تحميل التشغيلات" }, { status: 503 });
  }
}
