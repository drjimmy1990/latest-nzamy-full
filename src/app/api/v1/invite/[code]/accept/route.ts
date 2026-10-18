import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { ServerTier } from "@/lib/access-control";
import { colleagueInviteTrialDays } from "@/lib/libraryAccess";
import { grantLibraryAccess } from "@/lib/libraryAccessServer";
import { isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";

/**
 * POST /api/v1/invite/[code]/accept — Accept a colleague/trial invitation.
 *
 * Requires an authenticated user. Looks up invitations by code (service-role,
 * since there is no public select policy), validates it is still 'pending' and
 * not expired, then grants the invited user a LIBRARY trial and marks the
 * invitation accepted.
 *
 * What it grants (owner answers ٢٠١–٢٠٣, 2026-10-18): one `lib-trial` row in
 * public.library_access_grants, source 'colleague_invite', for the
 * invitation's own `trial_days` (30 when it is not a whole number of days
 * from 1 to 3660 — colleagueInviteTrialDays, which GET /api/v1/invite/[code]
 * also uses, so the landing page promises the length granted here). It no
 * longer grants a plan: the invitation's `tier` decides nothing, and no
 * `subscriptions` row is written. This route serves only these
 * public.invitations colleague invites — the landing page
 * (src/app/invite/[code]/page.tsx) invites to the legal library; team and
 * firm invitations are answered at /api/v1/me/invitations/{kind}/{id}/accept.
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
 *    client, that was a self-service Pro subscription. Since owner ٢٠١–٢٠٣
 *    the tier grants nothing; the refusal is kept as the row-validity check
 *    the review mandated, so a malformed row still dies here.
 * The old "skipped grant" arm (grantEntitlement declining to replace a better
 * plan) is gone with that call: a library grant is its own row, cancels
 * nothing, and is either written or failed. A FAILED grant (for instance
 * 20261019_10 has not run yet) leaves the invitation PENDING and answers a
 * 400 in Arabic — never a 500, never the raw error, and never a fallback to
 * a plan. A 2xx would be read as success by the only consumer —
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
    // tier is refused — it must NEVER fall back to "pro" (review A3/C01). It
    // is a row-validity check only: the grant below is the library, whatever
    // the tier says (owner ٢٠١–٢٠٣).
    const rawTier = row.tier as string | null;
    if (!rawTier || !VALID_TIERS.includes(rawTier as ServerTier)) {
      return NextResponse.json(
        { error: "هذه الدعوة غير صالحة." },
        { status: 400 },
      );
    }
    const trialDays = colleagueInviteTrialDays(row.trial_days);

    const grant = await grantLibraryAccess({
      userId: user.id,
      planRef: "lib-trial",
      days: trialDays,
      source: "colleague_invite",
    });

    // grant.error is English or raw Postgres: logged here, never sent. The
    // invitation stays pending, so the user can accept it again later.
    if (!grant.ok) {
      console.error("[invite accept] library grant failed:", grant.error);
      return NextResponse.json(
        { error: "تعذّر تفعيل تجربة المكتبة القانونية. لم تُستهلك الدعوة، حاول مرة أخرى لاحقاً." },
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

    // Reaching here means a real grant: every other outcome returned a
    // non-2xx above.
    return NextResponse.json({
      success: true,
      data: { planRef: "lib-trial", trialDays, until: grant.endsAt },
    });
  } catch (err) {
    console.error("[invite accept] Unexpected error:", err);
    return NextResponse.json({ error: "فشل قبول الدعوة" }, { status: 500 });
  }
}
