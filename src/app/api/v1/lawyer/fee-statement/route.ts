import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import {
  EXPENSE_SELECT,
  LIST_PAGE_SIZE,
  TIME_SELECT,
  buildFeeStatement,
  parseListFilters,
  toExpenseDto,
  toTimeDto,
  type ExpenseRow,
  type TimeRow,
} from "@/lib/financeLedger/financeLedgerRules";
import { errorResponse, labelRows } from "../_financeLedger/server";

/**
 * GET /api/v1/lawyer/fee-statement?caseId=…|clientId=…&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * «بيان أتعاب» (owner TODO F3/F4): the billable, live, not-yet-billed time
 * entries and expenses of ONE case or ONE client card for a period, priced,
 * with what was left out counted (voided / not billable / already billed).
 * Built from the rows RLS lets the caller read — a lawyer gets his own
 * entries, a firm finance role the firm's (restricted cases with their team);
 * `scope` says which, so the printed statement never pretends to be more.
 *
 * → { data: { subject, statement, scope, truncated, invoiceClientId } }
 *   invoiceClientId: the client card «تحويل إلى فاتورة» bills — the one asked
 *   for, else the case's own card (service_requests.lawyer_client_id), else null.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const f = parseListFilters((k) => request.nextUrl.searchParams.get(k));
    if (!f.caseId && !f.clientId) {
      return NextResponse.json({ error: "اختر القضية أو الموكل لإعداد بيان الأتعاب." }, { status: 400 });
    }
    if (f.from && f.to && f.from > f.to) {
      return NextResponse.json({ error: "بداية الفترة بعد نهايتها." }, { status: 400 });
    }

    // The subject, read through RLS (an unreadable case/card → 404).
    let caseTitle: string | null = null;
    let caseClientId: string | null = null;
    if (f.caseId) {
      const { data, error } = await supabase
        .from("service_requests")
        .select("id, title, lawyer_client_id")
        .eq("id", f.caseId)
        .maybeSingle();
      if (error) return errorResponse(error, "lawyer/fee-statement case");
      if (!data) return NextResponse.json({ error: "القضية غير موجودة أو لا تملك صلاحية الوصول إليها." }, { status: 404 });
      const c = data as { title: string | null; lawyer_client_id: string | null };
      caseTitle = c.title ?? null;
      caseClientId = c.lawyer_client_id ?? null;
    }
    const clientId = f.clientId ?? caseClientId;
    let clientName: string | null = null;
    if (clientId) {
      const { data, error } = await supabase.from("lawyer_clients").select("id, name").eq("id", clientId).maybeSingle();
      if (error) return errorResponse(error, "lawyer/fee-statement client");
      if (!data && f.clientId) {
        return NextResponse.json({ error: "الموكل غير موجود أو لا تملك صلاحية الوصول إليه." }, { status: 404 });
      }
      clientName = (data as { name: string | null } | null)?.name ?? null;
    }

    let tq = supabase.from("time_entries").select(TIME_SELECT);
    let eq = supabase.from("lawyer_expenses").select(EXPENSE_SELECT);
    if (f.caseId) { tq = tq.eq("case_request_id", f.caseId); eq = eq.eq("case_request_id", f.caseId); }
    if (f.clientId) { tq = tq.eq("lawyer_client_id", f.clientId); eq = eq.eq("lawyer_client_id", f.clientId); }
    if (f.from) { tq = tq.gte("work_date", f.from); eq = eq.gte("spent_on", f.from); }
    if (f.to) { tq = tq.lte("work_date", f.to); eq = eq.lte("spent_on", f.to); }
    const [tr, er] = await Promise.all([
      tq.order("work_date", { ascending: true }).limit(LIST_PAGE_SIZE + 1),
      eq.order("spent_on", { ascending: true }).limit(LIST_PAGE_SIZE + 1),
    ]);
    if (tr.error) return errorResponse(tr.error, "lawyer/fee-statement time");
    if (er.error) return errorResponse(er.error, "lawyer/fee-statement expenses");
    const timeRows = ((tr.data ?? []) as unknown as TimeRow[]).slice(0, LIST_PAGE_SIZE);
    const expenseRows = ((er.data ?? []) as unknown as ExpenseRow[]).slice(0, LIST_PAGE_SIZE);
    const names = await labelRows(supabase, [...timeRows, ...expenseRows]);
    const statement = buildFeeStatement(
      timeRows.map((r) => toTimeDto(r, user.id, names(r))),
      expenseRows.map((r) => toExpenseDto(r, user.id, names(r))),
      f.from,
      f.to,
    );
    const othersIncluded = [...timeRows, ...expenseRows].some((r) => r.created_by !== user.id);

    return NextResponse.json({
      data: {
        subject: { caseId: f.caseId, caseTitle, clientId, clientName },
        statement,
        scope: othersIncluded ? "firm" : "own",
        truncated: (tr.data ?? []).length > LIST_PAGE_SIZE || (er.data ?? []).length > LIST_PAGE_SIZE,
        invoiceClientId: clientId,
      },
    });
  } catch (err) {
    console.error("[lawyer/fee-statement GET] unexpected:", err);
    return NextResponse.json({ error: "تعذّر إعداد بيان الأتعاب." }, { status: 500 });
  }
}
