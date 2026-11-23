import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import {
  INVITES_GATEWAY_OFF_AR,
  INVITES_NOT_READY_AR,
  INVITES_UNAVAILABLE_AR,
  REDEEM_REFUSAL_AR,
  normalizeInviteCode,
  parseFounderInvites,
  redeemResultOf,
  redeemStatus,
  redeemSuccessAr,
} from "@/lib/founder/founderInvites";
import { invitesGatewayOn, isMissingObject } from "@/lib/founder/founderInvitesServer";

/**
 * POST /api/v1/membership/founder/invites/redeem { code } — a new lawyer
 * redeems a founder's invite (owner Q144 أ, batch l13; SQL 20261203_20,
 * founder_invite_redeem): a library trial + points valid for the trial.
 *
 * Order: signed in (401) → the code's shape (400 invalid, no database call)
 * → online payment on for this account (403 gateway_off: «لا تعمل الدعوات
 * إلا بعد تفعيل الدفع») → the RPC, whose answer maps to redeemStatus() with
 * its Arabic line (REDEEM_REFUSAL_AR). The code travels in the body, never in
 * an API URL. The proxy puts this path in the strict per-address bucket
 * (src/lib/rateLimitRoutes.ts); codes carry 60 random bits.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };
const SIGN_IN = { error: "سجّل الدخول ثم فعّل الدعوة", code: "sign_in" };

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, SIGN_IN);
    if (auth instanceof NextResponse) {
      auth.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
      return auth;
    }
    const userId = auth.user.id;

    const raw = (await request.json().catch(() => null)) as { code?: unknown } | null;
    const code = normalizeInviteCode(raw?.code);
    if (!code) {
      return NextResponse.json({ error: REDEEM_REFUSAL_AR.invalid, code: "invalid" }, { status: 400, headers: NO_STORE });
    }

    // «لا تعمل الدعوات إلا بعد تفعيل الدفع» — checked before the database
    if (!(await invitesGatewayOn(userId))) {
      return NextResponse.json({ error: INVITES_GATEWAY_OFF_AR, code: "gateway_off" }, { status: 403, headers: NO_STORE });
    }

    const admin = await createServiceClient();
    const { data, error } = await admin.rpc("founder_invite_redeem", { p_user: userId, p_code: code });
    if (error) {
      if (isMissingObject(error.code)) {
        return NextResponse.json({ error: INVITES_NOT_READY_AR, code: "not_ready" }, { status: 503, headers: NO_STORE });
      }
      console.error("[founder invites redeem] failed:", error.code);
      return NextResponse.json({ error: INVITES_UNAVAILABLE_AR }, { status: 503, headers: NO_STORE });
    }
    const result = redeemResultOf(data);
    if (!result) {
      console.error("[founder invites redeem] unexpected answer");
      return NextResponse.json({ error: INVITES_UNAVAILABLE_AR }, { status: 503, headers: NO_STORE });
    }
    if (result !== "ok") {
      return NextResponse.json({ error: REDEEM_REFUSAL_AR[result], code: result }, { status: redeemStatus(result), headers: NO_STORE });
    }
    // the gift exactly as given (the RPC's own numbers, not a second settings read)
    const body = data as { trial_ends_at?: unknown; points?: unknown; trial_days?: unknown; points_scope?: unknown };
    const trialEndsAt = typeof body.trial_ends_at === "string" ? body.trial_ends_at : null;
    const settings = parseFounderInvites({ trial_days: body.trial_days, points: body.points, points_scope: body.points_scope });
    return NextResponse.json(
      {
        ok: true,
        trialEndsAt,
        points: typeof body.points === "number" ? body.points : null,
        message: redeemSuccessAr(trialEndsAt, settings),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[founder invites redeem] threw:", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: INVITES_UNAVAILABLE_AR }, { status: 503, headers: NO_STORE });
  }
}
