import { NextResponse, type NextRequest } from "next/server";
import { assertCaseWorker } from "@/lib/auth/assertCaseWorker";
import {
  LEDGER_SELECT,
  ledgerDbError,
  ledgerPatchToRow,
  parseLedgerPatch,
  toLedgerDto,
  type LedgerRow,
} from "@/lib/ledger/ledgerInput";

/**
 * PATCH /api/v1/lawyer/ledger/[id]  { direction?, channel?, title?, notes?, occurredAt?, archived? }
 *
 * The writer only (RLS USING created_by = auth.uid(); WITH CHECK re-tests
 * that he still works on the case). The case, firm and writer of an entry
 * cannot change — the table grants no UPDATE on those columns.
 *
 * There is no DELETE: owner directive 5 («حظر الحذف النهائي») — an entry is
 * archived (`archived: true`) and can be restored (`archived: false`).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertCaseWorker();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "القيد غير موجود." }, { status: 404 });

    const parsed = parseLedgerPatch(await request.json().catch(() => null), Date.now());
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const { data, error } = await supabase
      .from("legal_ledger_entries")
      .update(ledgerPatchToRow(parsed.value, new Date().toISOString()))
      .eq("id", id)
      .eq("created_by", user.id)
      .select(LEDGER_SELECT)
      .maybeSingle();
    if (error) {
      console.error("[lawyer/ledger PATCH] update failed:", error.message, error.code);
      const mapped = ledgerDbError(error);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    if (!data) return NextResponse.json({ error: "القيد غير موجود أو ليس من تسجيلك." }, { status: 404 });
    return NextResponse.json({ data: toLedgerDto(data as unknown as LedgerRow, user.id, null) });
  } catch (err) {
    console.error("[lawyer/ledger PATCH] unexpected:", err);
    return NextResponse.json({ error: "تعذّر تعديل القيد." }, { status: 500 });
  }
}
