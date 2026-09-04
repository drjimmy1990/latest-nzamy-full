import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { documentsDbErrorResponse, isValidAttachmentId } from "../_shared";

/**
 * DELETE /api/v1/documents/[id] — soft delete by default; permanent with
 * ?permanent=1 (Phase 6, DECISION 3 in 20260906_phase6_settings_out_of_browser.sql).
 *
 * SOFT (default): sets deleted_at = now(), deleted_by = caller via the
 * RLS-scoped client. The new "attachments owner update" policy is what makes
 * this legal — it grants UPDATE to the owner OR a service_requests
 * participant, the same scope attachments_select_policy already grants for
 * SELECT — so this route does not re-check ownership itself; the UPDATE
 * either affects the row (permitted) or affects 0 rows (not permitted / row
 * gone), and both are handled below. A row under legal_hold is refused
 * before the UPDATE is even attempted (409); the DB CHECK
 * (attachments_hold_blocks_delete_check) is the backstop for the race, via
 * documentsDbErrorResponse's 23514 branch.
 *
 * The response is `{ ok: true }` WITHOUT storage_path — the storage object is
 * left in place until the row is purged (cron) or permanently deleted below.
 * This is a deliberate change from the old contract (which returned
 * storage_path so the client could remove the object itself): a soft
 * delete must not delete the object.
 *
 * PERMANENT (?permanent=1): only for a row already in the bin (deleted_at
 * set) and not on legal hold. There is no DELETE policy on `attachments` for
 * the RLS-scoped client (never has been — the table has SELECT/INSERT/UPDATE
 * policies only), so both the storage removal and the row delete use
 * createServiceClient(), and only after the RLS-scoped read above has already
 * established the caller may see this row at all.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "غير مصرح — يرجى تسجيل الدخول" }, { status: 401 });
    }

    const { id } = await params;
    // attachments.id is a bigserial, not a uuid — reject before it reaches PostgREST.
    if (!isValidAttachmentId(id)) {
      return NextResponse.json({ error: "معرف المستند غير صالح" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const permanent = searchParams.get("permanent") === "1";

    // RLS-scoped read: this is also the ownership check — attachments_select_policy
    // only returns rows the caller owns or participates in.
    const { data: doc, error: fetchError } = await supabase
      .from("attachments")
      .select("id, storage_path, deleted_at, legal_hold")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      console.error("[documents DELETE] fetch failed:", fetchError.message, fetchError.code);
      return NextResponse.json({ error: "تعذّر تحميل المستند." }, { status: 500 });
    }
    if (!doc) {
      return NextResponse.json({ error: "المستند غير موجود" }, { status: 404 });
    }

    if (permanent) {
      if (!doc.deleted_at) {
        return NextResponse.json(
          { error: "لا يمكن الحذف النهائي إلا لمستند موجود في السلة" },
          { status: 409 },
        );
      }
      if (doc.legal_hold) {
        return NextResponse.json({ error: "الملف تحت حجز قانوني ولا يمكن حذفه" }, { status: 409 });
      }

      const admin = await createServiceClient();

      if (doc.storage_path) {
        const { error: removeError } = await admin.storage.from("documents").remove([doc.storage_path]);
        if (removeError) {
          // Logged, not fatal: an orphaned storage object is this codebase's
          // accepted leftover elsewhere (see deleteDocument in
          // documentService.ts) — worse would be a row nobody can ever purge
          // because a flaky storage call keeps blocking the delete.
          console.error("[documents DELETE permanent] storage remove failed:", id, removeError.message);
        }
      }

      const { error: deleteRowError } = await admin.from("attachments").delete().eq("id", id);
      if (deleteRowError) {
        console.error("[documents DELETE permanent] row delete failed:", id, deleteRowError.message, deleteRowError.code);
        return NextResponse.json({ error: "تعذّر الحذف النهائي للمستند." }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    // ── soft delete ──────────────────────────────────────────────────────
    if (doc.legal_hold) {
      return NextResponse.json({ error: "الملف تحت حجز قانوني ولا يمكن حذفه" }, { status: 409 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("attachments")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (updateError) {
      const mapped = documentsDbErrorResponse(updateError);
      console.error("[documents DELETE] soft-delete update failed:", id, updateError.message, updateError.code);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    if (!updated) {
      // The read above succeeded but the UPDATE matched 0 rows — the RLS
      // UPDATE policy is narrower than SELECT is not expected here (both are
      // owner-or-participant), but a row deleted between the two reads by
      // another caller looks the same from here, so this is answered as
      // "not permitted" rather than guessing which.
      return NextResponse.json({ error: "غير مصرح لك بحذف هذا المستند." }, { status: 403 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[documents DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر حذف المستند." }, { status: 500 });
  }
}
