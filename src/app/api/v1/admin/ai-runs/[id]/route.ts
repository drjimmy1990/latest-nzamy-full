import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { staffMaySeeRunOutput } from "@/lib/ai/runVisibility";
import { isTestAccountUser } from "@/lib/testAccounts/isTestAccount";

/**
 * GET /api/v1/admin/ai-runs/<id> — one run of any user, as staff may see it.
 *
 * settings.write only (super_admin): operations and auditor get 403. The
 * answer is the metadata the list shows (tool, status, points, error code,
 * times). Owner file 03 ل11 (batch l12): a user's questions and answers are
 * his alone, so the output and citations are read — and returned — ONLY when
 * the run belongs to a test account (runVisibility.staffMaySeeRunOutput,
 * testAccounts/isTestAccount.ts). For any other run the output is never even
 * selected. The input (the question) is never returned here. Service client:
 * ai_runs has no admin policy. The staff identity is the verified session's
 * (requireStaff).
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
    const { data, error } = await admin.from("ai_runs").select(META_COLUMNS).eq("id", id).maybeSingle();
    if (error) {
      console.error("[admin/ai-runs/:id] read failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر تحميل التشغيل" }, { status: 503, headers: NO_STORE });
    }
    if (!data) return NextResponse.json({ error: "غير موجود" }, { status: 404, headers: NO_STORE });

    const meta = data as unknown as Record<string, unknown> & { user_id: string };
    const ownerIsTest = typeof meta.user_id === "string" ? await isTestAccountUser(admin, meta.user_id) : null;
    if (!staffMaySeeRunOutput(gate.role, ownerIsTest)) {
      return NextResponse.json({ run: meta, outputHidden: true }, { headers: NO_STORE });
    }
    const { data: body, error: bodyError } = await admin.from("ai_runs").select("output, citations").eq("id", id).maybeSingle();
    if (bodyError) {
      console.error("[admin/ai-runs/:id] output read failed:", bodyError.code, bodyError.message);
      return NextResponse.json({ run: meta, outputHidden: true }, { headers: NO_STORE });
    }
    return NextResponse.json({ run: { ...meta, ...((body as Record<string, unknown> | null) ?? {}) } }, { headers: NO_STORE });
  } catch (err) {
    console.error("[admin/ai-runs/:id] threw:", err);
    return NextResponse.json({ error: "تعذّر تحميل التشغيل" }, { status: 503, headers: NO_STORE });
  }
}
