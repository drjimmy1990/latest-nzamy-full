import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";

/**
 * POST /api/v1/me/firm/leave — F7 «مغادرة المكتب» (migration 20261125_40).
 * Body: `{ firmId? }` — defaults to the caller's single active membership.
 *
 * public.leave_firm sets the caller's OWN active firm_members row to
 * `removed` (a member has no RLS UPDATE arm on his row, hence the SECURITY
 * DEFINER function). The existing trigger trg_firm_members_removed_transfer
 * (20261026_70) then moves his rows of that firm — the firm's cases he filed or
 * leads, their stages, hearings, deadlines, tasks, notes and documents, the
 * firm's clients and their notes, consultations and contracts — to the firm
 * owner, who is notified. The firm owner cannot leave his own firm (403).
 */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = (await request.json().catch(() => ({}))) as { firmId?: unknown };
    let firmId = typeof body.firmId === "string" ? body.firmId : "";
    if (firmId && !UUID.test(firmId)) return NextResponse.json({ error: "معرّف المكتب غير صالح." }, { status: 400 });

    if (!firmId) {
      const { data, error } = await supabase
        .from("firm_members")
        .select("firm_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(2);
      if (error) {
        console.error("[me/firm/leave] membership read failed:", error.message, error.code);
        return NextResponse.json({ error: "تعذّرت قراءة عضويتك في المكتب." }, { status: 500 });
      }
      const rows = (data ?? []) as Array<{ firm_id: string }>;
      if (rows.length === 0) return NextResponse.json({ error: "لست عضواً نشطاً في أي مكتب." }, { status: 404 });
      if (rows.length > 1) return NextResponse.json({ error: "أنت عضو في أكثر من مكتب — حدّد المكتب." }, { status: 400 });
      firmId = rows[0].firm_id;
    }

    const { error } = await supabase.rpc("leave_firm", { p_firm: firmId });
    if (error) {
      if (error.code === "42501") {
        return NextResponse.json({ error: "صاحب المكتب لا يغادر مكتبه." }, { status: 403 });
      }
      if (error.code === "P0002") {
        return NextResponse.json({ error: "لست عضواً نشطاً في هذا المكتب." }, { status: 404 });
      }
      if (error.code === "42883" || error.code === "PGRST202") {
        return NextResponse.json({ error: "مغادرة المكتب غير مفعّلة بعد على هذه المنصة." }, { status: 503 });
      }
      console.error("[me/firm/leave] rpc failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّرت مغادرة المكتب." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[me/firm/leave] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّرت مغادرة المكتب." }, { status: 500 });
  }
}
