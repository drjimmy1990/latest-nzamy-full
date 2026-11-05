import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { getAiTool } from "@/lib/ai/tools";
import { toolStatusWith } from "@/lib/ai/toolStatus";

/**
 * GET /api/v1/ai/tool-status?tool=<id> — may the signed-in caller run this tool
 * now? `{ usable: boolean }`, nothing else. Read-only.
 *
 * A page learned that a tool is off only from a failed run. The contract screens
 * must show a price only once the tool can be used (q296). The decision is the run
 * path's own (src/lib/ai/toolStatus.ts, aiToolsConfig.ts).
 *
 * /api/v1/ai/* gets no 401 from the proxy, so the sign-in check is here, before the
 * id is looked at: a visitor learns nothing. The proxy rate-limits this GET per IP
 * (isPointsStandingRoute in src/lib/rateLimitRoutes.ts).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, { error: "سجّل الدخول لاستخدام أدوات الذكاء الاصطناعي" });
    if (auth instanceof NextResponse) return auth;

    const spec = getAiTool(request.nextUrl.searchParams.get("tool"));
    if (!spec) {
      return NextResponse.json({ error: "أداة غير معروفة", code: "unknown_tool" }, { status: 400, headers: NO_STORE });
    }
    const admin = await createServiceClient();
    return NextResponse.json(await toolStatusWith(supabase, admin, auth.user.id, spec), { headers: NO_STORE });
  } catch (err) {
    console.error("[ai/tool-status] GET failed:", err);
    return NextResponse.json({ usable: false }, { headers: NO_STORE });
  }
}
