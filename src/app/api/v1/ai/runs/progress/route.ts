import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { parseAfter, parseProgressKey, readProgressByKey } from "@/lib/ai/progressRead";

/**
 * GET /api/v1/ai/runs/progress?key=K&after=N — a run's progress while its POST is
 * still in flight, so the browser has no run id yet. The service client is needed
 * because idempotency_key is not granted to a session, and the lookup stays inside
 * the session user's own rows (src/lib/ai/progressRead.ts). This static segment
 * takes precedence over /runs/[id].
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, { error: "سجّل الدخول لعرض الطلب" });
    if (auth instanceof NextResponse) return auth;

    const key = parseProgressKey(request.nextUrl.searchParams.get("key"));
    if (!key) return NextResponse.json({ runId: null, status: null, events: [] }, { headers: NO_STORE });

    const admin = await createServiceClient();
    const after = parseAfter(request.nextUrl.searchParams.get("after"));
    const reply = await readProgressByKey(admin, auth.user.id, key, after);
    return NextResponse.json(reply.body, { status: reply.status, headers: NO_STORE });
  } catch (err) {
    console.error("[ai/runs/progress] threw:", (err as { name?: string } | null)?.name ?? "error");
    return NextResponse.json({ error: "تعذّر تحميل الطلب" }, { status: 503, headers: NO_STORE });
  }
}
