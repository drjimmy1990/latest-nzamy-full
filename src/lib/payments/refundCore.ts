import type { SupabaseClient } from "@supabase/supabase-js";
import type { MoyasarClient } from "./moyasarClient.ts";
import { refundDecision } from "./refundDecision.ts";
import { BILLING_ORDER_COLUMNS } from "./billingCore.ts";
import { releaseCouponUsage } from "./couponServer.ts";
interface RefundRow { id: string; user_id: string | null; merchant: string; kind: string; status: string; total_halalas: number; paid_at: string | null; fulfilled_at: string | null; moyasar_payment_id: string | null; live: boolean | null; metadata: Record<string, unknown> }
interface RefundJob { token: string; state: string; method: "void" | "refund"; actor_id: string }
export interface RefundDeps {
  admin: SupabaseClient;
  gateway: () => Promise<Pick<MoyasarClient, "mode" | "fetchPayment" | "refund" | "void"> | null>;
  syncTier: (userId: string, tier: string) => Promise<void>;
  notify: (userId: string) => Promise<void>;
  now?: () => Date;
}
const fail = (status: number, error: string) => ({ status, body: { error } });
const unavailable = () => fail(503, "تعذّر إتمام الاسترداد مؤقتاً، حاول مرة أخرى");
/** A permanent refusal: this order's money is not in the platform account. */
export const REFUND_NOT_HERE_AR = "لا يمكن استرداد هذا الطلب من هنا؛ راجع حساب المكتب أو لوحة ميسّر";
/** Card refunds take days to reach the bank account; never claim it is done. */
export const REFUND_NOTICE_AR = {
  title: "بدأ استرداد دفعتك",
  body: "بدأت إعادة المبلغ إلى وسيلة الدفع الأصلية، وقد يستغرق ظهوره في حسابك عدة أيام حسب البنك. وأُلغيت الصلاحيات المرتبطة بهذه العملية.",
};

