import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/invite/[code] — Public invite-code lookup for the
 * /invite/[code] landing page.
 *
 * No session required (an invitee has not registered yet), so this reads
 * with the service client — `public.invitations` has no public select
 * policy by design (20260706_content_and_ops.sql: only the inviter's own
 * rows and admin are select-able; everyone else looks the code up through
 * this server route). Never leaks the invitee's own contact info
 * (invitee_email / invitee_phone) — only what the landing page needs to
 * show a welcome screen: validity, trial length, tier, expiry, and the
 * INVITER's display name (never their email/phone either).
 *
 * Mirrors the same lookup POST /api/v1/invite/[code]/accept already does,
 * so a code that resolves here will resolve the same way there.
 *
 * ── OPEN GAP: NOTHING WRITES public.invitations ─────────────────────────
 * This route and the accept POST can only ever resolve a row that already
 * exists — and nothing in this codebase creates one. Verified by grep:
 * zero `.insert` calls against `public.invitations` anywhere in `src/`.
 * (`.insert` calls that look similar target different tables: admin/
 * library-invitations/route.ts:102 and library/invitations/redeem/
 * route.ts write `library.invitations` via `.schema("library")` — a
 * separate table for a separate, admin-issued library-trial code, not a
 * colleague/plan invite; groups/[id]/invite/route.ts:97 writes the
 * unrelated `group_invitations`.) So today, in production, this landing
 * page and its accept flow are unreachable by any real invitee: no admin
 * UI, API route, or script can mint a `public.invitations` row for anyone
 * to receive. Building that writer is a product decision — who may invite,
 * and what the invite grants — deliberately left to the owner rather than
 * decided here.
 */

const CODE_MAX_LEN = 64;

interface InvitationLookupRow {
  code: string;
  inviter_id: string | null;
  trial_days: number | null;
  tier: string | null;
  status: string;
  expires_at: string | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code: rawCode } = await params;
    const code = typeof rawCode === "string" ? rawCode.trim() : "";

    if (!code || code.length > CODE_MAX_LEN) {
      return NextResponse.json({ valid: false, reason: "كود الدعوة غير صالح" });
    }

    const admin = await createServiceClient();
    const { data: row, error } = await admin
      .from("invitations")
      .select("code, inviter_id, trial_days, tier, status, expires_at")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      console.error("[invite/[code] GET] Supabase error:", error.message);
      return NextResponse.json(
        { valid: false, reason: "تعذّر التحقق من الدعوة" },
        { status: 500 },
      );
    }

    if (!row) {
      return NextResponse.json({ valid: false, reason: "رابط الدعوة غير صالح أو غير موجود" });
    }

    const invitation = row as InvitationLookupRow;

    if (invitation.status !== "pending") {
      return NextResponse.json({ valid: false, reason: "تم استخدام هذه الدعوة مسبقاً أو أنها غير صالحة" });
    }

    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, reason: "انتهت صلاحية هذه الدعوة" });
    }

    // Inviter display name only — a second, targeted query, since
    // invitations.inviter_id references auth.users(id) directly (not
    // public.profiles), so there is no FK PostgREST can embed through.
    let inviterName: string | null = null;
    if (invitation.inviter_id) {
      const { data: inviterProfile } = await admin
        .from("profiles")
        .select("display_name, display_name_en")
        .eq("id", invitation.inviter_id)
        .maybeSingle();
      inviterName =
        (inviterProfile?.display_name as string | undefined) ||
        (inviterProfile?.display_name_en as string | undefined) ||
        null;
    }

    return NextResponse.json({
      valid: true,
      status: invitation.status,
      trialDays: invitation.trial_days ?? 14,
      tier: invitation.tier ?? null,
      expiresAt: invitation.expires_at,
      inviterName,
    });
  } catch (err) {
    console.error("[invite/[code] GET] Unexpected error:", err);
    return NextResponse.json(
      { valid: false, reason: "تعذّر التحقق من الدعوة" },
      { status: 500 },
    );
  }
}
