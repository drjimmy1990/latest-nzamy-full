import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { grantEntitlement } from "@/lib/entitlements";
import type { ServerTier } from "@/lib/access-control";
import { isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";

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
 *
 * ── Three guards, from review 2026-09-21 A3 / C01 ───────────────────────
 * 1. `inviter_id` is read and compared with the caller: nobody may redeem a
 *    code they created themselves (403). Before this, the creator of a row
 *    could accept it and grant themselves a trial.
 * 2. A row whose `inviter_id` is NULL is REFUSED (400). Guard 1 used to be
 *    written as a truthiness check AND the comparison, so a NULL inviter
 *    skipped it altogether. The deleted POST /api/v1/invite/sync is NOT the
 *    source of those NULLs: it wrote `inviter_id: user.id` (its NULL was
 *    `tier`, which guard 3 catches). Per the DDL the only producer is the FK
 *    `inviter_id uuid references auth.users(id) on delete set null`
 *    (supabase/migrations/20260706_content_and_ops.sql:115) — so an
 *    inviter-less row is a REAL, still-pending invitation whose inviter
 *    deleted their auth account. This refusal therefore closes nothing of the
 *    invite/sync hole (guards 1 and 3 do that); it kills those orphaned
 *    invitations, and that is the accepted cost of the review's mandated
 *    refusal. Do NOT reason about such rows as junk and do not purge them.
 * 3. A row whose `tier` is NULL or not one of VALID_TIERS is REFUSED (400).
 *    It used to silently become "pro" — combined with invite/sync, which let
 *    any signed-in user write `tier: null` rows with the service-role
 *    client, that was a self-service Pro subscription.
 * The grant itself also no longer cancels a better live subscription — see
 * `replaceActive` in src/lib/entitlements.ts. When it declines for that
 * reason the invitation is left PENDING and the answer is a 400 carrying the
 * Arabic explanation: burning the code would cost the user a trial they never
 * received, and a 2xx would be read as success by the only consumer —
 * src/app/invite/[code]/page.tsx sets `accepted` on any ok response without
 * looking at the body, and would print «تجربتك مفعّلة!» over a grant that was
 * never written. Its `!res.ok` arm shows `json.error` verbatim, which is why
 * every refusal here is a non-2xx with an Arabic `error` (the same reasoning
 * as POST /api/v1/library/invitations/redeem).
 *
 * POST is in STRICT_RATE_LIMITED_ROUTES (src/lib/rateLimitRoutes.ts:18), so
 * the proxy throttles code-guessing before this handler runs.
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
    if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = await createServiceClient();
    const { data: row, error: lookupError } = await admin
      .from("invitations")
      .select("id, code, inviter_id, trial_days, tier, status, expires_at")
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

    // The previous form guarded with `row.inviter_id && …`, so a NULL inviter
    // skipped the self-invite check below. The NULL does NOT come from the
    // deleted POST /api/v1/invite/sync — that route wrote `inviter_id: user.id`
    // (it was `tier` it left NULL). The FK `references auth.users(id) on
    // delete set null` (20260706_content_and_ops.sql:115) is the only producer,
    // i.e. a real pending invitation whose inviter deleted their account. The
    // review mandates refusing it anyway; the accepted cost is that those
    // orphaned invitations die (review 2026-09-21 A3/C01).
    if (!row.inviter_id) {
      return NextResponse.json(
        { error: "هذه الدعوة غير صالحة." },
        { status: 400 },
      );
    }

    // The creator may never redeem their own code (review A3/C01).
    if (row.inviter_id === user.id) {
      return NextResponse.json(
        { error: "لا يمكن قبول دعوة أنشأتها بنفسك" },
        { status: 403 },
      );
    }

    if (row.expires_at && new Date(row.expires_at as string) < new Date()) {
      return NextResponse.json(
        { error: "انتهت صلاحية هذه الدعوة" },
        { status: 410 },
      );
    }

    // The tier must be spelled out on the invitation. A missing or unknown
    // tier is refused — it must NEVER fall back to "pro" (review A3/C01).
    const rawTier = row.tier as string | null;
    if (!rawTier || !VALID_TIERS.includes(rawTier as ServerTier)) {
      return NextResponse.json(
        { error: "هذه الدعوة غير صالحة." },
        { status: 400 },
      );
    }
    const tier = rawTier as ServerTier;
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

    // Nothing was written: the account already holds this plan or a better one,
    // and grantEntitlement refused to trade it for this trial. Do NOT mark the
    // invitation accepted — the user received nothing, so the code stays
    // redeemable once the better plan lapses. It is a 400, not a 200: the
    // landing page treats every ok response as an activated trial (see the
    // header), and it renders this `error` verbatim.
    if (grant.alreadyEntitled) {
      return NextResponse.json(
        {
          error:
            "حسابك يحمل بالفعل هذه الباقة أو أعلى منها، ولم نغيّر اشتراكك الحالي. كود الدعوة لم يُستهلك ويمكنك استخدامه لاحقاً.",
        },
        { status: 400 },
      );
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

    // Reaching here means a real grant: every other outcome, including the
    // skipped one, returned a non-2xx above.
    return NextResponse.json({
      success: true,
      data: { tier, trialDays: durationDays },
    });
  } catch (err) {
    console.error("[invite accept] Unexpected error:", err);
    return NextResponse.json({ error: "فشل قبول الدعوة" }, { status: 500 });
  }
}
