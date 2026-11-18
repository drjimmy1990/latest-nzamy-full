import type { SupabaseClient } from "@supabase/supabase-js";
import type { MoyasarClient } from "./moyasarClient.ts";
import { refundDecision } from "./refundDecision.ts";
import { BILLING_ORDER_COLUMNS } from "./billingCore.ts";
import { releaseCouponUsage } from "./couponServer.ts";
import { cleanOverrideReason, needsOverride, OVERRIDE_REQUIRED_AR, refundEligibility } from "./refundEligibility.ts";
import { readRefundEvidence } from "./refundEvidence.ts";
import { buildAdminAuditRow } from "../auth/adminAuditRow.ts";
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

/**
 * Batch l7 (decision 10). `enforceEligibility` is passed by the admin refund
 * route: a founder membership — and since batch l8 (owner ٦٤) a library pass
 * or a point top-up — that is not eligible (refundEligibility.ts) is
 * refused unless `overrideReason` holds a typed reason, which is written to
 * admin_audit_events BEFORE the claim (a failed write moves no money). Other
 * callers (none today) keep the old behaviour; a system refund (e.g. a
 * rejected licence) passes its own reason the same way.
 */
export interface RefundOptions { enforceEligibility?: boolean; overrideReason?: unknown }

/** An uncertain gateway outcome leaves the claim in place: never resend blindly. */
export async function refundOrderWith(deps: RefundDeps, orderId: string, actorId: string, confirm: boolean, opts: RefundOptions = {}) {
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
    // l7: a membership is read like every other order (it has no lot today;
    // finish_payment_refund revokes any lot keyed on the order either way).
    const isMembership = order.kind === "membership";
    const lots = await deps.admin.from("points_lots").select("id,points_total,points_left").eq("order_id", orderId);
    if (lots.error) return unavailable();
    const rows = (lots.data ?? []) as Array<{ id: string; points_total: number; points_left: number }>;
    const total = rows.reduce((n,l) => n + l.points_total,0);
    // l7: "used" = the lots' usage ledger rows net of usage_refund — never
    // points_total − points_left, which since 20261127_40 also counts points
    // emptied by EXPIRY. A failed ledger read falls back to that difference
    // and marks the verdict unverified (fail closed).
    let used = rows.reduce((n,l) => n + l.points_total - l.points_left,0);
    let lotsReadFailed = false;
    if (rows.length) {
      const ledger = await deps.admin.from("points_ledger").select("delta,reason").in("lot_id", rows.map(l => l.id)).in("reason", ["usage", "usage_refund"]);
      if (ledger.error) lotsReadFailed = true;
      else used = Math.max(0, ((ledger.data ?? []) as Array<{ delta: unknown }>).reduce((n, r) => n - (Number.isSafeInteger(r.delta) ? r.delta as number : 0), 0));
    }
    const decision = refundDecision(order, deps.now?.() ?? new Date(), { pointsUsedFromOrderLot: used, planPointsUsedPct: total ? used * 100 / total : 0 });
    if (!decision) return fail(409, "هذه العملية غير متاحة للاسترداد");
    // A claim already in flight (money may have moved) is finished, never re-judged.
    const pending = order.metadata?.refund_job as RefundJob | undefined;
    const fresh = !pending || pending.state === "retryable";
    const now = deps.now?.() ?? new Date();
    const verdict = !confirm || fresh ? refundEligibility(order, now, await readRefundEvidence(deps.admin, order, { total, used, readFailed: lotsReadFailed })) : null;
    if (!confirm) return { status: 200, body: { review: true, method: decision.method, warnings: decision.warnings, totalHalalas: order.total_halalas, eligibility: verdict } };
    if (fresh && opts.enforceEligibility && verdict && needsOverride(verdict)) {
      const reason = cleanOverrideReason(opts.overrideReason);
      if (!reason) return { status: 409, body: { error: OVERRIDE_REQUIRED_AR, eligibility: verdict } };
      const audit = await deps.admin.from("admin_audit_events").insert(buildAdminAuditRow({
        actorId, action: "payment_refund_eligibility_override", targetType: "payment_order", targetId: order.id,
        before: { verdict: verdict.state, reasons: verdict.reasons },
        metadata: { reason, kind: order.kind, days_since_payment: verdict.daysSincePayment, evidence: verdict.lines },
      }, null));
      if (audit.error) return unavailable();
    }
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
    // P3: the founder seat goes BEFORE the atomic finish. finish flips the order
    // to refunded and a retry is then refused at the status check, so a revoke
    // after it could never be retried. An error here leaves the order paid with
    // the claim in place: the retry skips the gateway (already reversed),
    // revokes ('none' the second time) and finishes.
    if (isMembership) {
      const revoked = await deps.admin.rpc("founder_revoke", { p_order: order.id, p_reason: "refund" });
      if (revoked.error) return unavailable();
    }
    const finished = await deps.admin.rpc("finish_payment_refund", { p_order: order.id, p_token: job.token, p_method: job.method });
    if (finished.error || !finished.data?.done) return unavailable();
    // l7: the VAT credit note for this reversal (void or refund), idempotent —
    // a duplicate finish fills a gap. Missing (SQL 20261127_30 not run) or
    // failed: the refund stands; the orders page offers «إصدار الإشعار الدائن».
    let creditNote: string | null = null;
    try {
      const note = await deps.admin.rpc("issue_payment_credit_note", { p_order: order.id });
      if (note.error) console.error("[refund] credit note not issued:", order.id, note.error.code);
      else creditNote = typeof (note.data as { number?: unknown } | null)?.number === "string" ? (note.data as { number: string }).number : null;
    } catch { console.error("[refund] credit note not issued:", order.id, "exception"); }
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
    return { status: 200, body: { refunded: true, creditNote } };
  } catch { return unavailable(); }
}
