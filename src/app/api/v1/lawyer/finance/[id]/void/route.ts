import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { assertRole } from "@/lib/auth/assertRole";
import { voidInvoiceWith } from "@/lib/finance/invoiceFinanceCore";

/**
 * POST /api/v1/lawyer/finance/<paymentId>/void — «إلغاء بيان الأتعاب»
 * (owner TODO 17-Nov, N01-14). Body `{ reason }` (3–500 characters).
 *
 * public.void_lawyer_invoice (20261126_30) does the work under a row lock:
 * the caller must own the statement (record_invoice_collection's rule), it
 * must be an office statement still open with NOTHING collected, and the row
 * is kept — status void, the reason, who and when. A voided statement drops
 * out of every total (every reader filters statuses) and can never collect.
 *
 * The session decides who is asking; the write is the service role's, after
 * the function's own ownership check (payments has no session UPDATE).
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const service = await createServiceClient();
    const reply = await voidInvoiceWith({ admin: service }, { userId: auth.user.id, paymentId: id, body });
    if (reply.status !== 200) return NextResponse.json(reply.body, { status: reply.status });
    const row = reply.row;
    return NextResponse.json({
      data: {
        id: String(row.id),
        status: "void",
        voidReason: typeof row.void_reason === "string" ? row.void_reason : "",
        voidedAt: typeof row.voided_at === "string" ? row.voided_at : null,
      },
      replay: reply.replay === true,
    });
  } catch (err) {
    console.error("[lawyer/finance void] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
