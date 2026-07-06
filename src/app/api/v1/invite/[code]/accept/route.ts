import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { grantEntitlement } from "@/lib/entitlements";
import type { ServerTier } from "@/lib/access-control";

/**
 * POST /api/v1/invite/[code]/accept — Accept a colleague/trial invitation.
 *
 * Requires an authenticated user. Looks up invitations by code (service-role,
 * since there is no public select policy), validates it is still 'pending' and
 * not expired, then grants the invited user a plan trial via grantEntitlement
 * and marks the invitation accepted.
 *
 * invitations columns (20260706_content_and_ops.sql):
 *   code, inviter_id, trial_days (default 14), tier, status
 *   (pending/accepted/expired/revoked), accepted_by, accepted_at, expires_at
 */
const VALID_TIERS: ServerTier[] = [
  "free",
  "shield",
  "ai",
  "pro",
  "max",
  "corp",
  "enterprise",
];

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    if (!code) {
      return NextResponse.json({ error: "كود الدعوة غير صالح" }, { status: 400 });
    }

    // Must be logged in — the entitlement is granted to this user.
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = await createServiceClient();
    const { data: row, error: lookupError } = await admin
      .from("invitations")
      .select("id, code, trial_days, tier, status, expires_at")
      .eq("code", code)
      .maybeSingle();

    if (lookupError || !row) {
      return NextResponse.json(
        { error: "رابط الدعوة غير صالح أو غير موجود" },
        { status: 404 },
      );
    }

    if (row.status !== "pending") {
      return NextResponse.json(
        { error: "تم استخدام هذه الدعوة مسبقاً أو أنها غير صالحة" },
        { status: 409 },
      );
    }

    if (row.expires_at && new Date(row.expires_at as string) < new Date()) {
      return NextResponse.json(
        { error: "انتهت صلاحية هذه الدعوة" },
        { status: 410 },
      );
    }

    // Grant the plan trial. Default to 'pro' when the invite carries no tier.
    const rawTier = (row.tier as string | null) ?? "pro";
    const tier = (VALID_TIERS.includes(rawTier as ServerTier)
      ? (rawTier as ServerTier)
      : "pro") as ServerTier;
    const durationDays =
      typeof row.trial_days === "number" && row.trial_days > 0
        ? (row.trial_days as number)
        : 14;

    const grant = await grantEntitlement({
      userId: user.id,
      action: "plan",
      tier,
      durationDays,
      actorId: user.id,
      description: `قبول دعوة ${code}`,
    });

    if (!grant.ok) {
      return NextResponse.json({ error: grant.error }, { status: 500 });
    }

    // Mark the invitation accepted (best-effort — the grant already succeeded).
    const { error: updateError } = await admin
      .from("invitations")
      .update({
        status: "accepted",
        accepted_by: user.id,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "pending");

    if (updateError) {
      console.error(
        "[invite accept] invitation update failed:",
        updateError.message,
      );
    }

    return NextResponse.json({
      success: true,
      data: { tier, trialDays: durationDays },
    });
  } catch (err) {
    console.error("[invite accept] Unexpected error:", err);
    return NextResponse.json({ error: "فشل قبول الدعوة" }, { status: 500 });
  }
}
