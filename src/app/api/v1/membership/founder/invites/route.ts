import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import {
  CREATE_REFUSAL_AR,
  INVITES_GATEWAY_OFF_AR,
  INVITES_NOT_READY_AR,
  INVITES_UNAVAILABLE_AR,
  founderInvitesView,
  inviteGiftAr,
  type InviteRow,
} from "@/lib/founder/founderInvites";
import {
  invitesGatewayOn,
  isActiveFounder,
  isMissingObject,
  readFounderInvitesSettings,
} from "@/lib/founder/founderInvitesServer";

/**
 * /api/v1/membership/founder/invites — the founder's monthly invites (owner
 * Q144 أ, batch l13; SQL 20261203_20).
 *
 *   GET  → { founder: false } for anyone without an active founder seat;
 *          else { founder: true, ready, gatewayOn, message, view } where view
 *          is founderInvitesView (this month's allowance, the gift line, the
 *          invites newest first — never who redeemed them). ready: false
 *          while the migration has not run (the card says «قيد التفعيل»).
 *   POST → creates one invite: 403 gateway_off while online payment is off
 *          for this account («لا تعمل الدعوات إلا بعد تفعيل الدفع»); 403
 *          not_founder; 409 limit; 503 not ready / failure; 200 { code }.
 *
 * Signed-in only; the table is server-only (no RLS policy), so every read and
 * write goes through the service client keyed by the session's own id.
 * Per viewer, never cached.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };
const SIGN_IN = { error: "سجّل الدخول لعرض دعواتك" };

export async function GET() {
  try {
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, SIGN_IN);
    if (auth instanceof NextResponse) {
      auth.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
      return auth;
    }
    const userId = auth.user.id;
    const now = new Date();
    const admin = await createServiceClient();

    const founder = await isActiveFounder(admin, userId, now);
    if (founder === null) return NextResponse.json({ error: INVITES_UNAVAILABLE_AR }, { status: 503, headers: NO_STORE });
    if (!founder) return NextResponse.json({ founder: false }, { headers: NO_STORE });

    const [settings, gatewayOn, rows] = await Promise.all([
      readFounderInvitesSettings(admin),
      invitesGatewayOn(userId),
      admin
        .from("founder_invites")
        .select("code, created_at, expires_at, redeemed_at, month_key")
        .eq("founder_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(60),
    ]);
    if (rows.error) {
      if (isMissingObject(rows.error.code)) {
        return NextResponse.json(
          { founder: true, ready: false, gatewayOn, message: INVITES_NOT_READY_AR, gift: inviteGiftAr(settings) },
          { headers: NO_STORE },
        );
      }
      console.error("[membership/founder/invites GET] read failed:", rows.error.code);
      return NextResponse.json({ error: INVITES_UNAVAILABLE_AR }, { status: 503, headers: NO_STORE });
    }
    const view = founderInvitesView((rows.data ?? []) as InviteRow[], settings, now);
    return NextResponse.json(
      { founder: true, ready: true, gatewayOn, message: gatewayOn ? null : INVITES_GATEWAY_OFF_AR, view },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[membership/founder/invites GET] threw:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: INVITES_UNAVAILABLE_AR }, { status: 503, headers: NO_STORE });
  }
}

export async function POST() {
  try {
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, SIGN_IN);
    if (auth instanceof NextResponse) {
      auth.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
      return auth;
    }
    const userId = auth.user.id;

    // «لا تعمل الدعوات إلا بعد تفعيل الدفع» — checked before the database
    if (!(await invitesGatewayOn(userId))) {
      return NextResponse.json({ error: INVITES_GATEWAY_OFF_AR, code: "gateway_off" }, { status: 403, headers: NO_STORE });
    }

    const admin = await createServiceClient();
    const { data, error } = await admin.rpc("founder_invite_create", { p_founder: userId });
    if (error) {
      if (isMissingObject(error.code)) {
        return NextResponse.json({ error: INVITES_NOT_READY_AR, code: "not_ready" }, { status: 503, headers: NO_STORE });
      }
      console.error("[membership/founder/invites POST] create failed:", error.code);
      return NextResponse.json({ error: INVITES_UNAVAILABLE_AR }, { status: 503, headers: NO_STORE });
    }
    const body = (data ?? {}) as { result?: unknown; code?: unknown; expires_at?: unknown };
    if (body.result === "ok" && typeof body.code === "string") {
      return NextResponse.json({ ok: true, code: body.code, expiresAt: body.expires_at ?? null }, { headers: NO_STORE });
    }
    if (body.result === "not_founder") {
      return NextResponse.json({ error: CREATE_REFUSAL_AR.not_founder, code: "not_founder" }, { status: 403, headers: NO_STORE });
    }
    if (body.result === "limit") {
      return NextResponse.json({ error: CREATE_REFUSAL_AR.limit, code: "limit" }, { status: 409, headers: NO_STORE });
    }
    console.error("[membership/founder/invites POST] unexpected answer:", String(body.result).slice(0, 40));
    return NextResponse.json({ error: INVITES_UNAVAILABLE_AR }, { status: 503, headers: NO_STORE });
  } catch (err) {
    console.error("[membership/founder/invites POST] threw:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: INVITES_UNAVAILABLE_AR }, { status: 503, headers: NO_STORE });
  }
}
