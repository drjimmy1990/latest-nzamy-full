import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";

/**
 * /api/v1/lawyer/case-graph/[caseId] — Phase 1, step 4 (خطة_البناء_الكاملة §5).
 *
 * Backed by `public.case_graphs` (migration 20260903_phase1_case_tables.sql):
 * one row per case, primary-keyed on `case_request_id`. Before this table,
 * `CaseGraphView` (src/app/dashboard/business/kanban/CaseGraphView.tsx) held
 * its nodes/edges in `useState` only — its own toolbar chip said so outright:
 * «غير محفوظة … أي تعديل يزول عند مغادرة الصفحة أو الانتقال لتبويب آخر».
 *
 * `caseId` here is a `service_requests.id` — cases have not moved off that
 * table in Phase 1 (see the migration's own note on why: `public.cases` has
 * zero writers across the whole repo). Ownership of the graph is NOT the same
 * as ownership of the case: `can_access_case_row` (owner or active firm
 * member) governs the graph row, independent of whatever the case row's own
 * access rules are — a graph is a workspace artifact, not case data.
 */

interface CaseGraphRow {
  case_request_id: string;
  nodes: unknown;
  edges: unknown;
  viewport: unknown;
  updated_at: string;
}

const GRAPH_SELECT = "case_request_id, nodes, edges, viewport, updated_at";

/**
 * GET — returns `{ data: null }` for a case with no saved graph yet (a real,
 * common state — not an error), or `{ data: { nodes, edges, viewport,
 * updatedAt } }`.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { caseId } = await context.params;

    if (!caseId) {
      return NextResponse.json({ error: "caseId required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("case_graphs")
      .select(GRAPH_SELECT)
      .eq("case_request_id", caseId)
      .maybeSingle();

    if (error) {
      console.error("[case-graph GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ data: null });
    }

    const row = data as CaseGraphRow;
    return NextResponse.json({
      data: {
        nodes: row.nodes,
        edges: row.edges,
        viewport: row.viewport,
        updatedAt: row.updated_at,
      },
    });
  } catch (err) {
    console.error("[case-graph GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT — full replace of this case's saved graph (autosaved by the client on a
 * debounce, not per-keystroke). Body: `{ nodes, edges, viewport }`.
 *
 * `upsert` on the primary key: the first save for a case INSERTs (governed by
 * "case graph insertable by owner" — the saving user becomes `owner_user_id`
 * of record), every save after that UPDATEs (governed by "…updatable by owner
 * or firm", so any active firm colleague can keep saving the same row).
 * `nodes`/`edges`/`viewport` are stored as the client sends them — this route
 * does not validate node/edge shape beyond "is an array/object", because the
 * canvas is exactly as free-form as the lawyer's own diagram, not a
 * structured record with rules to enforce.
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { caseId } = await context.params;

    if (!caseId) {
      return NextResponse.json({ error: "caseId required" }, { status: 400 });
    }

    const body = await request.json();
    const { nodes, edges, viewport } = body as {
      nodes?: unknown;
      edges?: unknown;
      viewport?: unknown;
    };

    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      return NextResponse.json({ error: "nodes and edges must both be arrays" }, { status: 400 });
    }

    // Solo lawyer → no firm row → firm_id stays null, same reasoning as
    // hearings/tasks POST.
    const { data: membership } = await supabase
      .from("firm_members")
      .select("firm_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    const { error } = await supabase
      .from("case_graphs")
      .upsert(
        {
          case_request_id: caseId,
          owner_user_id: user.id,
          firm_id: membership?.firm_id ?? null,
          nodes,
          edges,
          viewport: viewport && typeof viewport === "object" ? viewport : {},
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "case_request_id" },
      );

    if (error) {
      console.error("[case-graph PUT] upsert failed:", error.message, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[case-graph PUT] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
