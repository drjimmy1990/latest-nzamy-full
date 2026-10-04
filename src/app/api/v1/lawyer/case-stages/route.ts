import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { degreeFromDb } from "@/lib/services/caseStageVocabulary";
import { parseCaseIdsParam, pickLatestStagePerCase } from "@/lib/caseStageBuckets";

/**
 * GET /api/v1/lawyer/case-stages — the LATEST `case_stages` row of each case,
 * in bulk (T28-29a, the cases page's «المرحلة المسجّلة» bar).
 *
 * Sibling of ./[caseId]/route.ts, which reads/writes ONE case's full stage
 * list; this one answers "which degree is each of these cases at" in a single
 * round trip instead of one request per case.
 *
 * Query:  ?caseIds=a,b,c   optional; at most CASE_STAGES_BULK_MAX_IDS (100) —
 *                          more is a 400. Absent → every case the caller can
 *                          read (up to ROW_CAP stage rows; `truncated` says
 *                          when that cap cut the read short).
 * 200:    { data: [{ caseId, stageId, degree, outcome, stageDate, closedOn }],
 *           total, truncated }
 *         `degree` is the Arabic UiDegree (ابتدائي/استئناف/نقض/تنفيذ), same as
 *         the per-case DTO; `stageDate` is the stage's `opened_on` (null when
 *         not recorded). A case with no stage row is simply absent from `data`.
 *
 * Reads through the caller's RLS cookie client: `case_stages` SELECT is
 * `can_access_case_row(owner_user_id, firm_id) or is_admin()`
 * (20260903_phase1_case_tables.sql), so a lawyer only ever sees rows they own
 * or share a firm with — naming someone else's case id returns nothing for it.
 * "Latest" = highest `position` (the per-case POST assigns max+1), then latest
 * `opened_on`, then latest `created_at` — computed in pickLatestStagePerCase so
 * row order from the database does not matter.
 */

const ROW_CAP = 1000;

interface BulkStageRow {
  id: string;
  case_request_id: string;
  degree: string;
  outcome: string | null;
  opened_on: string | null;
  closed_on: string | null;
  position: number | null;
  created_at: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const parsed = parseCaseIdsParam(request.nextUrl.searchParams.get("caseIds"));
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    if (parsed.ids !== null && parsed.ids.length === 0) {
      return NextResponse.json({ data: [], total: 0, truncated: false });
    }

    let query = supabase
      .from("case_stages")
      .select("id, case_request_id, degree, outcome, opened_on, closed_on, position, created_at", { count: "exact" })
      .order("case_request_id", { ascending: true })
      .order("position", { ascending: false })
      .limit(ROW_CAP);
    if (parsed.ids !== null) query = query.in("case_request_id", parsed.ids);

    const { data, error, count } = await query;
    if (error) {
      console.error("[lawyer/case-stages bulk GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر قراءة مراحل القضايا." }, { status: 500 });
    }

    const rows = (data ?? []) as BulkStageRow[];
    const latest = pickLatestStagePerCase(rows);
    const items = [...latest.values()].map((row) => ({
      caseId: row.case_request_id,
      stageId: row.id,
      degree: degreeFromDb(row.degree),
      outcome: row.outcome,
      stageDate: row.opened_on,
      closedOn: row.closed_on,
    }));

    return NextResponse.json({
      data: items,
      total: items.length,
      truncated: (count ?? rows.length) > rows.length,
    });
  } catch (err) {
    console.error("[lawyer/case-stages bulk GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع أثناء قراءة مراحل القضايا." }, { status: 500 });
  }
}
