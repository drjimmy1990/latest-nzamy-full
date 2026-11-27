import { officePlanRefusal } from "@/lib/auth/assertOfficePlan";
import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import {
  EXPENSE_SELECT,
  LIST_PAGE_SIZE,
  parseExpenseCreate,
  parseListFilters,
  riyadhDay,
  toExpenseDto,
  type ExpenseRow,
} from "@/lib/financeLedger/financeLedgerRules";
import { errorResponse, labelRows, resolveRowFirm } from "../_financeLedger/server";

/**
 * /api/v1/lawyer/expenses — «المصروفات» (owner TODO F3/F4; public.lawyer_expenses,
 * 20261126_40). Same reader rule as the time entries (writer + firm finance
 * roles; restricted cases with their team). The receipt is uploaded after the
 * row exists: POST /api/v1/lawyer/expenses/[id]/receipt.
 *
 * GET  ?caseId=&clientId=&from=&to=&voided=1 → { data, truncated }
 * POST { caseRequestId?, lawyerClientId?, spentOn?, category, description,
 *        amountHalalas, billable? } → { data } (201)
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const f = parseListFilters((k) => request.nextUrl.searchParams.get(k));

    let query = supabase.from("lawyer_expenses").select(EXPENSE_SELECT);
    if (f.caseId) query = query.eq("case_request_id", f.caseId);
    if (f.clientId) query = query.eq("lawyer_client_id", f.clientId);
    if (f.from) query = query.gte("spent_on", f.from);
    if (f.to) query = query.lte("spent_on", f.to);
    if (!f.includeVoided) query = query.is("voided_at", null);
    const { data, error } = await query
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(LIST_PAGE_SIZE + 1);
    if (error) return errorResponse(error, "lawyer/expenses GET");
    const rows = ((data ?? []) as unknown as ExpenseRow[]).slice(0, LIST_PAGE_SIZE);
    const names = await labelRows(supabase, rows);
    return NextResponse.json({
      data: rows.map((r) => toExpenseDto(r, user.id, names(r))),
      truncated: (data ?? []).length > LIST_PAGE_SIZE,
    });
  } catch (err) {
    console.error("[lawyer/expenses GET] unexpected:", err);
    return NextResponse.json({ error: "تعذّر تحميل المصروفات." }, { status: 500 });
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

    const parsed = parseExpenseCreate(await request.json().catch(() => null), riyadhDay(Date.now()));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.value;

    const firm = await resolveRowFirm(supabase, input.caseRequestId, input.lawyerClientId);
    if (!firm.ok) return firm.response;

    const { data, error } = await supabase
      .from("lawyer_expenses")
      .insert({
        created_by: user.id,
        firm_id: firm.firmId,
        case_request_id: input.caseRequestId,
        lawyer_client_id: input.lawyerClientId,
        spent_on: input.spentOn,
        category: input.category,
        description: input.description,
        amount_halalas: input.amountHalalas,
        billable: input.billable,
      })
      .select(EXPENSE_SELECT)
      .single();
    if (error || !data) return errorResponse(error, "lawyer/expenses POST");
    const row = data as unknown as ExpenseRow;
    const names = await labelRows(supabase, [row]);
    return NextResponse.json({ data: toExpenseDto(row, user.id, names(row)) }, { status: 201 });
  } catch (err) {
    console.error("[lawyer/expenses POST] unexpected:", err);
    return NextResponse.json({ error: "تعذّر حفظ المصروف." }, { status: 500 });
  }
}
