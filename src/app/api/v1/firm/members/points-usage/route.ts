import { NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { resolveCallerFirm } from "@/lib/auth/firmMembershipAccess";
import {
  canViewMemberPoints,
  memberPointsRpcOutcome,
  toMemberPointsUsage,
} from "@/lib/services/firmMemberPoints";

/**
 * GET /api/v1/firm/members/points-usage — owner answer ٤٤٤ part 2.
 *
 * Per ACTIVE member of the caller's firm: the points they consumed this Riyadh
 * month and since they joined. Visible to the firm owner or an active
 * managing partner only.
 *
 * ── WHY THE SESSION CLIENT, NOT THE SERVICE ROLE ────────────────────────────
 * The sums come from public.firm_member_points_usage (20261108_30), a SECURITY
 * DEFINER function that does its own owner / managing-partner check on
 * auth.uid(). Under the service role auth.uid() is null, so the check would
 * have to trust the firm id this route passes. Called with the cookie-scoped
 * client, the database itself refuses (42501) anyone else — the route's own
 * check below is the first gate, the function is the second.
 *
 * ── WHAT LEAVES ─────────────────────────────────────────────────────────────
 * Totals only: display name, firm role, owner flag, joined date and two
 * numbers. No user id, no e-mail, no tool, no run. A member's runs stay in
 * that member's own log (owner ٤٤٤ part 1).
 *
 * Responses:
 *   200 { available: true, members: MemberPointsUsage[] }
 *   200 { available: false, members: [] }   20261108_30 not applied yet
 *   403 not the owner / managing partner      404 no firm on this account
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { data: firm, error: firmError } = await resolveCallerFirm(supabase, user.id);
    if (firmError) {
      console.error("[firm/members/points-usage GET] firm lookup failed:", firmError.code);
      return NextResponse.json({ error: "تعذّر تحميل استهلاك النقاط." }, { status: 500, headers: NO_STORE });
    }
    if (!firm) {
      return NextResponse.json({ error: "لا يوجد مكتب مرتبط بهذا الحساب." }, { status: 404, headers: NO_STORE });
    }
    if (!canViewMemberPoints(firm)) {
      return NextResponse.json(
        { error: "هذا العدّاد للشريك المدير وحساب المكتب فقط." },
        { status: 403, headers: NO_STORE },
      );
    }

    const { data, error } = await supabase.rpc("firm_member_points_usage", { p_firm: firm.id });
    const outcome = memberPointsRpcOutcome(error);
    if (outcome === "unavailable") {
      return NextResponse.json({ available: false, members: [] }, { headers: NO_STORE });
    }
    if (outcome === "forbidden") {
      return NextResponse.json(
        { error: "هذا العدّاد للشريك المدير وحساب المكتب فقط." },
        { status: 403, headers: NO_STORE },
      );
    }
    if (outcome === "failed") {
      console.error("[firm/members/points-usage GET] rpc failed:", error?.code);
      return NextResponse.json({ error: "تعذّر تحميل استهلاك النقاط." }, { status: 500, headers: NO_STORE });
    }

    return NextResponse.json({ available: true, members: toMemberPointsUsage(data) }, { headers: NO_STORE });
  } catch (err) {
    console.error("[firm/members/points-usage GET] threw:", (err as { name?: string } | null)?.name ?? "error");
    return NextResponse.json({ error: "تعذّر تحميل استهلاك النقاط." }, { status: 500, headers: NO_STORE });
  }
}
