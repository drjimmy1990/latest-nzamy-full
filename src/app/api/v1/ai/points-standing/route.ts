import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { isPointsStandingTool, pointsStandingWith } from "@/lib/ai/pointsStanding";

/**
 * GET /api/v1/ai/points-standing?tool=<id> — is the signed-in user short of
 * points for one run of this tool? `{ short: false }` or
 * `{ short: true, balance, price }`. Read-only.
 *
 * The «رصيدك من النقاط لا يكفي» banner reads this instead of
 * user_metadata.credit_balance (owner package LIVE-06). No other route gives
 * the balance together with the charge rule: /api/v1/billing has the balance
 * but not points_enforcement or the admin exemption, and the setting is not
 * the user's to read. The decision is src/lib/ai/pointsStanding.ts.
 *
 * /api/v1/ai/* gets no 401 from the proxy, so the sign-in check is here. The
 * proxy does rate-limit this GET, per IP (isPointsStandingRoute in
 * src/lib/rateLimitRoutes.ts).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, { error: "سجّل الدخول لاستخدام أدوات الذكاء الاصطناعي" });
    if (auth instanceof NextResponse) return auth;

    const tool = request.nextUrl.searchParams.get("tool");
    // Priced tools with no founder-credit path only (pointsStanding.ts).
    if (!isPointsStandingTool(tool)) {
      return NextResponse.json({ error: "أداة غير معروفة", code: "unknown_tool" }, { status: 400, headers: NO_STORE });
    }
    const admin = await createServiceClient();
    const standing = await pointsStandingWith(supabase, admin, auth.user.id, tool);
    return NextResponse.json(standing, { headers: NO_STORE });
  } catch (err) {
    console.error("[ai/points-standing] GET failed:", err);
    // No banner rather than a wrong one.
    return NextResponse.json({ short: false }, { headers: NO_STORE });
  }
}