/** An uncertain gateway outcome leaves the claim in place: never resend blindly. */
export async function refundOrderWith(deps: RefundDeps, orderId: string, actorId: string, confirm: boolean) {
  try {
    const result = await deps.admin.from("payment_orders").select(`${BILLING_ORDER_COLUMNS},user_id,merchant,kind,fulfilled_at,moyasar_payment_id,metadata`).eq("id", orderId).maybeSingle();
    if (result.error) return unavailable();
    const order = result.data as RefundRow | null;
    if (!order) return fail(404, "عملية الدفع غير موجودة");
    if (order.status !== "paid" || !order.fulfilled_at || !order.moyasar_payment_id) return fail(409, "هذه العملية غير متاحة للاسترداد؛ راجع حالة الدفع والتفعيل");
    if (order.merchant !== "platform" || typeof order.live !== "boolean") return fail(409, REFUND_NOT_HERE_AR);
    // A deleted account (metadata.no_user) has no subscription to look up;
    // finish_payment_refund handles the null user.
    if (order.kind === "plan" && order.user_id && !order.metadata?.already_entitled) {
      const granted = await deps.admin.from("subscriptions").select("id,status").eq("metadata->>order_id",order.id).eq("user_id",order.user_id).maybeSingle();
      if (granted.error) return unavailable();
      if (granted.data?.status === "cancelled") return fail(409, "استُبدلت هذه الباقة بعملية لاحقة؛ يلزم مراجعة فترات الاشتراك قبل الاسترداد");
    }
    const lots = await deps.admin.from("points_lots").select("points_total,points_left").eq("order_id", orderId);
    if (lots.error) return unavailable();
    const rows = (lots.data ?? []) as Array<{ points_total: number; points_left: number }>;
    const total = rows.reduce((n,l) => n + l.points_total,0);
    const used = rows.reduce((n,l) => n + l.points_total - l.points_left,0);
    const decision = refundDecision(order, deps.now?.() ?? new Date(), { pointsUsedFromOrderLot: used, planPointsUsedPct: total ? used * 100 / total : 0 });
    if (!decision) return fail(409, "هذه العملية غير متاحة للاسترداد");
    if (!confirm) return { status: 200, body: { review: true, method: decision.method, warnings: decision.warnings, totalHalalas: order.total_halalas } };
    const gateway = await deps.gateway();
    if (!gateway || (gateway.mode === "live") !== order.live) return unavailable();
    let job = order.metadata?.refund_job as RefundJob | undefined;
    if (job?.state === "retryable") job = undefined;
    const fetched = await gateway.fetchPayment(order.moyasar_payment_id);
    if (!fetched.ok) return unavailable();
    const payment = fetched.data;
    if (payment.id !== order.moyasar_payment_id || payment.metadata.order_id !== order.id || payment.amount !== order.total_halalas || payment.currency !== "SAR" || (typeof payment.live === "boolean" && payment.live !== order.live)) return fail(409, "تفاصيل الدفع لا تطابق العملية؛ يلزم مراجعة إدارية");
    const alreadyReversed = !!job && (job.method === "void" ? payment.status === "voided" : payment.status === "refunded" && payment.refunded === order.total_halalas);
    if (job && !alreadyReversed) return fail(409, "الاسترداد قيد المعالجة أو نتيجته غير مؤكدة؛ راجعه لدى مزوّد الدفع قبل أي محاولة جديدة");
    if (!job) {
      if (payment.status !== "paid") return fail(409, "حالة الدفع لدى المزوّد تتطلب مراجعة قبل الاسترداد");
      const claim = await deps.admin.rpc("claim_payment_refund", { p_order: order.id, p_actor: actorId, p_method: decision.method });
      if (claim.error) return unavailable();
      if (!claim.data) return fail(409, "بدأت معالجة هذه العملية بالفعل، حدّث الصفحة");
      job = claim.data as RefundJob;
      const reversed = job.method === "void" ? await gateway.void(order.moyasar_payment_id) : await gateway.refund(order.moyasar_payment_id, order.total_halalas);
      if (!reversed.ok) {
        // Only a definite provider validation rejection releases this claim.
        // Timeouts, network failures and 5xx can follow a successful mutation.
        if (reversed.status === 400 && ["invalid_request", "validation_error"].includes(reversed.type)) {
          await deps.admin.rpc("release_payment_refund", { p_order: order.id, p_token: job.token });
        }
        return fail(502, "لم يؤكد مزوّد الدفع الاسترداد؛ لم تتغير الصلاحيات. راجع العملية قبل المحاولة مجدداً");
      }
      const p = reversed.data;
      if (p.id !== payment.id || p.amount !== order.total_halalas || p.currency !== "SAR"
          || p.metadata.order_id !== order.id || (typeof p.live === "boolean" && p.live !== order.live)
          || !(job.method === "void" ? p.status === "voided" : p.status === "refunded" && p.refunded === order.total_halalas)) return fail(502, "نتيجة الاسترداد غير مؤكدة؛ يلزم مراجعة لدى مزوّد الدفع");
    }
    const finished = await deps.admin.rpc("finish_payment_refund", { p_order: order.id, p_token: job.token, p_method: job.method });
    if (finished.error || !finished.data?.done) return unavailable();
    // P7 review (finding 5): a void inside the 90-minute window gives the
    // coupon back (its coupon_usage row goes; the voided order leaves the
    // counted set). A later refund keeps it used. Never fails the refund;
    // runs on a duplicate finish too (idempotent).
    if (job.method === "void" && order.metadata?.coupon) await releaseCouponUsage(deps.admin, order.id);
    if (order.user_id && order.kind === "plan") {
      try { await deps.syncTier(order.user_id, finished.data.tier ?? "free"); }
      catch { console.error("[refund] tier metadata sync failed:", order.id); }
    }
    if (order.user_id && !finished.data.duplicate) {
      try { await deps.notify(order.user_id); }
      catch { console.error("[refund] notification failed:", order.id); }
    }
    return { status: 200, body: { refunded: true } };
  } catch { return unavailable(); }
}
