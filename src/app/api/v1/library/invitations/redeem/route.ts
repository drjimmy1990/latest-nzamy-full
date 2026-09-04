import { NextRequest, NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { grantEntitlement } from "@/lib/entitlements";
import type { ServerTier } from "@/lib/access-control";
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
 * A code always grants the SAME thing: the "pro" tier, which is what
 * unlocks `library-full-access` in src/hooks/useSubscription.ts's
 * FEATURE_GATES / src/lib/access-control.ts's SERVER_FEATURE_GATES. There is
 * no per-code tier or trial-length column on `library.invitations` (unlike
 * `public.invitations`, which does carry `tier`/`trial_days`) — the current
 * UI (src/lib/invitationStore.ts, entirely client-side/localStorage) never
 * promised a specific length for this admin-code flow, so 30 days is the
 * documented fallback.
 */
const REDEEM_TIER: ServerTier = "pro";
const REDEEM_DURATION_DAYS = 30;

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

  const grant = await grantEntitlement({
    userId,
    action: "plan",
    tier: REDEEM_TIER,
    durationDays: REDEEM_DURATION_DAYS,
    description: `دعوة المكتبة: ${code}`,
    actorId: userId,
  });

  if (!grant.ok) {
    // Don't burn the invitation on a failed grant — give the use back. This is
    // a second CAS, not a blind SET: it only writes `current_uses - 1` if the
    // counter still holds exactly the value this claim advanced it to. If a
    // concurrent redeemer has since claimed another slot (or run its own
    // rollback), `current_uses` has already moved past `claimed.current_uses`
    // and this update matches 0 rows — it silently no-ops instead of
    // clobbering someone else's legitimate use back down. Worst case with the
    // CAS guard: this one grant-failure eats one use (self-correcting, bounded
    // by max_uses). Without it, the failure mode was unbounded — an
    // unconditional decrement could erase another redeemer's grant and let
    // the code exceed max_uses entirely.
    const { error: rollbackError } = await admin
      .schema("library")
      .from("invitations")
      .update({ current_uses: claimed.current_uses - 1 })
      .eq("id", claimed.id)
      .eq("current_uses", claimed.current_uses);
    if (rollbackError) {
      console.error(
        "[library/invitations/redeem] rollback after failed grant also failed:",
        rollbackError.message,
        rollbackError.code,
      );
    }
    return NextResponse.json({ error: grant.error || "تعذّر تفعيل الاشتراك" }, { status: 500 });
  }

  const subscription = (grant.detail as { subscription?: { tier?: string; current_period_end?: string } })
    .subscription;

  return NextResponse.json({
    ok: true,
    tier: subscription?.tier ?? REDEEM_TIER,
    until: subscription?.current_period_end ?? null,
  });
}
