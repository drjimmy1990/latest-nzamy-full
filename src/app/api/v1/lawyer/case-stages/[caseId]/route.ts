import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { recordActivity, RequestEvent } from "@/lib/events";
import {
  type UiDegree, VALID_UI_DEGREES, degreeToDb, degreeFromDb,
} from "@/lib/services/caseStageVocabulary";

/**
 * /api/v1/lawyer/case-stages/[caseId] — Phase 1 (خطة_البناء_الكاملة §5), the
 * last of the five surfaces.
 *
 * Backed by `public.case_stages` (migration 20260903_phase1_case_tables.sql).
 * A case has no record today of which court DEGREE (ابتدائي/استئناف/نقض/تنفيذ)
 * it is currently at — one status field covers the whole lifetime of a case,
 * so a lawyer arguing an appeal and a lawyer still at first instance look
 * identical in the data. This route is the one place that gets read and
 * written now.
 *
 * NOT to be confused with two same-sounding, unrelated things already in the
 * codebase: `Case.degree` in `src/constants/lawyerCasesData.ts` (a single
 * heuristic — primary/labor/criminal/admin/appeal/supreme — guessed from the
 * free-text court name, used only to group the case LIST page into Kanban
 * columns) and `CASE_STAGES` in `lawyer/cases/[id]/page.tsx` (a 4-step
 * تقديم/قيد التداول/مراجعة/إغلاق workflow-progress bar derived from `status`).
 * Neither reads or writes `public.case_stages`; this route touches neither.
 *
 * caseId in the path is `case_request_id` (service_requests.id, text) — the
 * same anchor hearings/tasks/activity_events/case_graphs already use, because
 * `public.cases` has zero writers (verified this wave).
 */

