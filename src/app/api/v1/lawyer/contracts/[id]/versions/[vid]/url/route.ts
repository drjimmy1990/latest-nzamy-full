import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * /api/v1/lawyer/contracts/[id]/versions/[vid]/url — Phase 3 (مدير العقود).
 * A 5-minute signed link. Reading the version row through the RLS client
 * (`can_access_contract`) IS the access check — anyone who can read the row
 * may download the file; signing itself runs on the service client because
 * `documents` is a private bucket. See ../../../../route.ts.
 */

/**
 * GET /api/v1/lawyer/contracts/[id]/versions/[vid]/url — Response: { url } —
 * never 500 for a signing failure, the screen shows «تعذّر إنشاء رابط التنزيل».
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string; vid: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { id, vid } = await context.params;

    const { data: row, error } = await supabase
      .from("contract_versions").select("id, contract_id, storage_path").eq("id", vid).maybeSingle();
    if (error) {
      console.error("[lawyer/contracts versions url GET] read failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل النسخة." }, { status: 500 });
    }
    // Bind vid to the [id] in the URL before signing anything — a mismatch is
    // either tampering or a stale link, and either way gets the same
    // "not found" a hidden row would, never a cross-contract fingerprint.
    if (!row || row.contract_id !== id) {
      return NextResponse.json({ error: "النسخة غير موجودة" }, { status: 404 });
    }

    const service = await createServiceClient();
    const { data: signed, error: signErr } = await service.storage
      .from("documents").createSignedUrl(row.storage_path as string, 300);

    if (signErr || !signed?.signedUrl) {
      console.error("[lawyer/contracts versions url GET] signing failed:", signErr?.message);
      return NextResponse.json({ url: null });
    }

    return NextResponse.json({ url: signed.signedUrl });
  } catch (err) {
    console.error("[lawyer/contracts versions url GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
