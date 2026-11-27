import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import { isPointsAvailableTool, isPointsStandingTool, standingFrom, toolPointsWith } from "@/lib/ai/pointsStanding";
import { planAllowanceKindFor, planAllowanceStateWith } from "@/lib/ai/planAllowance";

/**
 * GET /api/v1/ai/points-standing?tool=<id> — the signed-in user's points for
 * one run of this tool. Read-only.
 *   { short: false } or { short: true, balance, price }   — the «رصيدك من
 *     النقاط لا يكفي» banner (owner package LIVE-06), for the tools with no
 *     founder-credit path only (pointsStanding.ts);
 *   + { charged, available }   — owner ١٦٥ (batch l13): «المتاح لهذه العملية»
 *     beside the price: charged false when this run charges no points (an
 *     admin, or charging off); available = the points this tool may spend now
 *     (library-assistant points only count for the library assistant), null
 *     when unread. Absent when the profile or the setting could not be read.
 *
 * No other route gives the points together with the charge rule:
 * /api/v1/billing has the balance but not points_enforcement or the admin
 * exemption, and the setting is not the user's to read.
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
    // Every priced tool whose price a screen shows (pointsStanding.ts).
    if (!isPointsAvailableTool(tool)) {
      return NextResponse.json({ error: "أداة غير معروفة", code: "unknown_tool" }, { status: 400, headers: NO_STORE });
    }
    const admin = await createServiceClient();
    const points = await toolPointsWith(supabase, admin, auth.user.id, tool);
    // The shortfall banner only for the tools it knows (no founder credit).
    const standing = isPointsStandingTool(tool) ? standingFrom(points, tool) : { short: false };
    // Owner ق٢٦-٦ (batch l19): an individual ind-ai subscriber's fair use of
    // this month on a counted tool (quick-answer / simple-contract), so the
    // screen says «بقي لك X من Y» instead of a points shortfall. Only what the
    // counter answered (left / used); nothing on a degraded read.
    const kind = points?.charged ? planAllowanceKindFor(tool) : null;
    let planAllowance: { kind: string; left: number; limit: number } | undefined;
    if (kind) {
      const { data: profile } = await supabase.from("profiles").select("user_type").eq("id", auth.user.id).maybeSingle();
      if (profile?.user_type === "individual") {
        const state = await planAllowanceStateWith(admin, auth.user.id, kind);
        if (state.state === "left") planAllowance = { kind, left: state.left, limit: state.limit };
        if (state.state === "used") planAllowance = { kind, left: 0, limit: state.limit };
      }
    }
    return NextResponse.json(
      points
        ? {
            ...standing,
            // a run inside the allowance charges nothing: never a shortfall
            ...(planAllowance && planAllowance.left > 0 ? { short: false } : {}),
            charged: points.charged,
            available: points.available,
            ...(planAllowance ? { planAllowance } : {}),
          }
        : standing,
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[ai/points-standing] GET failed:", err);
    // No banner rather than a wrong one.
    return NextResponse.json({ short: false }, { headers: NO_STORE });
  }
}
