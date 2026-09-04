import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";
import { dbErrorResponse } from "../../../_shared";

/**
 * /api/v1/lawyer/contracts/[id]/versions/[vid] — Phase 3 (مدير العقود).
 * DELETE only; GET-by-id is not a screen need (the list already carries
 * everything, and the signed link is its own route — see ./url). See
 * ../../../route.ts.
 */

/**
 * DELETE /api/v1/lawyer/contracts/[id]/versions/[vid] — Response: { ok: true }.
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string; vid: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id, vid } = await context.params;

    // Read the contract's current-version pointer BEFORE deleting. The FK
    // contracts.current_version_id → contract_versions(id) is declared
    // ON DELETE SET NULL, so the moment the DELETE below commits, Postgres
    // has already nulled current_version_id out (if it pointed at vid) —
    // within that same request's own transaction. A re-read AFTER the
    // delete would therefore always see it as already null, and the
    // "was this the current version?" check below would never match. So we
    // capture the "was this current?" fact, and the newest surviving
    // version to fall back to, up front — before vid is gone.
    const { data: contractBefore, error: contractBeforeErr } = await supabase
      .from("contracts").select("id, current_version_id").eq("id", id).maybeSingle();
    if (contractBeforeErr) {
      console.error("[lawyer/contracts versions DELETE] contract read failed:", contractBeforeErr.message, contractBeforeErr.code);
    }
    const wasCurrent = contractBefore?.current_version_id === vid;

    let newestRemainingId: string | null = null;
    if (wasCurrent) {
      const { data: newest, error: newestErr } = await supabase
        .from("contract_versions")
        .select("id")
        .eq("contract_id", id)
        .neq("id", vid)
        .order("version_no", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (newestErr) {
        console.error("[lawyer/contracts versions DELETE] newest lookup failed:", newestErr.message, newestErr.code);
      }
      newestRemainingId = newest?.id ?? null;
    }

    // Bind vid to the [id] in the URL — RLS gates on the version's own
    // contract, so without this a caller who manages a DIFFERENT contract
    // could delete a version through a mismatched URL and this route would
    // then run its current-version fixup against the wrong contract.
    const { data: deletedRows, error } = await supabase
      .from("contract_versions")
      .delete()
      .eq("id", vid)
      .eq("contract_id", id)
      .select("id, storage_path");

    if (error) {
      console.error("[lawyer/contracts versions DELETE] delete failed:", error.message, error.code);
      const { status: httpStatus, message } = dbErrorResponse(error, "النسخة");
      return NextResponse.json({ error: message }, { status: httpStatus });
    }

    const deletedRow = (deletedRows ?? [])[0] as { id: string; storage_path: string } | undefined;
    if (!deletedRow) return NextResponse.json({ error: "النسخة غير موجودة" }, { status: 404 });

    // If this was the contract's current version, point it at the newest
    // remaining one. When none survive, Postgres's own ON DELETE SET NULL
    // already left current_version_id null, so there is nothing left to do.
    if (wasCurrent && newestRemainingId) {
      const { error: updateErr } = await supabase
        .from("contracts").update({ current_version_id: newestRemainingId }).eq("id", id);
      if (updateErr) {
        console.error("[lawyer/contracts versions DELETE] current_version_id reset failed:", updateErr.message, updateErr.code);
      }
    }

    // Best-effort object removal — the row is already gone either way.
    try {
      const service = await createServiceClient();
      const { error: removeErr } = await service.storage.from("documents").remove([deletedRow.storage_path]);
      if (removeErr) console.error("[lawyer/contracts versions DELETE] storage remove failed:", removeErr.message);
    } catch (removeThrow) {
      console.error("[lawyer/contracts versions DELETE] storage remove threw:", removeThrow);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[lawyer/contracts versions DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
