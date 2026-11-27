import { officePlanRefusal } from "@/lib/auth/assertOfficePlan";
import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { EXPENSE_SELECT, parseExpensePatch, riyadhDay, toExpenseDto, type ExpenseRow } from "@/lib/financeLedger/financeLedgerRules";
import { UUID_RE, errorResponse, labelRows } from "../../_financeLedger/server";

/**
 * PATCH /api/v1/lawyer/expenses/[id]
 *   { void: true, reason }  — the writer or a firm finance role.
 *   { spentOn?, category?, description?, amountHalalas?, billable? } — the
 *                             writer, while neither voided nor billed.
 * No DELETE (void with a reason instead).
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    // Owner ق٢٦-٤ / ق٢٦-٥: «finance» is «إدارة المكتب» — refused on the free side.
    const officeLocked = await officePlanRefusal(auth.supabase, "finance", auth.userType);
    if (officeLocked) return officeLocked;
    const { user, supabase } = auth;
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "المصروف غير موجود." }, { status: 404 });

    const parsed = parseExpensePatch(await request.json().catch(() => null), riyadhDay(Date.now()));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const patch = parsed.value.kind === "void"
      ? { voided_at: new Date().toISOString(), void_reason: parsed.value.reason }
      : parsed.value.row;

    const { data, error } = await supabase
      .from("lawyer_expenses")
      .update(patch)
      .eq("id", id)
      .select(EXPENSE_SELECT)
      .maybeSingle();
    if (error) return errorResponse(error, "lawyer/expenses PATCH");
    if (!data) return NextResponse.json({ error: "المصروف غير موجود أو لا تملك تعديله." }, { status: 404 });
    const row = data as unknown as ExpenseRow;
    const names = await labelRows(supabase, [row]);
    return NextResponse.json({ data: toExpenseDto(row, user.id, names(row)) });
  } catch (err) {
    console.error("[lawyer/expenses PATCH] unexpected:", err);
    return NextResponse.json({ error: "تعذّر تعديل المصروف." }, { status: 500 });
  }
}
