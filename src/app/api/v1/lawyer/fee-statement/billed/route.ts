import { officePlanRefusal } from "@/lib/auth/assertOfficePlan";
import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { requireVerifiedProvider } from "@/lib/auth/verifiedProviderServer";
import { parseMarkBilled } from "@/lib/financeLedger/financeLedgerRules";
import { errorResponse } from "../../_financeLedger/server";

/**
 * POST /api/v1/lawyer/fee-statement/billed  { paymentId, timeIds?, expenseIds? }
 *
 * After «تحويل إلى فاتورة» issued the invoice through the EXISTING invoice
 * call (POST /api/v1/lawyer/finance — this batch does not touch it), the rows
 * of the statement are stamped with that invoice: they leave every later
 * statement and freeze (the guard trigger refuses edits to a billed row).
 *
 * The invoice must be one the caller can read as its issuer (payments RLS
 * "invoice owner reads own invoices", 20261124_40). Only live, unbilled rows
 * the caller may update (writer / firm finance) are stamped; the answer says
 * how many, so a partial stamp is visible.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    // Owner ق٢٦-٤ / ق٢٦-٥: «reports» is «إدارة المكتب» — refused on the free side.
    const officeLocked = await officePlanRefusal(auth.supabase, "reports", auth.userType);
    if (officeLocked) return officeLocked;
    const { user, supabase } = auth;
    // R9b (l11): an unverified account creates no fee statement (403, Arabic).
    const unverified = await requireVerifiedProvider(user.id, auth.userType);
    if (unverified) return unverified;

    const parsed = parseMarkBilled(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { paymentId, timeIds, expenseIds } = parsed.value;

    const { data: pay, error: payError } = await supabase
      .from("payments")
      .select("id, owner_user_id")
      .eq("id", paymentId)
      .maybeSingle();
    if (payError) return errorResponse(payError, "lawyer/fee-statement/billed payment");
    if (!pay || (pay as { owner_user_id: string | null }).owner_user_id !== user.id) {
      return NextResponse.json({ error: "الفاتورة غير موجودة أو ليست من إصدارك." }, { status: 404 });
    }

    let time = 0;
    let expenses = 0;
    if (timeIds.length) {
      const { data, error } = await supabase
        .from("time_entries")
        .update({ billed_payment_id: paymentId })
        .in("id", timeIds)
        .is("billed_payment_id", null)
        .is("voided_at", null)
        .select("id");
      if (error) return errorResponse(error, "lawyer/fee-statement/billed time");
      time = (data ?? []).length;
    }
    if (expenseIds.length) {
      const { data, error } = await supabase
        .from("lawyer_expenses")
        .update({ billed_payment_id: paymentId })
        .in("id", expenseIds)
        .is("billed_payment_id", null)
        .is("voided_at", null)
        .select("id");
      if (error) return errorResponse(error, "lawyer/fee-statement/billed expenses");
      expenses = (data ?? []).length;
    }
    return NextResponse.json({
      data: { time, expenses, requested: timeIds.length + expenseIds.length },
    });
  } catch (err) {
    console.error("[lawyer/fee-statement/billed POST] unexpected:", err);
    return NextResponse.json({ error: "تعذّر ربط القيود بالفاتورة." }, { status: 500 });
  }
}
