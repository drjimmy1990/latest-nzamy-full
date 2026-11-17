import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import { TRUST_SELECT, parseVoidReason, toTrustDto, type TrustRow } from "@/lib/financeLedger/financeLedgerRules";
import { UUID_RE, errorResponse, labelRows } from "../../_financeLedger/server";

/**
 * PATCH /api/v1/lawyer/trust/[id]  { void: true, reason }
 *
 * A trust movement is never edited or deleted: it is voided with a reason (by
 * its writer, the card's owner or a firm finance role) and a correct one is
 * recorded. The void leaves the balance (client_trust_balance counts live
 * rows only).
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "الحركة غير موجودة." }, { status: 404 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || body.void !== true) {
      return NextResponse.json({ error: "حركة الأمانة لا تُعدَّل — ألغِها بسبب وسجّل حركة صحيحة." }, { status: 400 });
    }
    const reason = parseVoidReason(body.reason);
    if (!reason.ok) return NextResponse.json({ error: reason.error }, { status: 400 });

    const { data, error } = await supabase
      .from("client_trust_ledger")
      .update({ voided_at: new Date().toISOString(), void_reason: reason.value })
      .eq("id", id)
      .select(TRUST_SELECT)
      .maybeSingle();
    if (error) return errorResponse(error, "lawyer/trust PATCH");
    if (!data) return NextResponse.json({ error: "الحركة غير موجودة أو لا تملك إلغاءها." }, { status: 404 });
    const row = data as unknown as TrustRow;
    const names = await labelRows(supabase, [row]);
    return NextResponse.json({ data: toTrustDto(row, user.id, names(row)) });
  } catch (err) {
    console.error("[lawyer/trust PATCH] unexpected:", err);
    return NextResponse.json({ error: "تعذّر إلغاء الحركة." }, { status: 500 });
  }
}
