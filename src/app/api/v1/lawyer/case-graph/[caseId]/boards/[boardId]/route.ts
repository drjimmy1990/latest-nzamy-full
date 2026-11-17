import { NextResponse, NextRequest } from "next/server";
import { DB_ERROR_AR } from "@/lib/api/dbError";
import { assertRole } from "@/lib/auth/assertRole";
import { BOARD_FULL_SELECT, boardWriteError, checkBoardName, isBoardId } from "../_boards";

/**
 * /api/v1/lawyer/case-graph/[caseId]/boards/[boardId] — one named board
 * (P1-32, public.canvas_boards). RLS decides every read and write; see
 * ../route.ts.
 *
 * GET    → { data: { id, name, nodes, edges, viewport, updatedAt } } | 404
 * PUT    { nodes, edges, viewport, baseUpdatedAt } → { success, updatedAt }.
 *        Compare-and-set on updated_at, exactly as the default board
 *        (CODE-F24): the board exists from its POST, so a save is always an
 *        UPDATE at the version the page last read; 409 graph_conflict otherwise.
 * PATCH  { name } → rename.
 * DELETE → the owner only (RLS); 404 for anyone else.
 */

type Ctx = { params: Promise<{ caseId: string; boardId: string }> };

async function open(context: Ctx) {
  const auth = await assertRole(["lawyer", "firm", "corporate"]);
  if (!auth.ok) return { response: auth.response } as const;
  const { caseId, boardId } = await context.params;
  if (!caseId || !isBoardId(boardId)) {
    return { response: NextResponse.json({ error: "لوحة غير صالحة" }, { status: 400 }) } as const;
  }
  return { auth, caseId, boardId } as const;
}

const NOT_FOUND = () => NextResponse.json({ error: "اللوحة غير موجودة أو لا تملك الوصول إليها" }, { status: 404 });

export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const o = await open(context);
    if ("response" in o) return o.response;
    const { data, error } = await o.auth.supabase
      .from("canvas_boards")
      .select(BOARD_FULL_SELECT)
      .eq("id", o.boardId)
      .eq("case_request_id", o.caseId)
      .maybeSingle();
    if (error) {
      console.error("[case-graph board GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    }
    if (!data) return NOT_FOUND();
    const row = data as { id: string; name: string; nodes: unknown; edges: unknown; viewport: unknown; updated_at: string };
    return NextResponse.json({ data: { id: row.id, name: row.name, nodes: row.nodes, edges: row.edges, viewport: row.viewport, updatedAt: row.updated_at } });
  } catch (err) {
    console.error("[case-graph board GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: Ctx) {
  try {
    const o = await open(context);
    if ("response" in o) return o.response;
    const { user, supabase } = o.auth;
    const body = (await request.json().catch(() => null)) as { nodes?: unknown; edges?: unknown; viewport?: unknown; baseUpdatedAt?: unknown } | null;
    if (!body || !Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
      return NextResponse.json({ error: "nodes and edges must both be arrays" }, { status: 400 });
    }
    if (typeof body.baseUpdatedAt !== "string") {
      return NextResponse.json({ error: "baseUpdatedAt is required" }, { status: 400 });
    }
    const viewport = body.viewport && typeof body.viewport === "object" && !Array.isArray(body.viewport) ? body.viewport : {};
    const { data: updated, error } = await supabase
      .from("canvas_boards")
      .update({ nodes: body.nodes, edges: body.edges, viewport, updated_by: user.id })
      .eq("id", o.boardId)
      .eq("case_request_id", o.caseId)
      .eq("updated_at", body.baseUpdatedAt)
      .select("updated_at");
    if (error) {
      console.error("[case-graph board PUT] update failed:", error.message, error.code);
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      const { data: exists } = await supabase.from("canvas_boards").select("id").eq("id", o.boardId).eq("case_request_id", o.caseId).maybeSingle();
      if (!exists) return NOT_FOUND();
      return NextResponse.json(
        { error: "تغيّرت اللوحة المحفوظة منذ آخر قراءة لها — من زميل أو من نافذة أخرى.", code: "graph_conflict" },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: true, updatedAt: (updated[0] as { updated_at: string }).updated_at });
  } catch (err) {
    console.error("[case-graph board PUT] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const o = await open(context);
    if ("response" in o) return o.response;
    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const checked = checkBoardName(body?.name);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    const { data, error } = await o.auth.supabase
      .from("canvas_boards")
      .update({ name: checked.name, updated_by: o.auth.user.id })
      .eq("id", o.boardId)
      .eq("case_request_id", o.caseId)
      .select("id, name, updated_at");
    if (error) {
      const mapped = boardWriteError(error);
      if (mapped.status === 500) console.error("[case-graph board PATCH] update failed:", error.message, error.code);
      return NextResponse.json({ error: mapped.error || DB_ERROR_AR, code: mapped.code }, { status: mapped.status });
    }
    if (!data || data.length === 0) return NOT_FOUND();
    const row = data[0] as { id: string; name: string; updated_at: string };
    return NextResponse.json({ data: { id: row.id, name: row.name, updatedAt: row.updated_at } });
  } catch (err) {
    console.error("[case-graph board PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: Ctx) {
  try {
    const o = await open(context);
    if ("response" in o) return o.response;
    const { data, error } = await o.auth.supabase
      .from("canvas_boards")
      .delete()
      .eq("id", o.boardId)
      .eq("case_request_id", o.caseId)
      .select("id");
    if (error) {
      console.error("[case-graph board DELETE] failed:", error.message, error.code);
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    }
    // RLS: only the owner deletes; a colleague's DELETE matches no row.
    if (!data || data.length === 0) return NextResponse.json({ error: "يحذف اللوحة منشئها فقط" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[case-graph board DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
