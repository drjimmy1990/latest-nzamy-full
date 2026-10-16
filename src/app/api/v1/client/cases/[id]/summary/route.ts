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
 *      `service_requests`, and the route then keeps only the CLIENT side of
 *      what RLS admitted: the requester, or an active member of the company the
 *      case was filed under (business_id; `is_active_business_member`, the
 *      same helper as the 20260914 policy). The table's other SELECT arms — the
 *      assignee, the assignee's firm, and the verified-lawyer marketplace
 *      browse of unassigned requests (service_requests_select_policy) — have
 *      their own lawyer screens and get nothing here. Every refusal is the same
 *      404 as a missing case.
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
    const { user, supabase } = auth;

    const { id } = await context.params;
    if (!CASE_ID_RE.test(id)) return NextResponse.json({ error: AR.notFound }, { status: 404 });

    // Step 1 — RLS decides whether this caller may see this case at all…
    const { data: caseRow, error: caseErr } = await supabase
      .from("service_requests")
      .select("id, requester_user_id, business_id")
      .eq("id", id)
      .maybeSingle();
    if (caseErr) {
      console.error("[client/cases summary] case read failed:", caseErr.message, caseErr.code);
      return NextResponse.json({ error: AR.readFailed }, { status: 500 });
    }
    if (!caseRow) return NextResponse.json({ error: AR.notFound }, { status: 404 });

    // …and only the client side of it may use this projection.
    let isClientSide = caseRow.requester_user_id === user.id;
    if (!isClientSide && caseRow.business_id) {
      const { data: member, error: memberErr } = await supabase.rpc("is_active_business_member", {
        p_business: caseRow.business_id,
      });
      if (memberErr) {
        console.error("[client/cases summary] membership check failed:", memberErr.message, memberErr.code);
        return NextResponse.json({ error: AR.readFailed }, { status: 500 });
      }
      isClientSide = member === true;
    }
    if (!isClientSide) return NextResponse.json({ error: AR.notFound }, { status: 404 });

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
