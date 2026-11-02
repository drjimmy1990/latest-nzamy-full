import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import { recordNotification } from "@/lib/notify";
import { fulfillOrder } from "@/lib/payments/fulfillOrder";
import { mergeOrderMetadata } from "@/lib/payments/fulfillCore";
import { fulfilmentNoticeAr } from "@/lib/payments/fulfillDecision";
import { resolveItem } from "@/lib/payments/catalog";
import {
  activationAnswer,
  activationRetryIssue,
  outcomeFromFulfil,
  type FounderOrderRow,
  type RetryOutcome,
} from "@/lib/membership/founderAdmin";

/**
 * POST /api/v1/admin/founder/orders/[id]/activate — «إعادة محاولة التفعيل»
 * (P3 Task 10, ruling R24): a paid founder order that got no seat (seats full,
 * licence not verified yet) is activated once a seat is free or the licence
 * is verified, instead of being refunded.
 *
 * requireStaff("settings.write") first; activationRetryIssue refuses anything
 * but a PAID membership order whose metadata.founder is not 'activated', with
 * no refund under way. Then:
 *   - stamped (fulfilled_at set — every «بانتظار استرداد» order the normal
 *     path finished): founder_activate directly — the resume path would only
 *     answer «already done» for it. On 'activated' the R18 flag clear
 *     (already_entitled → false) and the buyer is told; the last notice they
 *     got said a refund was coming.
 *   - not stamped (a paid order whose fulfilment stopped after the claim):
 *     fulfillOrder({ resume: true }) — the existing resume path, which
 *     grants, clears the flag, stamps and notifies itself (and answers «in
 *     progress» within 10 minutes of the payment).
 * Every attempt that ran is audited with metadata.founder before and after.
 */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_COLUMNS =
  "id, user_id, merchant, kind, item_id, status, total_halalas, refunded_halalas, receipt_number, moyasar_payment_id, paid_at, fulfilled_at, live, metadata";

type OrderRow = FounderOrderRow & { merchant: string | null; item_id: string; moyasar_payment_id: string | null };

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: "معرّف العملية غير صالح" }, { status: 400 });

    const service = await createServiceClient();
    const readOrder = async () => {
      const { data, error } = await service.from("payment_orders").select(ORDER_COLUMNS).eq("id", id).maybeSingle();
      return { order: (data ?? null) as OrderRow | null, error };
    };

    const { order, error: readError } = await readOrder();
    if (readError) {
      console.error("[admin/founder/activate] order read failed:", readError.code);
      return NextResponse.json({ error: "تعذّر قراءة العملية — حاول مجددًا" }, { status: 503 });
    }
    const issue = activationRetryIssue(order);
    if (issue || !order) {
      return NextResponse.json({ error: issue?.error ?? "العملية غير موجودة" }, { status: issue?.status ?? 404 });
    }
    const founderBefore = order.metadata?.founder ?? null;

    let result: RetryOutcome;
    if (order.fulfilled_at) {
      const { data: answer, error: rpcError } = await service.rpc("founder_activate", { p_order: order.id });
      if (rpcError) console.error("[admin/founder/activate] founder_activate failed:", rpcError.code);
      const after = rpcError || answer !== "already" ? null : (await readOrder()).order;
      result = rpcError ? activationAnswer(null, null) : activationAnswer(answer, after?.metadata?.founder ?? null);

      if (result.outcome === "activated") {
        // R18: no longer a refund review — the orders page reads already_entitled.
        if (!(await mergeOrderMetadata(service, order.id, { already_entitled: false }))) {
          result = { ...result, message: `${result.message} تعذّر تحديث علامة «مراجعة الاسترداد» في صفحة المدفوعات — أعد المحاولة لاحقًا.` };
        }
        const item = resolveItem(order.item_id);
        if (order.user_id && item) {
          const notice = fulfilmentNoticeAr({
            kind: item.kind,
            labelAr: item.labelAr,
            receiptNumber: order.receipt_number ?? null,
            alreadyEntitled: false,
          });
          await recordNotification({ userId: order.user_id, title: notice.title, body: notice.body, href: notice.href });
        }
      }
    } else {
      const fulfilled = await fulfillOrder({
        orderId: order.id,
        // a paid order always carries its payment id; the resume path does not refetch by it
        paymentId: order.moyasar_payment_id ?? "admin-retry",
        merchant: order.merchant === "office" ? "office" : "platform",
        resume: true,
      });
      const after = (await readOrder()).order;
      result = outcomeFromFulfil(fulfilled, after?.metadata?.founder ?? null);
    }

    const founderAfter = (await readOrder()).order?.metadata?.founder ?? null;
    await logAdminAction({
      actorId: gate.userId,
      action: "founder_activation_retried",
      targetType: "payment_order",
      targetId: order.id,
      before: { founder: founderBefore, already_entitled: order.metadata?.already_entitled ?? null, stamped: !!order.fulfilled_at },
      after: { founder: founderAfter, outcome: result.outcome, reason: result.reason ?? null },
    });

    const body = { outcome: result.outcome, message: result.message, ...(result.reason ? { reason: result.reason } : {}) };
    return result.status === 200
      ? NextResponse.json(body)
      : NextResponse.json({ error: result.message, ...body }, { status: result.status });
  } catch (err) {
    console.error("[admin/founder/activate] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
