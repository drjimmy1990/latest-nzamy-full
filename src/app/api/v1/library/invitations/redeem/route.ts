import { NextRequest, NextResponse } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { grantLibraryAccess } from "@/lib/libraryAccessServer";
import { DEFAULT_INVITE_GRANT_DAYS, normalizeInvitationCode } from "@/lib/services/libraryInvitationRules";
import { isMissingColumnError } from "@/lib/library/optionalColumn";
import {
  LIBRARY_INVITATION_SELECT,
  LIBRARY_INVITATION_SELECT_V2,
  libraryInvitationDbErrorResponse,
  type LibraryInvitationRow,
} from "../_shared";

/**
 * POST /api/v1/library/invitations/redeem — spend an admin-issued
 * `library.invitations` code for a full-library trial.
 *
 * Signed-in only (any account type — this is not role-gated). Every rejection
 * (bad code, expired, exhausted) is a 400 with an Arabic message, per spec —
 * unlike the sibling colleague-referral flow at
 * /api/v1/invite/[code]/accept (public.invitations), which uses 404/409/410.
 *
 * A code grants the legal library (owner answers ٢٠١–٢٠٣, 2026-10-18) — one
 * `lib-invite` row in public.library_access_grants with source 'invite_code'
 * — and no plan tier. It used to grant a 30-day "pro" subscription through
 * grantEntitlement; full library access is now Pro+ OR an active library
 * grant OR admin (src/lib/libraryAccessDecision.ts), so the grant alone opens
 * the library. Its length is the code's own `grant_days` (owner q378,
 * 20261103_11), or DEFAULT_INVITE_GRANT_DAYS (30) when the code has none.
 * Before 20261103_11 runs the column does not exist: the lookup re-reads
 * without it, and every code gives 30 days, as before.
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
 * granted: `tier: "library"`, plus `days` (the code's), so
 * src/lib/services/libraryInvitationDisplay.ts prints «فُعّل اشتراك المكتبة
 * القانونية لمدة ٩٠ يوماً حتى …».
 *
 * ONE GRANT PER ACCOUNT (security review 2026-11-08, SAST-02 — 20261109_10):
 * a code with several seats gives each account one grant, not one per seat.
 * The route first calls public.redeem_library_invitation (redeemAtomically,
 * at the bottom of this file): ONE database transaction locks the code,
 * checks expiry, the account's earlier redemption and the seats, spends the
 * seat, grants the library and records the redemption — a failed grant rolls
 * the seat back, so that path needs no refund. A second redeem of the same
 * code by the same account answers 400 «سبق أن استخدمتَ كود الدعوة هذا …».
 * Deploy order: while 20261109_10 has not run (42883 / PGRST202 / 42P01) the
 * route keeps the old flow below (logged once); any other database error is
 * answered, never retried through the old flow.
 */

/** Bounds the number of read→CAS-update rounds when concurrent redemptions
 *  race for the same code's `current_uses` counter. */
const MAX_REDEEM_ATTEMPTS = 5;

export const dynamic = "force-dynamic";

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

  // 1. the one-transaction redeem (20261109_10). null = not installed yet.
  const atomic = await redeemAtomically(admin, userId, code);
  if (atomic) return atomic;

  // 2. the old flow (before 20261109_10): claim a seat, then grant, refund on failure.
  let claimed: { id: string; current_uses: number } | null = null;
  let claimedDays = DEFAULT_INVITE_GRANT_DAYS;

  /** The code's row with grant_days; before 20261103_11, read once more without it. */
  const readInvitation = async () => {
    const read = (select: string) =>
      admin.schema("library").from("invitations").select(select).eq("code", code).maybeSingle<LibraryInvitationRow>();
    const first = await read(LIBRARY_INVITATION_SELECT_V2);
    if (!isMissingColumnError(first.error, "grant_days")) return first;
    return read(LIBRARY_INVITATION_SELECT);
  };

  for (let attempt = 0; attempt < MAX_REDEEM_ATTEMPTS; attempt++) {
    const { data: row, error: readError } = await readInvitation();

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
      // The days of the row this round claimed — never a re-read after the claim.
      claimedDays = row.grant_days ?? DEFAULT_INVITE_GRANT_DAYS;
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
    days: claimedDays,
    source: "invite_code",
  });

  if (!grant.ok) {
    // grant.error is English or raw Postgres: logged here, never sent. Don't
    // burn the invitation on a failed grant — give the use back.
    console.error("[library/invitations/redeem] library grant failed:", grant.error);
    await refundClaimedUse(claimed);
    return NextResponse.json(
      { error: "تعذّر تفعيل اشتراك المكتبة. لم يُستهلك كود الدعوة، حاول مرة أخرى لاحقاً." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    tier: "library",
    days: claimedDays,
    until: grant.endsAt,
  });
}

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

