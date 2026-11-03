import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import {
  DELETE_CONFIRM_PHRASE_AR,
  deletionErrorAr,
  freezeStateFromUser,
  isMissingAccountDeletionSchema,
  phraseMatches,
} from "@/lib/auth/accountFreeze";
import {
  DELETION_SCHEMA_MISSING_AR,
  readActiveRequest,
  readOwnerBlock,
  syncFreezeMetadata,
  type DeletionRequestView,
} from "@/lib/accountDeletion/accountDeletionServer";

/**
 * /api/v1/me/account-deletion — D6 (owner ٢٩٨), the account's own deletion.
 *
 *   GET   { data: { available, request, frozen, ownerBlock } }
 *         `ownerBlock` (owner ٣٠٧, 20261030_12): "firm" / "business" /
 *         "government" / "ngo" when the caller owns an entity that still has
 *         members — his deletion is refused until ownership is transferred —
 *         else null (also before 20261030_12 runs).
 *         `available: false` before 20261026_70 runs — Settings then keeps
 *         its «تواصل مع الدعم» panel. Re-syncs the gates' copy
 *         (app_metadata) from the table in both directions, so a hand-run SQL
 *         cancel or a failed metadata write heals on the next read.
 *   POST  { confirm: «احذف حسابي», reason? } → the 60-day freeze.
 *         The request row is written by request_account_deletion() on the
 *         caller's OWN session (auth.uid(); it takes no user id), then the
 *         service role writes app_metadata. A failed metadata write cancels the
 *         request again: the state is never "frozen in the table, not gated".
 *
 * Deliberately NOT behind assertRole and outside /api/v1/{lawyer,admin,firm}/:
 * a frozen account must still reach this route and its /cancel sibling.
 */

function view(row: DeletionRequestView | null) {
  return row
    ? { id: row.id, status: row.status, requestedAt: row.requested_at, purgeAfter: row.purge_after, requestedBy: row.requested_by ?? null }
    : null;
}

export async function GET() {
  const supabase = await createClient();
  const auth = await requireApiUser(supabase, { error: "غير مصرح — يرجى تسجيل الدخول" }, { allowFrozen: true });
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const frozen = freezeStateFromUser(user);

  const active = await readActiveRequest(supabase, user.id);
  if (!active.ok) {
    if (active.schemaMissing) {
      // No table, no freeze: a stale frozen copy is lifted.
      if (frozen.frozen) {
        const service = await createServiceClient();
        await syncFreezeMetadata(service, user.id, { frozen: false, purgeAfter: null });
      }
      return NextResponse.json({ data: { available: false, request: null, frozen: false } });
    }
    console.error("[me/account-deletion] GET failed:", active.error);
    return NextResponse.json({ error: "تعذّر قراءة حالة الحساب الآن." }, { status: 500 });
  }

  const shouldBeFrozen = active.request !== null;
  if (shouldBeFrozen !== frozen.frozen || (shouldBeFrozen && frozen.purgeAfter !== active.request?.purge_after)) {
    const service = await createServiceClient();
    const synced = await syncFreezeMetadata(service, user.id, {
      frozen: shouldBeFrozen,
      purgeAfter: active.request?.purge_after ?? null,
    });
    if (!synced.ok) console.error("[me/account-deletion] GET: re-syncing app_metadata failed:", synced.error);
  }

  // Owner ٣٠٧: an entity owner with members is told why before he types
  // anything (Settings), and the frozen page says the final deletion is
  // suspended. Null before 20261030_12 runs; the request itself is still
  // refused by the database.
  const ownerBlock = await readOwnerBlock(supabase);

  return NextResponse.json({
    data: { available: true, request: view(active.request), frozen: shouldBeFrozen, ownerBlock },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const auth = await requireApiUser(supabase, { error: "غير مصرح — يرجى تسجيل الدخول" }, { allowFrozen: true });
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const body = (await request.json().catch(() => null)) as { confirm?: unknown; reason?: unknown } | null;
  if (!phraseMatches(body?.confirm, DELETE_CONFIRM_PHRASE_AR)) {
    return NextResponse.json({ error: `اكتب «${DELETE_CONFIRM_PHRASE_AR}» للتأكيد.` }, { status: 400 });
  }
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) || null : null;

  const { data, error } = await supabase.rpc("request_account_deletion", { p_reason: reason });
  if (error) {
    if (isMissingAccountDeletionSchema(error.code)) {
      return NextResponse.json({ error: DELETION_SCHEMA_MISSING_AR }, { status: 503 });
    }
    const status = error.code === "42501" ? 403 : error.code === "55000" ? 409 : 500;
    if (status === 500) console.error("[me/account-deletion] POST rpc failed:", error.code, error.message);
    return NextResponse.json({ error: deletionErrorAr(error.message) }, { status });
  }
  const row = data as DeletionRequestView;

  const service = await createServiceClient();
  const synced = await syncFreezeMetadata(service, user.id, { frozen: true, purgeAfter: row.purge_after ?? null });
  if (!synced.ok) {
    console.error("[me/account-deletion] POST: writing app_metadata failed — cancelling the request:", synced.error);
    await supabase.rpc("cancel_account_deletion");
    return NextResponse.json({ error: "تعذّر تجميد الحساب الآن. لم يتغير شيء، أعد المحاولة." }, { status: 500 });
  }

  return NextResponse.json({ data: { available: true, request: view(row), frozen: true } });
}
