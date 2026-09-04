import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { loadContractDetail } from "../../../lawyer/contracts/_shared";

/**
 * GET /api/v1/client/contracts/[id] — one contract with its versions,
 * parties, obligations and payments, through the client's own eyes
 * (contractsService.ts's `getClientContract`).
 *
 * `loadContractDetail` is RLS-scoped through the caller's own client — the
 * exact helper the lawyer/firm routes use — so a lawyer's own contract
 * detail is already unreachable if RLS refuses it. But RLS also permits the
 * contract's owner and firm colleagues, so an extra check narrows this route
 * to the client's own share the same way the list route does: 404 rather
 * than the owner's version of the same record.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { id } = await context.params;

    const detail = await loadContractDetail(supabase, id);
    if (!detail || detail.clientUserId !== user.id) {
      return NextResponse.json({ error: "العقد غير موجود" }, { status: 404 });
    }

    return NextResponse.json({ data: detail });
  } catch (err) {
    console.error("[client/contracts/[id] GET] Unexpected error:", err);
    // loadContractDetail only ever throws its own two pre-sanitized Arabic
    // messages ("تعذّر تحميل العقد."/"تعذّر تحميل تفاصيل العقد."), never a raw
    // Postgres string — but forwarding `err.message` unconditionally would
    // leak an English internal string into this Arabic `error` field the day
    // that stops being true, so this answers the one fixed message instead.
    return NextResponse.json({ error: "تعذّر تحميل العقد." }, { status: 500 });
  }
}
