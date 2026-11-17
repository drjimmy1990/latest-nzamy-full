import { NextResponse, type NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { resolveCallerFirm } from "@/lib/auth/firmMembershipAccess";
import { createServiceClient } from "@/lib/supabase/server";
import { escapeLikePattern } from "@/lib/services/likePattern";
import { FIRM_ROLE_LABEL } from "@/constants/firmProfileReadiness";
import type { FirmRole } from "@/types/firmBackendReady";
import { recordNotification } from "@/lib/notify";
import { firmInviteErrorResponse, firmInvitePath, isFirmInviteRole, normaliseInviteEmail } from "./_invitations";

/**
 * /api/v1/firm/invitations — F7 «دعوة عضو برابط» (migration 20261125_40).
 *
 * GET  → `{ data: PendingFirmInvitation[] }` the firm's pending link
 *        invitations (token path included — the managers' own links).
 * POST `{ email, role }` → 201 `{ data: { id, path, expiresAt, notified } }`
 *
 * No e-mail is sent in this batch. The firm owner (or an active managing
 * partner) gets a link to copy; if the address already belongs to a lawyer or
 * individual account, that person also gets an in-app notification pointing at
 * the same link. The row is written by public.create_firm_team_invitation —
 * SECURITY DEFINER with its own owner / managing-partner check; the table
 * itself is no longer writable by sessions (its old INSERT policy let anyone
 * mint an invitation into any firm).
 *
 * The invitee opens /invite/team/<token>, signs in with the invited address,
 * and the link turns into an `invited` firm_members row that he accepts through
 * the existing POST /api/v1/me/invitations/firm/{id}/accept.
 */

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "private, no-store" };

async function callerFirm(auth: Extract<Awaited<ReturnType<typeof assertRole>>, { ok: true }>) {
  const { data, error } = await resolveCallerFirm(auth.supabase, auth.user.id);
  if (error) return { response: NextResponse.json({ error: "تعذّر قراءة المكتب." }, { status: 500 }) };
  if (!data) return { response: NextResponse.json({ error: "لا يوجد مكتب مرتبط بهذا الحساب." }, { status: 404 }) };
  if (!data.isOwner && data.role !== "managing_partner") {
    return { response: NextResponse.json({ error: "الدعوات لصاحب المكتب والشريك المدير فقط." }, { status: 403 }) };
  }
  return { firm: data };
}

export async function GET() {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const r = await callerFirm(auth);
    if ("response" in r) return r.response;

    const { data, error } = await auth.supabase
      .from("team_invitations")
      .select("id, invitee_email, role, token, expires_at, created_at")
      .eq("entity_type", "firm")
      .eq("entity_id", r.firm.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      const mapped = firmInviteErrorResponse(error.code);
      if (mapped.status === 500) console.error("[firm/invitations GET] read failed:", error.message, error.code);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status, headers: NO_STORE });
    }
    const rows = (data ?? []) as Array<{ id: string; invitee_email: string | null; role: string; token: string; expires_at: string }>;
    return NextResponse.json(
      {
        data: rows.map((row) => ({
          id: row.id,
          email: row.invitee_email ?? "",
          role: row.role,
          path: firmInvitePath(row.token),
          expiresAt: row.expires_at,
        })),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[firm/invitations GET] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحميل الدعوات." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const r = await callerFirm(auth);
    if ("response" in r) return r.response;

    const body = (await request.json().catch(() => ({}))) as { email?: unknown; role?: unknown };
    const email = normaliseInviteEmail(body.email);
    if (!email) return NextResponse.json({ error: "اكتب بريداً إلكترونياً صحيحاً." }, { status: 400 });
    if (!isFirmInviteRole(body.role)) return NextResponse.json({ error: "اختر دور العضو في المكتب." }, { status: 400 });
    const role = body.role;

    const { data, error } = await auth.supabase.rpc("create_firm_team_invitation", {
      p_firm: r.firm.id,
      p_email: email,
      p_role: role,
    });
    if (error) {
      const mapped = firmInviteErrorResponse(error.code);
      if (mapped.status === 500) console.error("[firm/invitations POST] rpc failed:", error.message, error.code);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    const created = (Array.isArray(data) ? data[0] : data) as { id: string; token: string; expires_at: string } | null;
    if (!created?.token) {
      return NextResponse.json({ error: "تعذّر إنشاء الدعوة." }, { status: 500 });
    }
    const path = firmInvitePath(created.token);

    // An existing professional account also hears about it in the app — the
    // same account rule as POST /api/v1/firm/members (lawyer / individual).
    let notified = false;
    try {
      const service = await createServiceClient();
      const { data: account } = await service
        .from("profiles")
        .select("id")
        .ilike("email", escapeLikePattern(email))
        .in("user_type", ["lawyer", "individual"])
        .maybeSingle();
      const firmRow = await service.from("firm_profiles").select("name_ar").eq("id", r.firm.id).maybeSingle();
      if (account?.id) {
        const firmName = (firmRow.data?.name_ar as string | null) ?? "مكتب محاماة";
        await recordNotification({
          userId: account.id as string,
          title: "دعوة للانضمام إلى فريق مكتب محاماة",
          body: `دعاك «${firmName}» للانضمام إلى فريقه بصفة «${FIRM_ROLE_LABEL[role as FirmRole] ?? role}». افتح الدعوة لقبولها.`,
          href: path,
        });
        notified = true;
      }
    } catch (err) {
      console.error("[firm/invitations POST] notification lookup failed:", err);
    }

    return NextResponse.json(
      { data: { id: created.id, path, expiresAt: created.expires_at, notified } },
      { status: 201 },
    );
  } catch (err) {
    console.error("[firm/invitations POST] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر إنشاء الدعوة." }, { status: 500 });
  }
}
