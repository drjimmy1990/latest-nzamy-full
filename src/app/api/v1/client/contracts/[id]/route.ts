import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { loadClientContractDetail } from "../_clientRead";

/**
 * GET /api/v1/client/contracts/[id] — one contract with its versions,
 * parties, obligations and payments, through the client's own eyes
 * (contractsService.ts's `getClientContract`).
 *
 * Owner file 15 #4 (l9-secleak): only the caller's own share
 * (client_user_id = him), never a DRAFT contract (404, like a stranger's), and
 * never a note (contract, version, obligation, payment) or the contract
 * metadata — public.client_contract_detail() (20261129_20) with a whitelisted
 * fallback while it is missing (_clientRead.ts). A lawyer opening his own
 * contract here gets the same 404: his view is /api/v1/lawyer/contracts/[id].
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const detail = await loadClientContractDetail(supabase, user.id, id);
    if (!detail || detail.clientUserId !== user.id) {
      return NextResponse.json({ error: "العقد غير موجود" }, { status: 404 });
    }

    return NextResponse.json({ data: detail });
  } catch (err) {
    console.error("[client/contracts/[id] GET] Unexpected error:", err);
    // loadClientContractDetail only ever throws its own two pre-sanitized Arabic
    // messages ("تعذّر تحميل العقد."/"تعذّر تحميل تفاصيل العقد."), never a raw
    // Postgres string — but forwarding `err.message` unconditionally would
    // leak an English internal string into this Arabic `error` field the day
    // that stops being true, so this answers the one fixed message instead.
    return NextResponse.json({ error: "تعذّر تحميل العقد." }, { status: 500 });
  }
}
