import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { documentsDbErrorResponse, isValidAttachmentId } from "../../_shared";

const MAX_HOLD_REASON_LEN = 300;

/**
 * PATCH /api/v1/documents/[id]/hold — set or clear a document's legal hold.
 * Body: { legalHold: boolean, holdReason?: string (≤300 chars) }
 *
 * A row already in the bin cannot be PUT ON hold (409) — the DB CHECK
 * (attachments_hold_blocks_delete_check: not (legal_hold and deleted_at is
 * not null)) would reject it anyway, but this is caught before the write so
 * the caller gets the specific Arabic sentence rather than a generic 400 off
 * documentsDbErrorResponse's 23514 branch. Clearing a hold (legalHold:
 * false) is always allowed, bin or not — that combination never violates the
 * CHECK.
 *
 * hold_reason is cleared whenever legalHold is false — a reason with no
 * active hold behind it is stale, not history worth keeping.
 */
export async function PATCH(
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
    if (!isValidAttachmentId(id)) {
      return NextResponse.json({ error: "معرف المستند غير صالح" }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.legalHold !== "boolean") {
      return NextResponse.json({ error: "قيمة الحجز القانوني غير صالحة." }, { status: 400 });
    }

    let holdReason: string | null = null;
    if (body.holdReason !== undefined && body.holdReason !== null) {
      if (typeof body.holdReason !== "string" || body.holdReason.length > MAX_HOLD_REASON_LEN) {
        return NextResponse.json(
          { error: `سبب الحجز غير صالح (بحد أقصى ${MAX_HOLD_REASON_LEN} حرفاً).` },
          { status: 400 },
        );
      }
      holdReason = body.holdReason;
    }

    const { data: doc, error: fetchError } = await supabase
      .from("attachments")
      .select("id, deleted_at")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      console.error("[documents hold] fetch failed:", fetchError.message, fetchError.code);
      return NextResponse.json({ error: "تعذّر تحميل المستند." }, { status: 500 });
    }
    if (!doc) {
      return NextResponse.json({ error: "المستند غير موجود" }, { status: 404 });
    }
    if (body.legalHold === true && doc.deleted_at) {
      return NextResponse.json({ error: "استعد الملف من السلة أولاً" }, { status: 409 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("attachments")
      .update({
        legal_hold: body.legalHold,
        hold_reason: body.legalHold ? holdReason : null,
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (updateError) {
      const mapped = documentsDbErrorResponse(updateError);
      console.error("[documents hold] update failed:", id, updateError.message, updateError.code);
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }
    if (!updated) {
      return NextResponse.json({ error: "غير مصرح لك بتعديل هذا المستند." }, { status: 403 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[documents hold] Unexpected error:", err);
    return NextResponse.json({ error: "تعذّر تحديث حالة الحجز." }, { status: 500 });
  }
}
