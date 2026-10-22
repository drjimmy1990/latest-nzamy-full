import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { createServiceClient } from "@/lib/supabase/server";
import { riyadhFilterIso } from "@/lib/payments/adminOrderFilters";

export async function GET(request: Request) {
  const gate = await requireStaff("payments.read");
  if (!gate.ok) return gate.response;
  const params = new URL(request.url).searchParams;
  try {
    const admin = await createServiceClient();
    let query = admin.from("payment_orders").select("id,user_id,merchant,item_id,kind,status,total_halalas,refunded_halalas,receipt_number,created_at,paid_at,fulfilled_at,live,metadata").order("created_at", { ascending: false }).limit(100);
    const status = params.get("status");
    if (status) {
      if (!["created","initiated","paid","failed","refunded","voided","cancelled"].includes(status)) return NextResponse.json({ error: "الحالة غير صالحة" }, { status: 400 });
      query = query.eq("status",status);
    }
    const user = params.get("user");
    if (user && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user)) return NextResponse.json({ error: "معرّف المستخدم غير صالح" }, { status: 400 });
    if (user) query = query.eq("user_id",user);
    // datetime-local has no zone: read it as Riyadh time (+03:00).
    for (const [key,op] of [["from","gt"],["to","lt"]] as const) {
      const date = params.get(key);
      if (!date) continue;
      const iso = riyadhFilterIso(date);
      if (!iso) return NextResponse.json({ error: "التاريخ غير صالح" }, { status: 400 });
      query = op === "gt" ? query.gt("created_at",iso) : query.lt("created_at",iso);
    }
    const [orders, orphanEvents] = await Promise.all([
      query,
      admin.from("payment_webhook_events").select("event_id,type,payment_id,live,received_at,outcome").eq("outcome","no_order").order("received_at",{ ascending: false }).limit(50),
    ]);
    if (orders.error || orphanEvents.error) return NextResponse.json({ error: "قائمة المدفوعات غير متاحة مؤقتاً" }, { status: 503 });
    const safeOrders = (orders.data ?? []).map(({ metadata, ...order }) => ({ ...order, flags: { paid_unmatched: metadata?.paid_unmatched ?? null, already_entitled: metadata?.already_entitled === true, no_user: metadata?.no_user === true, refund_pending: !!metadata?.refund_job && metadata.refund_job.state !== "done" } }));
    return NextResponse.json({ orders: safeOrders, orphanEvents: orphanEvents.data ?? [], canRefund: gate.role === "super_admin" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "قائمة المدفوعات غير متاحة مؤقتاً" }, { status: 503 }); }
}
