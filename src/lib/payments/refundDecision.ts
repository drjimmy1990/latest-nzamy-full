/**
 * A paid order is voided (not refunded) only within this long of paid_at.
 * Moyasar says a void works for about 2 hours; 90 minutes leaves a margin for
 * clock drift and a slow admin click (B1 final review).
 */
export const VOID_WINDOW_MS = 90 * 60 * 1000;
export interface RefundUsage { pointsUsedFromOrderLot: number; planPointsUsedPct: number }
export interface RefundOrder { status: string; kind: string; paid_at: string | null }
export function refundDecision(order: RefundOrder, now: Date, usage: RefundUsage) {
  const paidAt = order.paid_at ? Date.parse(order.paid_at) : NaN;
  if (order.status !== "paid" || !Number.isFinite(paidAt) || paidAt > now.getTime()) return null;
  if (!["plan", "library", "topup"].includes(order.kind)) return null;
  const reverse: Array<"cancel_plan" | "end_library_grant" | "revoke_lot"> = order.kind === "plan" ? ["cancel_plan", "revoke_lot"] : order.kind === "library" ? ["end_library_grant"] : ["revoke_lot"];
  const warnings: string[] = [];
  if (order.kind === "plan" && usage.planPointsUsedPct > 5) warnings.push("استُخدم أكثر من ٥٪ من نقاط الباقة؛ راجع شروط الانسحاب قبل الاسترداد.");
  if (usage.pointsUsedFromOrderLot > 0) warnings.push("استُخدمت بعض نقاط هذه العملية. تُلغى النقاط المتبقية فقط ولا يصبح الرصيد سالباً.");
  if (order.kind === "library") warnings.push("يُنهي الاسترداد الوصول الذي منحته هذه العملية؛ راجع استخدام المحتوى وشروط الاسترداد.");
  return { method: now.getTime() - paidAt < VOID_WINDOW_MS ? "void" as const : "refund" as const, reverse, warnings };
}
/** The admin list shows the refund button only where the route can act. */
export function canOfferRefund(order: { status: string; merchant: string; live: boolean | null }): boolean {
  return order.status === "paid" && order.merchant === "platform" && typeof order.live === "boolean";
}
