import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { documentsDbErrorResponse, isValidAttachmentId } from "../../_shared";

/**
 * POST /api/v1/documents/[id]/restore — pull a document back out of the bin.
 * Sets deleted_at = null, deleted_by = null via the RLS-scoped client (the
 * "attachments owner update" policy, same as the DELETE soft-delete path).
 *
 * A row not currently in the bin is a 409, not a silent no-op — restoring
 * something that was never deleted is a caller error worth surfacing.
 */
export async function POST(
  _request: NextRequest,
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
    if (!isValidAttachmentId(id)) {
      return NextResponse.json({ error: "معرف المستند غير صالح" }, { status: 400 });
    }

    const { data: doc, error: fetchError } = await supabase
      .from("attachments")
      .select("id, deleted_at")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      console.error("[documents restore] fetch failed:", fetchError.message, fetchError.code);
      return NextResponse.json({ error: "تعذّر تحميل المستند." }, { status: 500 });
    }
    if (!doc) {
      return NextResponse.json({ error: "المستند غير موجود" }, { status: 404 });
    }
    if (!doc.deleted_at) {
      return NextResponse.json({ error: "المستند ليس في السلة." }, { status: 409 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("attachments")
      .update({ deleted_at: null, deleted_by: null })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (updateError) {
      const mapped = documentsDbErrorResponse(updateError);
      console.error("[documents restore] update failed:", id, updateError.message, updateError.code);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    if (!updated) {
      return NextResponse.json({ error: "غير مصرح لك باستعادة هذا المستند." }, { status: 403 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[documents restore] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر استعادة المستند." }, { status: 500 });
  }
}
