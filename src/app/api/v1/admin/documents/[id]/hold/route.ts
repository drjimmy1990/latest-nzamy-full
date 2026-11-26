import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { recordNotification } from "@/lib/notify";

const MAX_NOTE_LEN = 500;

/**
 * PATCH /api/v1/admin/documents/[id]/hold — the administration lifts a legal
 * hold on a request file (owner decision س٢٠٣: «رفع الحجز لصاحب الملف أو
 * الإدارة فقط»). Body: { note: string (required, ≤500) }.
 *
 * The admin is not a party of the request, so RLS would not let his session
 * update the row: this route writes with the service role (the hold trigger
 * trg_03_attachments_hold_owner of 20261206_11 trusts it), after
 * requireStaff("orders.manage"). The row's own owner is told, and the action
 * is audited with the written note. Only lifting is offered here — an admin
 * never bins a party's file.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireStaff("orders.manage");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) {
    return NextResponse.json({ error: "معرف المستند غير صالح" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const note = typeof (body as { note?: unknown } | null)?.note === "string"
    ? ((body as { note: string }).note).trim()
    : "";
  if (!note || note.length > MAX_NOTE_LEN) {
    return NextResponse.json(
      { error: `اكتب سبب رفع الحجز (بحد أقصى ${MAX_NOTE_LEN} حرف).` },
      { status: 400 },
    );
  }

  try {
    const admin = await createServiceClient();
    const { data: doc, error: readError } = await admin
      .from("attachments")
      .select("id, request_id, owner_user_id, file_name, legal_hold, hold_reason")
      .eq("id", id)
      .maybeSingle();
    if (readError) {
      console.error("[admin/documents/hold] read failed:", readError.code);
      return NextResponse.json({ error: "تعذّر تحميل المستند." }, { status: 500 });
    }
    if (!doc) return NextResponse.json({ error: "المستند غير موجود" }, { status: 404 });
    if (!doc.legal_hold) {
      return NextResponse.json({ error: "الملف ليس محجوزاً." }, { status: 409 });
    }

    const { error: updateError } = await admin
      .from("attachments")
      .update({ legal_hold: false, hold_reason: null })
      .eq("id", id)
      .eq("legal_hold", true);
    if (updateError) {
      console.error("[admin/documents/hold] update failed:", updateError.code);
      return NextResponse.json({ error: "تعذّر رفع الحجز." }, { status: 500 });
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "attachment_hold_lifted_by_admin",
      targetType: "attachment",
      targetId: String(doc.id),
      before: { legal_hold: true, hold_reason: doc.hold_reason ?? null },
      after: { legal_hold: false },
      metadata: { request_id: doc.request_id ?? null, note },
    });

    if (typeof doc.owner_user_id === "string") {
      await recordNotification({
        userId: doc.owner_user_id,
        title: "رُفع الحجز عن ملفك",
        body: `رفعت الإدارة الحجز القانوني عن الملف «${String(doc.file_name ?? "").trim() || "بلا اسم"}».`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/documents/hold] unexpected:", err);
    return NextResponse.json({ error: "تعذّر رفع الحجز." }, { status: 500 });
  }
}
