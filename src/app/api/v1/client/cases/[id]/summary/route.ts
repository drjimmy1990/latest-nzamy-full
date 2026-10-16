import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { riyadhToday } from "@/lib/riyadhToday";
import {
  CLIENT_HEARING_COLUMNS,
  CLIENT_STAGE_COLUMNS,
  CLIENT_VISIBLE_HEARING_KINDS,
  buildClientCaseSummary,
  type ClientHearingRow,
  type ClientStageRow,
} from "@/lib/clientCaseSummary";

/**
 * GET /api/v1/client/cases/[id]/summary — owner decisions ١٥ and ١٩: the
 * client (an individual, or a company's members) sees the case's current
 * degree, the next hearing and the final ruling, and nothing of the team's
 * internal work.
 *
 * TWO STEPS, IN THIS ORDER
 *   1. Access — the caller's OWN RLS-scoped client reads the case row from
 *      `service_requests`. That table's SELECT policies decide: the requester,
 *      an active member of the company the case was filed under (20260914), the
 *      assigned lawyer and their firm, an admin. Zero rows answers 404, the
 *      same body whether the case does not exist or is not theirs.
 *   2. Projection — only then, the service client reads `hearings` and
 *      `case_stages` for THAT case id, naming the fixed column lists in
 *      src/lib/clientCaseSummary.ts and filtering hearing kinds to the two a
 *      client is shown. `notes`, `minutes`, `judge_name`, `circuit`,
 *      `court_case_no`, `metadata` and the hearing title are never selected,
 *      so they cannot reach the response whatever a screen does with it.
 *      `case_notes` / `consultation_notes` are not read at all.
 *
 * The client still has no PostgREST path to any of those tables (their RLS is
 * lawyer/firm/admin), so this route is the only way in, and it is narrow.
 */

const AR = {
  notFound: "لم يتم العثور على القضية.",
  readFailed: "تعذّر قراءة ملخص القضية. حاول مرة أخرى.",
} as const;

const CASE_ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { supabase } = auth;

    const { id } = await context.params;
    if (!CASE_ID_RE.test(id)) return NextResponse.json({ error: AR.notFound }, { status: 404 });

    // Step 1 — RLS decides whether this caller may see this case at all.
    const { data: caseRow, error: caseErr } = await supabase
      .from("service_requests")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (caseErr) {
      console.error("[client/cases summary] case read failed:", caseErr.message, caseErr.code);
      return NextResponse.json({ error: AR.readFailed }, { status: 500 });
    }
    if (!caseRow) return NextResponse.json({ error: AR.notFound }, { status: 404 });

    // Step 2 — the fixed projection, for exactly the case RLS just admitted.
    const service = await createServiceClient();
    const [hearingsRes, stagesRes] = await Promise.all([
      service
        .from("hearings")
        .select(CLIENT_HEARING_COLUMNS)
        .eq("case_request_id", id)
        .in("kind", [...CLIENT_VISIBLE_HEARING_KINDS])
        .order("hearing_date", { ascending: true })
        .limit(200),
      service
        .from("case_stages")
        .select(CLIENT_STAGE_COLUMNS)
        .eq("case_request_id", id)
        .limit(50),
    ]);

    if (hearingsRes.error || stagesRes.error) {
      const e = hearingsRes.error ?? stagesRes.error;
      console.error("[client/cases summary] projection read failed:", e?.message, e?.code);
      return NextResponse.json({ error: AR.readFailed }, { status: 500 });
    }

    const summary = buildClientCaseSummary(
      (hearingsRes.data ?? []) as ClientHearingRow[],
      (stagesRes.data ?? []) as ClientStageRow[],
      riyadhToday(),
    );
    return NextResponse.json({ data: summary });
  } catch (err) {
    console.error("[client/cases summary] Unexpected error:", err);
    return NextResponse.json({ error: AR.readFailed }, { status: 500 });
  }
}
