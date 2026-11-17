import { NextResponse, NextRequest } from "next/server";
import { DB_ERROR_AR } from "@/lib/api/dbError";
import { assertRole } from "@/lib/auth/assertRole";
import { BOARD_SELECT, boardWriteError, checkBoardName, toBoardDto, type BoardRow } from "./_boards";

/**
 * /api/v1/lawyer/case-graph/[caseId]/boards — P1-32 named boards of a case map
 * (public.canvas_boards, 20261126_70). The case's default board stays at
 * /api/v1/lawyer/case-graph/[caseId] (public.case_graphs).
 *
 * Every query runs on the caller's RLS client: a board is read by its owner
 * and his active firm colleagues (can_access_case_row), hidden on a
 * restricted case from anyone off its team (case_visible), and written with
 * the caller's own firm only (can_write_firm_row). Same roles as the default
 * board (corporate included: /dashboard/business mounts the same map).
 *
 * GET  → { data: [{ id, name, updatedAt, createdAt, isOwn }] } oldest first.
 * POST { name } → 201 { data: board } — an empty board; 409 board_name_taken
 *      or board_limit (20 per case).
 */

export async function GET(_request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm", "corporate"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { caseId } = await context.params;
    if (!caseId) return NextResponse.json({ error: "caseId required" }, { status: 400 });

    const { data, error } = await supabase
      .from("canvas_boards")
      .select(BOARD_SELECT)
      .eq("case_request_id", caseId)
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) {
      console.error("[case-graph boards GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    }
    return NextResponse.json({ data: ((data ?? []) as BoardRow[]).map((r) => toBoardDto(r, user.id)) });
  } catch (err) {
    console.error("[case-graph boards GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm", "corporate"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { caseId } = await context.params;
    if (!caseId) return NextResponse.json({ error: "caseId required" }, { status: 400 });

    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const checked = checkBoardName(body?.name);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

    // The caller must be able to read the case itself (RLS on service_requests).
    const { data: kase, error: caseError } = await supabase.from("service_requests").select("id").eq("id", caseId).maybeSingle();
    if (caseError) {
      console.error("[case-graph boards POST] case read failed:", caseError.message, caseError.code);
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    }
    if (!kase) return NextResponse.json({ error: "القضية غير موجودة أو لا تملك الوصول إليها" }, { status: 404 });

    // Same firm rule as the default board: the caller's active firm, or none.
    const { data: membership } = await supabase
      .from("firm_members")
      .select("firm_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("canvas_boards")
      .insert({
        case_request_id: caseId,
        owner_user_id: user.id,
        firm_id: (membership as { firm_id?: string } | null)?.firm_id ?? null,
        name: checked.name,
        updated_by: user.id,
      })
      .select(BOARD_SELECT)
      .single();
    if (error) {
      const mapped = boardWriteError(error);
      if (mapped.status === 500) console.error("[case-graph boards POST] insert failed:", error.message, error.code);
      return NextResponse.json({ error: mapped.error || DB_ERROR_AR, code: mapped.code }, { status: mapped.status });
    }
    return NextResponse.json({ data: toBoardDto(data as BoardRow, user.id) }, { status: 201 });
  } catch (err) {
    console.error("[case-graph boards POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
