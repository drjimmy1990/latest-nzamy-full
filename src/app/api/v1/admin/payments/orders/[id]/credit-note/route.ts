import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";
import { logAdminAction } from "@/lib/auth/adminAudit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/v1/admin/payments/orders/[id]/credit-note — issues (once) the VAT
 * credit note of a refunded / voided platform order (batch l7, decision 10).
 * The refund issues it on its own; this closes a gap (the SQL ran after the
 * refund, or the call failed). issue_payment_credit_note is idempotent: a
 * second call returns the same number and writes no second audit row.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff("payments.refund");
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "العملية غير موجودة" }, { status: 404 });
  try {
    const admin = await createServiceClient();
    const { data, error } = await admin.rpc("issue_payment_credit_note", { p_order: id });
    if (error) {
      if (error.code === "22023") return NextResponse.json({ error: "لا يصدر إشعار دائن لهذه العملية: يلزم أن تكون مستردة أو ملغاة بالكامل، من مدفوعات المنصة، ولها رقم فاتورة" }, { status: 409 });
      if (error.code === "PGRST202" || error.code === "42883") return NextResponse.json({ error: "إصدار الإشعارات الدائنة غير مفعّل بعد في قاعدة البيانات (20261127_30)" }, { status: 503 });
      console.error("[admin/credit-note] issue failed:", id, error.code);
      return NextResponse.json({ error: "تعذّر إصدار الإشعار الدائن مؤقتاً" }, { status: 503 });
    }
    const note = data as { number?: unknown; duplicate?: unknown } | null;
    if (typeof note?.number !== "string") return NextResponse.json({ error: "تعذّر إصدار الإشعار الدائن مؤقتاً" }, { status: 503 });
    if (note.duplicate !== true) {
      await logAdminAction({ actorId: gate.userId, action: "payment_credit_note_issued", targetType: "payment_order", targetId: id, after: { number: note.number } });
    }
    return NextResponse.json({ number: note.number, duplicate: note.duplicate === true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "تعذّر إصدار الإشعار الدائن مؤقتاً" }, { status: 503 });
  }
}
