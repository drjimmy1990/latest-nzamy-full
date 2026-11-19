import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { listClientContracts } from "./_clientRead";

/**
 * /api/v1/client/contracts — Phase 3 (مدير العقود), the CLIENT's read-only view
 * (contractsService.ts's `getClientContracts`).
 *
 * Owner file 15 #4 (l9-secleak): the answer never carries the lawyer's notes,
 * the contract metadata (counterparty phone / id number) or a DRAFT contract.
 * It is the caller's OWN list (client_user_id = him) — a lawyer calling it
 * sees only contracts shared with his own client-side account, never the ones
 * he owns. The read goes through public.client_contracts_list() (20261129_20,
 * which also takes the client arm off the contract tables' RLS), with a
 * whitelisted fallback while that function is missing — _clientRead.ts.
 */
export async function GET(_request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const read = await listClientContracts(supabase, user.id);
    if (!read.ok) {
      return NextResponse.json({ error: "تعذّر تحميل العقود." }, { status: 500 });
    }
    return NextResponse.json({ data: read.data, total: read.data.length });
  } catch (err) {
    console.error("[client/contracts GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
