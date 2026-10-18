import { NextRequest, NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { grantLibraryAccess } from "@/lib/libraryAccessServer";
import { normalizeInvitationCode } from "@/lib/services/libraryInvitationRules";
import { libraryInvitationDbErrorResponse } from "../_shared";

/**
 * POST /api/v1/library/invitations/redeem — spend an admin-issued
 * `library.invitations` code for a full-library trial.
 *
 * Signed-in only (any account type — this is not role-gated). Every rejection
 * (bad code, expired, exhausted) is a 400 with an Arabic message, per spec —
 * unlike the sibling colleague-referral flow at
 * /api/v1/invite/[code]/accept (public.invitations), which uses 404/409/410.
 *
 * A code always grants the SAME thing (owner answers ٢٠١–٢٠٣, 2026-10-18):
 * the legal library, for 30 days — one `lib-invite` row in
 * public.library_access_grants with source 'invite_code' — and no plan tier.
 * It used to grant a 30-day "pro" subscription through grantEntitlement;
 * full library access is now Pro+ OR an active library grant OR admin
 * (src/lib/libraryAccessDecision.ts), so the grant alone opens the library.
 * There is no per-code length column on `library.invitations` (unlike
 * `public.invitations`, which carries `trial_days`), so the length is fixed
 * here.
 *
 * A library grant is its own row: it cancels no subscription, so a code can
 * no longer downgrade anyone (review 2026-09-21 A3/C01) and there is no
 * "skipped" outcome to refund. The one refund left is for a FAILED grant —
 * for instance 20261019_10 has not run yet — which gives back the slot this
 * route already burned off `current_uses` (refundClaimedUse below) and answers
 * a 400 in Arabic, the shape every other rejection here takes. It never falls
 * back to granting "pro": that would undo the owner's decision.
 *
 * The success payload keeps its shape ({ ok, tier, until }) and says what was
 * granted: `tier: "library"`, plus `days`, so
 * src/lib/services/libraryInvitationDisplay.ts prints «فُعّل اشتراك المكتبة
 * القانونية لمدة ٣٠ يوماً حتى …».
 */
const REDEEM_LIBRARY_DAYS = 30;

/** Bounds the number of read→CAS-update rounds when concurrent redemptions
 *  race for the same code's `current_uses` counter. */
const MAX_REDEEM_ATTEMPTS = 5;

export const dynamic = "force-dynamic";

interface InvitationCounterRow {
  id: string;
  code: string;
  max_uses: number;
  current_uses: number;
  expires_at: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await assertRole();
  if (!auth.ok) return auth.response;
  const userId = auth.user.id;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const rawCode = body?.code;
  if (typeof rawCode !== "string" || rawCode.trim().length === 0 || rawCode.length > 64) {
    return NextResponse.json({ error: "كود الدعوة مطلوب" }, { status: 400 });
  }
  const code = normalizeInvitationCode(rawCode);

  const admin = await createServiceClient();

  let claimed: { id: string; current_uses: number } | null = null;

  for (let attempt = 0; attempt < MAX_REDEEM_ATTEMPTS; attempt++) {
    const { data: row, error: readError } = await admin
      .schema("library")
      .from("invitations")
      .select("id, code, max_uses, current_uses, expires_at")
      .eq("code", code)
      .maybeSingle<InvitationCounterRow>();

    if (readError) {
      console.error("[library/invitations/redeem] lookup failed:", readError.message, readError.code);
      const mapped = libraryInvitationDbErrorResponse(readError);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    if (!row) {
      return NextResponse.json({ error: "كود الدعوة غير صالح" }, { status: 400 });
    }
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return NextResponse.json({ error: "انتهت صلاحية كود الدعوة" }, { status: 400 });
    }
    if (row.current_uses >= row.max_uses) {
      return NextResponse.json({ error: "تم استنفاد عدد مرات استخدام كود الدعوة" }, { status: 400 });
    }

    // Compare-and-swap: only increment if `current_uses` is still exactly what
    // we just read AND still below `max_uses`. If a concurrent redemption won
    // the race, this update matches 0 rows — updated comes back null and the
    // loop re-reads the live count instead of double-counting off a stale
    // snapshot (a plain `.lt("current_uses", max_uses)` alone is not enough:
    // the SET value is computed client-side, so two racing requests could
    // both write `current_uses = 1` for a code whose max_uses is > 1).
    const { data: updated, error: updateError } = await admin
      .schema("library")
      .from("invitations")
      .update({ current_uses: row.current_uses + 1 })
      .eq("code", code)
      .eq("current_uses", row.current_uses)
      .lt("current_uses", row.max_uses)
      .select("id, current_uses")
      .maybeSingle<{ id: string; current_uses: number }>();

    if (updateError) {
      console.error("[library/invitations/redeem] increment failed:", updateError.message, updateError.code);
      const mapped = libraryInvitationDbErrorResponse(updateError);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    if (updated) {
      claimed = updated;
      break;
    }
    // Lost the race this round — loop and re-read the live row.
  }

  if (!claimed) {
    return NextResponse.json(
      { error: "الكود قيد الاستخدام حالياً من مستخدم آخر، حاول مرة أخرى" },
      { status: 409 },
    );
  }

  /**
   * Give the claimed use back. This is a compare-and-swap, not a blind SET: it
   * only writes `current_uses - 1` if the counter still holds exactly the value
   * this claim advanced it to. If a concurrent redeemer has since claimed
   * another slot (or run its own refund), `current_uses` has already moved past
   * `claimed.current_uses` and this update matches 0 rows — it silently no-ops
   * instead of clobbering someone else's legitimate use back down. Worst case
   * with the CAS guard: one refund is lost (self-correcting, bounded by
   * max_uses). Without it, the failure mode was unbounded — an unconditional
   * decrement could erase another redeemer's grant and let the code exceed
   * max_uses entirely.
   */
  async function refundClaimedUse(claim: { id: string; current_uses: number }) {
    const { error } = await admin
      .schema("library")
      .from("invitations")
      .update({ current_uses: claim.current_uses - 1 })
      .eq("id", claim.id)
      .eq("current_uses", claim.current_uses);
    if (error) {
      console.error(
        "[library/invitations/redeem] refund of the claimed use failed:",
        error.message,
        error.code,
      );
    }
  }

  const grant = await grantLibraryAccess({
    userId,
    planRef: "lib-invite",
    days: REDEEM_LIBRARY_DAYS,
    source: "invite_code",
  });

  if (!grant.ok) {
    // grantLibraryAccess has logged its error (English or raw Postgres). Don't
    // burn the invitation on a failed grant — give the use back.
    await refundClaimedUse(claimed);
    return NextResponse.json(
      { error: "تعذّر تفعيل اشتراك المكتبة. لم يُستهلك كود الدعوة، حاول مرة أخرى لاحقاً." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    tier: "library",
    days: REDEEM_LIBRARY_DAYS,
    until: grant.endsAt,
  });
}
