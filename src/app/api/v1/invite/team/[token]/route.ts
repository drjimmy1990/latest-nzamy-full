import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { FIRM_ROLE_LABEL } from "@/constants/firmProfileReadiness";
import type { FirmRole } from "@/types/firmBackendReady";
import { isInviteToken, redeemErrorMessage } from "../../../firm/invitations/_invitations";

/**
 * /api/v1/invite/team/[token] — F7, the invitee's side of a firm invitation
 * link (migration 20261125_40).
 *
 * GET  (no session needed) → `{ valid, firmName?, roleLabel?, expiresAt?, reason? }`
 *      Read with the service role for exactly the one row the 64-hex token
 *      names; the invitee's address is NOT returned (a forwarded link tells
 *      nobody whom it was meant for).
 * POST (session) → `{ data: { memberId } }` — public.redeem_firm_team_invitation
 *      turns the link into an `invited` firm_members row after its own checks
 *      (pending, not expired, the inviter still manages the firm, the signed-in
 *      e-mail is the invited one, a lawyer/individual account). The page then
 *      calls the existing POST /api/v1/me/invitations/firm/{memberId}/accept.
 */

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    if (!isInviteToken(token)) return NextResponse.json({ valid: false, reason: "not_found" }, { headers: NO_STORE });

    const service = await createServiceClient();
    const { data, error } = await service
      .from("team_invitations")
      .select("entity_id, role, status, expires_at")
      .eq("token", token)
      .eq("entity_type", "firm")
      .maybeSingle();
    if (error) {
      console.error("[invite/team GET] read failed:", error.message, error.code);
      return NextResponse.json({ valid: false, reason: "error" }, { status: 500, headers: NO_STORE });
    }
    if (!data) return NextResponse.json({ valid: false, reason: "not_found" }, { headers: NO_STORE });
    const row = data as { entity_id: string; role: string; status: string; expires_at: string };
    if (row.status !== "pending") return NextResponse.json({ valid: false, reason: "used" }, { headers: NO_STORE });
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ valid: false, reason: "expired" }, { headers: NO_STORE });
    }
    const firm = await service.from("firm_profiles").select("name_ar").eq("id", row.entity_id).maybeSingle();
    return NextResponse.json(
      {
        valid: true,
        firmName: (firm.data?.name_ar as string | null) ?? "مكتب محاماة",
        roleLabel: FIRM_ROLE_LABEL[row.role as FirmRole] ?? row.role,
        expiresAt: row.expires_at,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[invite/team GET] Unexpected error:", err);
    return NextResponse.json({ valid: false, reason: "error" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { token } = await context.params;
    if (!isInviteToken(token)) {
      return NextResponse.json({ error: "لا توجد دعوة قائمة بهذا الرابط." }, { status: 404 });
    }
    const { data, error } = await auth.supabase.rpc("redeem_firm_team_invitation", { p_token: token });
    if (error) {
      const mapped = redeemErrorMessage(error.code);
      if (mapped.status === 500) console.error("[invite/team POST] rpc failed:", error.message, error.code);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    if (typeof data !== "string") return NextResponse.json({ error: "تعذّر قبول الدعوة." }, { status: 500 });
    return NextResponse.json({ data: { memberId: data } });
  } catch (err) {
    console.error("[invite/team POST] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر قبول الدعوة." }, { status: 500 });
  }
}
