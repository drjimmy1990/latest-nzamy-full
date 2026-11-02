import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { runForViewer } from "@/lib/ai/aiToolsConfig";

/**
 * GET /api/v1/ai/runs/<id> — one run of the signed-in user (the job tools'
 * poll): status, the step n8n reported, the output and citations once it
 * succeeded, and what was charged. Read through RLS, which shows a user only
 * their own rows and never input / usage / model / source_ids (20261027_10).
 * Someone else's run, or no run, is 404.
 *
 * A "review" row (stored before review mode was retired; Wave 3 releases or
 * refunds them) keeps its output from its owner, never from an admin.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether the signed-in viewer is a platform admin, read only when a stored
 * "review" row needs it. Fails closed: an unread profile is not an admin.
 */
async function viewerIsAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("profiles").select("user_type").eq("id", userId).maybeSingle();
  return !error && data?.user_type === "admin";
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: "غير موجود" }, { status: 404, headers: NO_STORE });

    const supabase = await createClient();
    const auth = await requireApiUser(supabase, { error: "سجّل الدخول لعرض الطلب" });
    if (auth instanceof NextResponse) return auth;

    const { data, error } = await supabase
      .from("ai_runs")
      .select(
        "id, tool, variant, class, status, price_points, charged_points, charged, output, citations, error_code, progress_step, created_at, finished_at, refunded_at",
      )
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) {
      console.error("[ai/runs/:id] read failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر تحميل الطلب" }, { status: 503, headers: NO_STORE });
    }
    if (!data) return NextResponse.json({ error: "غير موجود" }, { status: 404, headers: NO_STORE });
    const run = data.status === "review" ? runForViewer(data, await viewerIsAdmin(supabase, auth.user.id)) : data;
    return NextResponse.json({ run }, { headers: NO_STORE });
  } catch (err) {
    console.error("[ai/runs/:id] threw:", err);
    return NextResponse.json({ error: "تعذّر تحميل الطلب" }, { status: 503, headers: NO_STORE });
  }
}