interface StageRow {
  id: string;
  case_request_id: string;
  degree: string;
  court_name: string;
  court_case_no: string | null;
  circuit: string | null;
  judge_name: string | null;
  opened_on: string | null;
  closed_on: string | null;
  outcome: string | null;
  position: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

function toDto(row: StageRow) {
  return {
    id: row.id,
    caseRequestId: row.case_request_id,
    degree: degreeFromDb(row.degree),
    courtName: row.court_name || undefined,
    courtCaseNo: row.court_case_no || undefined,
    circuit: row.circuit || undefined,
    judgeName: row.judge_name || undefined,
    openedOn: row.opened_on,
    closedOn: row.closed_on,
    outcome: row.outcome,
    position: row.position,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const STAGE_SELECT =
  "id, case_request_id, degree, court_name, court_case_no, circuit, judge_name, opened_on, closed_on, outcome, position, notes, created_at, updated_at";

/**
 * GET /api/v1/lawyer/case-stages/[caseId]
 * Ordered by `position` then `opened_on` — a stage opened without a date yet
 * (still being filed) still needs a stable place in the list, which
 * `opened_on` alone (nulls first/last either way) can't give it.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { caseId } = await context.params;

    const { data, error, count } = await supabase
      .from("case_stages")
      .select(STAGE_SELECT, { count: "exact" })
      .eq("case_request_id", caseId)
      .order("position", { ascending: true })
      .order("opened_on", { ascending: true, nullsFirst: false });

    if (error) {
      console.error("[lawyer/case-stages GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as StageRow[];
    return NextResponse.json({ data: rows.map(toDto), total: count ?? rows.length });
  } catch (err) {
    console.error("[lawyer/case-stages GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/v1/lawyer/case-stages/[caseId]
 * Body: { degree, courtName?, courtCaseNo?, circuit?, judgeName?, openedOn?, notes? }
 *
 * `position` is assigned server-side as "one past the current max" for this
 * case — the UI never sends it, matching how AddTaskModal never sends
 * subtask ordering; a drag-to-reorder PATCH can be added later without this
 * route changing shape.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { caseId } = await context.params;

    const body = await request.json();
    const {
      degree, courtName, courtCaseNo, circuit, judgeName, openedOn, notes,
    } = body as {
      degree?: string; courtName?: string; courtCaseNo?: string;
      circuit?: string; judgeName?: string; openedOn?: string; notes?: string;
    };

    if (!degree || !(VALID_UI_DEGREES as readonly string[]).includes(degree)) {
      return NextResponse.json({ error: `degree must be one of: ${VALID_UI_DEGREES.join(", ")}` }, { status: 400 });
    }
    if (openedOn && !/^\d{4}-\d{2}-\d{2}$/.test(openedOn)) {
      return NextResponse.json({ error: "openedOn must be YYYY-MM-DD" }, { status: 400 });
    }

    const { data: caseRow, error: caseError } = await supabase
      .from("service_requests")
      .select("id")
      .eq("id", caseId)
      .maybeSingle();
    if (caseError || !caseRow) {
      return NextResponse.json({ error: "case not found" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("firm_members")
      .select("firm_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    const { data: maxPos } = await supabase
      .from("case_stages")
      .select("position")
      .eq("case_request_id", caseId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPosition = (maxPos?.position ?? -1) + 1;

    const { data, error } = await supabase
      .from("case_stages")
      .insert({
        case_request_id: caseId,
        firm_id: membership?.firm_id ?? null,
        owner_user_id: user.id,
        degree: degreeToDb(degree as UiDegree),
        court_name: courtName?.trim() || "",
        court_case_no: courtCaseNo?.trim() || null,
        circuit: circuit?.trim() || null,
        judge_name: judgeName?.trim() || null,
        opened_on: openedOn || null,
        notes: notes?.trim() || "",
        position: nextPosition,
      })
      .select(STAGE_SELECT)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Insert failed" }, { status: 500 });
    }

    await recordActivity({
      supabase,
      kind: RequestEvent.CASE_STAGE_ADDED,
      ownerUserId: user.id,
      firmId: membership?.firm_id ?? null,
      actorUserId: user.id,
      caseRequestId: caseId,
      subjectTable: "case_stages",
      subjectId: data.id,
      payload: { degree },
    });

    return NextResponse.json({ data: toDto(data as StageRow) });
  } catch (err) {
    console.error("[lawyer/case-stages POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/v1/lawyer/case-stages/[caseId]
 * Body: { id, outcome?, closedOn?, notes? } — recording how a degree ended.
 * Only these three columns are patchable; degree/court identity is fixed at
 * creation (fixing a typo means deleting and re-adding, same as hearings has
 * no correction path today — not built because nothing has asked for it yet).
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { caseId } = await context.params;

    const body = await request.json();
    const { id, outcome, closedOn, notes } = body as {
      id?: string; outcome?: string; closedOn?: string | null; notes?: string;
    };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const VALID_OUTCOMES = new Set(["pending", "won", "lost", "partial", "settled", "withdrawn"]);
    const patch: Record<string, unknown> = {};
    if (outcome !== undefined) {
      if (!VALID_OUTCOMES.has(outcome)) {
        return NextResponse.json({ error: `outcome must be one of: ${[...VALID_OUTCOMES].join(", ")}` }, { status: 400 });
      }
      patch.outcome = outcome;
    }
    if (closedOn !== undefined) {
      if (closedOn && !/^\d{4}-\d{2}-\d{2}$/.test(closedOn)) {
        return NextResponse.json({ error: "closedOn must be YYYY-MM-DD" }, { status: 400 });
      }
      patch.closed_on = closedOn || null;
    }
    if (notes !== undefined) patch.notes = notes.trim();

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("case_stages")
      .update(patch)
      .eq("id", id)
      .eq("case_request_id", caseId)
      .select(STAGE_SELECT)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Update failed" }, { status: 500 });
    }

    if (outcome !== undefined) {
      const { data: membership } = await supabase
        .from("firm_members")
        .select("firm_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      await recordActivity({
        supabase,
        kind: RequestEvent.CASE_STAGE_OUTCOME_RECORDED,
        ownerUserId: user.id,
        firmId: membership?.firm_id ?? null,
        actorUserId: user.id,
        caseRequestId: caseId,
        subjectTable: "case_stages",
        subjectId: id,
        payload: { outcome },
      });
    }

    return NextResponse.json({ data: toDto(data as StageRow) });
  } catch (err) {
    console.error("[lawyer/case-stages PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
