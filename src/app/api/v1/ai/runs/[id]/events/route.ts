import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { parseAfter, readProgressById } from "@/lib/ai/progressRead";

/**
 * GET /api/v1/ai/runs/<id>/events?after=N — one run's progress for its owner:
 * { status, step, events: [{ id, kind, label }], final }. Read through RLS.
 * Someone else's run, or no run, is 404 (src/lib/ai/progressRead.ts).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: "غير موجود" }, { status: 404, headers: NO_STORE });

    const supabase = await createClient();
    const auth = await requireApiUser(supabase, { error: "سجّل الدخول لعرض الطلب" });
    if (auth instanceof NextResponse) return auth;

    const after = parseAfter(request.nextUrl.searchParams.get("after"));
    const reply = await readProgressById(supabase, auth.user.id, id, after);
    return NextResponse.json(reply.body, { status: reply.status, headers: NO_STORE });
  } catch (err) {
    console.error("[ai/runs/:id/events] threw:", (err as { name?: string } | null)?.name ?? "error");
    return NextResponse.json({ error: "تعذّر تحميل الطلب" }, { status: 503, headers: NO_STORE });
  }
}