/** The same account redeeming the same code again (20261109_10). */
const ALREADY_REDEEMED_MESSAGE =
  "سبق أن استخدمتَ كود الدعوة هذا من حسابك، ولا يُستخدم الكود الواحد أكثر من مرة للحساب نفسه";

/** PostgREST / Postgres codes meaning "20261109_10 has not run on this database yet". */
function isMissingRedeemFunction(code: string | undefined): boolean {
  return code === "PGRST202" || code === "42883" || code === "42P01";
}

let legacyRedeemLogged = false;

/**
 * public.redeem_library_invitation (20261109_10): the whole redeem in one
 * transaction, one redemption per (code, account). Returns the response, or
 * null when the function is not there yet — the caller then runs the old flow.
 * A failure inside the function rolled everything back, so the code was not
 * spent; the raw database error is logged, never sent.
 */
async function redeemAtomically(admin: ServiceClient, userId: string, code: string): Promise<NextResponse | null> {
  const { data, error } = await admin.rpc("redeem_library_invitation", { p_user: userId, p_code: code });
  if (error) {
    if (isMissingRedeemFunction(error.code)) {
      if (!legacyRedeemLogged) {
        legacyRedeemLogged = true;
        console.warn(
          "[library/invitations/redeem] public.redeem_library_invitation is missing (20261109_10 not applied): using the old flow, which does not record redemptions",
        );
      }
      return null;
    }
    if (error.code === "23505") {
      return NextResponse.json({ error: ALREADY_REDEEMED_MESSAGE }, { status: 400 });
    }
    console.error("[library/invitations/redeem] redeem_library_invitation failed:", error.code, error.message);
    return NextResponse.json(
      { error: "تعذّر تفعيل اشتراك المكتبة. لم يُستهلك كود الدعوة، حاول مرة أخرى لاحقاً." },
      { status: 400 },
    );
  }

  const row = (data ?? null) as { result?: unknown; days?: unknown; ends_at?: unknown } | null;
  switch (row?.result) {
    case "ok":
      if (typeof row.ends_at === "string") {
        return NextResponse.json({
          ok: true,
          tier: "library",
          days: typeof row.days === "number" ? row.days : DEFAULT_INVITE_GRANT_DAYS,
          until: new Date(row.ends_at).toISOString(),
        });
      }
      break;
    case "invalid":
      return NextResponse.json({ error: "كود الدعوة غير صالح" }, { status: 400 });
    case "expired":
      return NextResponse.json({ error: "انتهت صلاحية كود الدعوة" }, { status: 400 });
    case "exhausted":
      return NextResponse.json({ error: "تم استنفاد عدد مرات استخدام كود الدعوة" }, { status: 400 });
    case "already_redeemed":
      return NextResponse.json({ error: ALREADY_REDEEMED_MESSAGE }, { status: 400 });
  }
  console.error("[library/invitations/redeem] redeem_library_invitation answered an unexpected shape:", JSON.stringify(row));
  return NextResponse.json({ error: "تعذّر تفعيل اشتراك المكتبة، حاول مرة أخرى لاحقاً." }, { status: 500 });
}
