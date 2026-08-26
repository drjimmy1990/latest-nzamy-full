import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/v1/documents/[id]/copy — take a copy of a document the caller
 * already owns, unattached to any order.
 *
 * Owner item ٨: «تتاح الوثائق للإرفاق الفوري بنقرة واحدة دون إعادة رفعها من
 * الجهاز» — a company uploads its CR, its articles of association and its
 * signatory list ONCE, then attaches them to every future request without
 * going back to the file picker.
 *
 * WHY A COPY AND NOT A REFERENCE
 * ------------------------------
 * The existing attach mechanism binds a document to an order by writing
 * `request_id` on the attachments row (POST /api/v1/service-requests, the
 * `metaAttachments` block). Applied to a vault document that is exactly a
 * MOVE: the row stops having `request_id = null`, so the vault loses the
 * document the moment it is first used, and the second order can no longer
 * attach it. A company would have to re-upload its CR after every order —
 * precisely the thing the vault exists to stop.
 *
 * Referencing it instead (letting an order point at a still-unbound row) would
 * mean every download and permission check on the order path learning about a
 * second kind of attachment. That is the authorisation surface where this
 * codebase has already had one cross-tenant leak, so it is not the place to
 * add a special case.
 *
 * A copy keeps both models intact: the vault row is untouched, the new row is
 * an ordinary unbound attachment, and the ordinary bind then claims it.
 *
 * The bytes are copied SERVER-SIDE (storage.copy), so a large document does
 * not travel down to the browser and back up again just to be attached.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  // attachments.id is a bigserial. Checked before it reaches a query rather
  // than after, and rejected rather than coerced.
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "معرف المستند غير صالح" }, { status: 400 });
  }

  // The RLS-scoped client on purpose: the caller's own SELECT policy is the
  // first check that they own this row, and the explicit owner_user_id filter
  // below is the second. The service client appears only after ownership is
  // established, and only to write.
  const { data: source } = await supabase
    .from("attachments")
    .select("id, owner_user_id, file_name, storage_path, mime_type, size_bytes")
    .eq("id", id)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!source) {
    return NextResponse.json({ error: "المستند غير موجود" }, { status: 404 });
  }

  const storagePath = String(source.storage_path ?? "");
  // A row whose object was never uploaded (an interrupted upload leaves this
  // possible) must not produce an attachment pointing at nothing.
  if (!storagePath) {
    return NextResponse.json({ error: "لا يوجد ملف مرتبط بهذا المستند" }, { status: 409 });
  }

  const admin = await createServiceClient();

  // Same shape as uploadDocumentFile's key: `${owner}/${timestamp}-${name}`,
  // with the name taken from the SOURCE KEY rather than from file_name —
  // file_name may be Arabic, and a storage key travels in an ASCII-only HTTP
  // header.
  const sourceLeaf = storagePath.slice(storagePath.lastIndexOf("/") + 1) || "file";
  const targetPath = `${user.id}/${Date.now()}-copy-${sourceLeaf}`;

  const { error: copyError } = await admin.storage
    .from("documents")
    .copy(storagePath, targetPath);
  if (copyError) {
    console.error("[documents copy] storage copy failed:", copyError.message);
    return NextResponse.json({ error: "تعذّر نسخ الملف" }, { status: 500 });
  }

  const { data: created, error: insertError } = await admin
    .from("attachments")
    .insert({
      // Deliberately null: the copy is an ordinary unattached document, which
      // is what POST /api/v1/service-requests' bind step requires
      // (`.is("request_id", null)`).
      request_id: null,
      owner_user_id: user.id,
      file_name: source.file_name,
      storage_path: targetPath,
      mime_type: source.mime_type,
      size_bytes: source.size_bytes,
    })
    .select()
    .single();

  if (insertError) {
    // Roll the object back. Without this a failed insert leaves a paid-for
    // orphan in the bucket that nothing will ever reference or clean up.
    await admin.storage.from("documents").remove([targetPath]).catch(() => {});
    console.error("[documents copy] insert failed:", insertError.message);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: created });
}
