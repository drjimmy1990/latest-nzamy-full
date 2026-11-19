import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { recordNotification } from "@/lib/notify";
import { validateReply, withReply } from "@/lib/services/ticketReplies";

/**
 * POST /api/v1/admin/tickets/[id]/reply — the support team answers a ticket
 * (file 15 row 53, A1; batch l9). Body: { body: string }.
 *
 * The reply is appended to support_tickets.metadata.replies
 * (src/lib/services/ticketReplies.ts) with a compare-and-set on updated_at:
 * if another write landed between the read and this update, nothing is
 * written and the answer is 409, so no reply is ever lost. A ticket still
 * «open» moves to «pending» (the queue's «جارٍ»). The ticket's owner gets an
 * in-app notification pointing at the settings Help tab, where the reply is
 * shown. Staff role: tickets.manage; every reply is audited.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await requireStaff("tickets.manage");
  if (!gate.ok) return gate.response;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  const v = validateReply(input);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    const db = await createServiceClient();
    const { data: row, error: readError } = await db
      .from("support_tickets")
      .select("id, user_id, subject, status, metadata, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (readError) {
      console.error("[admin/tickets/reply] read failed:", readError.code, readError.message);
      return NextResponse.json({ error: "تعذّرت قراءة التذكرة — لم يُرسل الرد." }, { status: 500 });
    }
    if (!row) return NextResponse.json({ error: "التذكرة غير موجودة" }, { status: 404 });
    const t = row as { id: string; user_id: string | null; subject: string; status: string; metadata: unknown; updated_at: string };

    const at = new Date().toISOString();
    const metadata = withReply(t.metadata, { body: v.body, at, by: gate.userId });
    if (!metadata) {
      return NextResponse.json({ error: "بلغت التذكرة الحد الأقصى للردود — أغلقها وافتح تذكرة جديدة." }, { status: 409 });
    }
    const status = t.status === "open" ? "pending" : t.status;

    const { data: updated, error: writeError } = await db
      .from("support_tickets")
      .update({ metadata, status, updated_at: at })
      .eq("id", id)
      .eq("updated_at", t.updated_at)
      .select("id, status, metadata, updated_at");
    if (writeError) {
      console.error("[admin/tickets/reply] write failed:", writeError.code, writeError.message);
      return NextResponse.json({ error: "تعذّر حفظ الرد — لم يُرسل." }, { status: 500 });
    }
    if (!Array.isArray(updated) || updated.length === 0) {
      return NextResponse.json({ error: "تغيّرت التذكرة أثناء الكتابة — أعد فتحها ثم أرسل الرد مرة أخرى." }, { status: 409 });
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "support_ticket_replied",
      targetType: "support_ticket",
      targetId: id,
      after: { status, reply_length: v.body.length },
    });

    if (t.user_id) {
      await recordNotification({
        userId: t.user_id,
        title: "ردّ فريق الدعم على تذكرتك",
        body: t.subject.slice(0, 160),
        href: "/settings?tab=help",
      });
    }

    return NextResponse.json({ success: true, data: updated[0] });
  } catch (err) {
    console.error("[admin/tickets/reply] unexpected:", err);
    return NextResponse.json({ error: "حدث خطأ أثناء إرسال الرد" }, { status: 500 });
  }
}
