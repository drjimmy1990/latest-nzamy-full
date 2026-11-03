import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { staffMaySeeRunOutput } from "@/lib/ai/runVisibility";

/**
 * GET /api/v1/admin/ai-runs/<id> — one run of any user, for triaging the
 * "review" rows left from the retired review mode (charged, hidden from their
 * owner; Wave 1 Task 3, R4) before a manual refund.
 *
 * settings.write only (super_admin): operations and auditor get 403, so no
 * read-only role ever sees another user's output. The answer is the metadata
 * the list shows; output and citations are added only for a review row
 * (runVisibility.staffMaySeeRunOutput). Service client: ai_runs has no admin
 * policy. The staff identity is the verified session's (requireStaff).
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const META_COLUMNS =
  "id, user_id, tool, class, status, model, price_points, charged_points, charged, error_code, usage, progress_step, created_at, finished_at, refunded_at";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff("settings.write");
  if (!gate.ok) return gate.response;

  try {
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: "غير موجود" }, { status: 404, headers: NO_STORE });

    const admin = await createServiceClient();
    const { data, error } = await admin
      .from("ai_runs")
      .select(`${META_COLUMNS}, output, citations`)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("[admin/ai-runs/:id] read failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر تحميل التشغيل" }, { status: 503, headers: NO_STORE });
    }
    if (!data) return NextResponse.json({ error: "غير موجود" }, { status: 404, headers: NO_STORE });

    const { output, citations, ...meta } = data as Record<string, unknown> & { output: unknown; citations: unknown };
    const run = staffMaySeeRunOutput(meta.status, gate.role) ? { ...meta, output, citations } : meta;
    return NextResponse.json({ run }, { headers: NO_STORE });
  } catch (err) {
    console.error("[admin/ai-runs/:id] threw:", err);
    return NextResponse.json({ error: "تعذّر تحميل التشغيل" }, { status: 503, headers: NO_STORE });
  }
}
