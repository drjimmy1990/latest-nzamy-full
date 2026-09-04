import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { CONTRACT_SELECT, toContractDto, contractListExtras, profileNames, type ContractRow } from "../../lawyer/contracts/_shared";

/**
 * /api/v1/client/contracts — Phase 3 (مدير العقود), the CLIENT's read-only view
 * (contractsService.ts's `getClientContracts`).
 *
 * Backed by `public.contracts` (20260905_phase3_consultations_and_contracts.sql).
 * The table's RLS select policy already lets a client read a contract shared
 * with them (`client_user_id = auth.uid()`) — but that SAME policy also lets
 * the contract's owner or an active firm colleague read it
 * (`can_access_case_row(owner_user_id, firm_id)`). This route is the client's
 * OWN list, not "everything RLS would let this account see" — a lawyer calling
 * it must not see the contracts they themselves own, only ones they marked
 * shared with their own client-side account (harmless either way, since it is
 * still their data) — so `.eq("client_user_id", user.id)` narrows the query on
 * top of RLS rather than relying on the policy alone.
 */
export async function GET(_request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { data, error, count } = await supabase
      .from("contracts")
      .select(CONTRACT_SELECT, { count: "exact" })
      .eq("client_user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[client/contracts GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل العقود." }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as ContractRow[];
    const [extras, ownerNames] = await Promise.all([
      contractListExtras(supabase, rows.map((r) => r.id)),
      profileNames(rows.map((r) => r.owner_user_id)),
    ]);

    const dtos = rows.map((row) =>
      toContractDto(row, {
        ownerName: row.owner_user_id ? ownerNames.get(row.owner_user_id) ?? null : null,
        ...extras.get(row.id),
      }),
    );

    return NextResponse.json({ data: dtos, total: count ?? dtos.length });
  } catch (err) {
    console.error("[client/contracts GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
