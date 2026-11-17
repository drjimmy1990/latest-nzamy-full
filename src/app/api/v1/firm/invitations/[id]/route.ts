import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { firmInviteErrorResponse } from "../_invitations";

/**
 * DELETE /api/v1/firm/invitations/[id] — F7: cancel a pending invitation link
 * (public.cancel_firm_team_invitation, 20261125_40: firm owner or active
 * managing partner of the invitation's firm; P0002 for anything else).
 */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "معرّف الدعوة غير صالح." }, { status: 400 });

    const { error } = await auth.supabase.rpc("cancel_firm_team_invitation", { p_id: id });
    if (error) {
      const mapped = firmInviteErrorResponse(error.code);
      if (mapped.status === 500) console.error("[firm/invitations DELETE] rpc failed:", error.message, error.code);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[firm/invitations DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر إلغاء الدعوة." }, { status: 500 });
  }
}
