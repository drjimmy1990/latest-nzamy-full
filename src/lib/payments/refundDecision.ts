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
  return { method: now.getTime() - paidAt < 2 * 60 * 60 * 1000 ? "void" as const : "refund" as const, reverse, warnings };
}
/** The admin list shows the refund button only where the route can act. */
export function canOfferRefund(order: { status: string; merchant: string; live: boolean | null }): boolean {
  return order.status === "paid" && order.merchant === "platform" && typeof order.live === "boolean";
}
