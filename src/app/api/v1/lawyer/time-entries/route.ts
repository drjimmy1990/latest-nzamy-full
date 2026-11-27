import { officePlanRefusal } from "@/lib/auth/assertOfficePlan";
import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import {
  LIST_PAGE_SIZE,
  TIME_SELECT,
  parseListFilters,
  parseTimeCreate,
  riyadhDay,
  toTimeDto,
  type TimeRow,
} from "@/lib/financeLedger/financeLedgerRules";
import { errorResponse, labelRows, resolveRowFirm } from "../_financeLedger/server";

/**
 * /api/v1/lawyer/time-entries — «الوقت» (owner TODO F3/F4; public.time_entries,
 * 20261126_40). Session client only: RLS returns the caller's own entries and,
 * to the firm owner / managing partner / partner / finance manager, the
 * firm's; restricted cases stay with their team.
 *
 * GET  ?caseId=&clientId=&from=YYYY-MM-DD&to=YYYY-MM-DD&voided=1
 *      → { data, truncated } newest first (voided only with voided=1).
 * POST { caseRequestId? , lawyerClientId?, workDate?, durationMin, description,
 *        hourlyRateHalalas?, billable?, workSessionId? } → { data } (201)
 *      workSessionId: a pomodoro session of the CALLER (public.work_sessions)
 *      this entry is made from — one live entry per session.
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const f = parseListFilters((k) => request.nextUrl.searchParams.get(k));

    let query = supabase.from("time_entries").select(TIME_SELECT);
    if (f.caseId) query = query.eq("case_request_id", f.caseId);
    if (f.clientId) query = query.eq("lawyer_client_id", f.clientId);
    if (f.from) query = query.gte("work_date", f.from);
    if (f.to) query = query.lte("work_date", f.to);
    if (!f.includeVoided) query = query.is("voided_at", null);
    const { data, error } = await query
      .order("work_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(LIST_PAGE_SIZE + 1);
    if (error) return errorResponse(error, "lawyer/time-entries GET");
    const rows = ((data ?? []) as unknown as TimeRow[]).slice(0, LIST_PAGE_SIZE);
    const names = await labelRows(supabase, rows);
    return NextResponse.json({
      data: rows.map((r) => toTimeDto(r, user.id, names(r))),
      truncated: (data ?? []).length > LIST_PAGE_SIZE,
    });
  } catch (err) {
    console.error("[lawyer/time-entries GET] unexpected:", err);
    return NextResponse.json({ error: "تعذّر تحميل سجل الوقت." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    // Owner ق٢٦-٤ / ق٢٦-٥: «finance» is «إدارة المكتب» — refused on the free side.
    const officeLocked = await officePlanRefusal(auth.supabase, "finance", auth.userType);
    if (officeLocked) return officeLocked;
    const { user, supabase } = auth;

    const parsed = parseTimeCreate(await request.json().catch(() => null), riyadhDay(Date.now()));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.value;

    const firm = await resolveRowFirm(supabase, input.caseRequestId, input.lawyerClientId);
    if (!firm.ok) return firm.response;

    // The pomodoro session must be the caller's own (work_sessions RLS:
    // user_id = auth.uid()), so nobody blocks a colleague's session.
    if (input.workSessionId) {
      const { data: ws, error: wsError } = await supabase
        .from("work_sessions")
        .select("id")
        .eq("id", input.workSessionId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (wsError) return errorResponse(wsError, "lawyer/time-entries POST session");
      if (!ws) return NextResponse.json({ error: "جلسة العمل غير موجودة." }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("time_entries")
      .insert({
        created_by: user.id,
        firm_id: firm.firmId,
        case_request_id: input.caseRequestId,
        lawyer_client_id: input.lawyerClientId,
        work_date: input.workDate,
        duration_min: input.durationMin,
        description: input.description,
        hourly_rate_halalas: input.hourlyRateHalalas,
        billable: input.billable,
        work_session_id: input.workSessionId,
      })
      .select(TIME_SELECT)
      .single();
    if (error || !data) return errorResponse(error, "lawyer/time-entries POST");
    const row = data as unknown as TimeRow;
    const names = await labelRows(supabase, [row]);
    return NextResponse.json({ data: toTimeDto(row, user.id, names(row)) }, { status: 201 });
  } catch (err) {
    console.error("[lawyer/time-entries POST] unexpected:", err);
    return NextResponse.json({ error: "تعذّر حفظ قيد الوقت." }, { status: 500 });
  }
}
