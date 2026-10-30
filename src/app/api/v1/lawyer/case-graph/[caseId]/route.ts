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
    // "corporate" is the ONLY user_type routeAccess.ts lets into
    // /dashboard/business, and that dashboard's case file mounts this same
    // graph. Without it here every corporate user got a 403 on load and the
    // canvas sat at «تعذّرت القراءة — الحفظ متوقّف» for its one intended
    // audience. RLS is unchanged: the owner arm of can_access_case_row already
    // admits a corporate user to rows they wrote themselves.
    const auth = await assertRole(["lawyer", "firm", "corporate"]);
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
 *
 * CODE-F24 — a version check (compare-and-set) on `updated_at`. The client
 * sends `baseUpdatedAt`, the version it last read or wrote:
 * - `null`   → it saw no saved board: INSERT; a row that appeared meanwhile
 *              (23505) is a 409, not an overwrite;
 * - a string → UPDATE only if the row is still at that version; otherwise
 *              409 «graph_conflict», and the board asks the lawyer;
 * - absent   → a page still running the old script: the old unconditional
 *              upsert, so a deploy does not break an open tab.
 * The UPDATE no longer rewrites `owner_user_id`/`firm_id` (the old upsert
 * made whichever colleague saved last the row's owner of record), and
 * `updated_at` comes from the column default / trigger, read back with
 * `.select` and returned as `updatedAt` — the client's next base.
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    // "corporate" is the ONLY user_type routeAccess.ts lets into
    // /dashboard/business, and that dashboard's case file mounts this same
    // graph. Without it here every corporate user got a 403 on load and the
    // canvas sat at «تعذّرت القراءة — الحفظ متوقّف» for its one intended
    // audience. RLS is unchanged: the owner arm of can_access_case_row already
    // admits a corporate user to rows they wrote themselves.
    const auth = await assertRole(["lawyer", "firm", "corporate"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { caseId } = await context.params;

    if (!caseId) {
      return NextResponse.json({ error: "caseId required" }, { status: 400 });
    }

    const body = await request.json();
    const { nodes, edges, viewport, baseUpdatedAt } = body as {
      nodes?: unknown;
      edges?: unknown;
      viewport?: unknown;
      baseUpdatedAt?: unknown;
    };

    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      return NextResponse.json({ error: "nodes and edges must both be arrays" }, { status: 400 });
    }
    if (baseUpdatedAt !== undefined && baseUpdatedAt !== null && typeof baseUpdatedAt !== "string") {
      return NextResponse.json({ error: "baseUpdatedAt must be a string or null" }, { status: 400 });
    }
    const vp = viewport && typeof viewport === "object" ? viewport : {};
    const conflict = () => NextResponse.json(
      { error: "تغيّرت اللوحة المحفوظة منذ آخر قراءة لها — من زميل أو من نافذة أخرى.", code: "graph_conflict" },
      { status: 409 },
    );

    if (typeof baseUpdatedAt === "string") {
      const { data: updated, error: updateError } = await supabase
        .from("case_graphs")
        .update({ nodes, edges, viewport: vp, updated_by: user.id })
        .eq("case_request_id", caseId)
        .eq("updated_at", baseUpdatedAt)
        .select("updated_at");
      if (updateError) {
        console.error("[case-graph PUT] update failed:", updateError.message, updateError.code);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      if (!updated || updated.length === 0) {
        // No row at that version: moved on (conflict), or not visible to this
        // user at all (gone / no access) — say which.
        const { data: exists } = await supabase
          .from("case_graphs")
          .select("case_request_id")
          .eq("case_request_id", caseId)
          .maybeSingle();
        if (!exists) return NextResponse.json({ error: "لا توجد لوحة محفوظة لهذه القضية يمكنك تعديلها." }, { status: 404 });
        return conflict();
      }
      return NextResponse.json({ success: true, updatedAt: (updated[0] as { updated_at: string }).updated_at });
    }

    // Solo lawyer → no firm row → firm_id stays null, same reasoning as
    // hearings/tasks POST.
    const { data: membership, error: membershipError } = await supabase
      .from("firm_members")
      .select("firm_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError) {
      console.error("[lawyer/case-graph POST] firm_members lookup failed:", membershipError.message, membershipError.code);
    }

    const row = {
      case_request_id: caseId,
      owner_user_id: user.id,
      firm_id: membership?.firm_id ?? null,
      nodes,
      edges,
      viewport: vp,
      updated_by: user.id,
    };

    if (baseUpdatedAt === null) {
      const { data: inserted, error: insertError } = await supabase
        .from("case_graphs")
        .insert(row)
        .select("updated_at")
        .single();
      if (insertError) {
        if (insertError.code === "23505") return conflict();
        console.error("[case-graph PUT] insert failed:", insertError.message, insertError.code);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, updatedAt: (inserted as { updated_at: string }).updated_at });
    }

    // Legacy (no baseUpdatedAt): the pre-CODE-F24 unconditional write.
    const { error } = await supabase
      .from("case_graphs")
      .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "case_request_id" });

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
