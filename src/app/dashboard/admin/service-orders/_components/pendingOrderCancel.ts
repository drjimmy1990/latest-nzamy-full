/**
 * l16 D-04 — which order cards get the «إلغاء الطلب» box of
 * PendingOrderCancelBox.tsx, and whether to warn that the order was paid.
 * Pure (no imports), so `node --test` loads it.
 */

/**
 * Every open status except «قيد المراجعة» (`in_review`), whose block has its
 * own cancel button next to the delivery form. A completed or cancelled order
 * is final (the route refuses it too). An unknown status gets no button.
 */
const CANCELLABLE_WAITING = new Set(["draft", "pending_payment", "pending_assignment", "pending", "assigned"]);

export function cancelBoxShown(status: unknown): boolean {
  return typeof status === "string" && CANCELLABLE_WAITING.has(status);
}

/** True when the order's payment (the column, or a metadata copy) says paid. */
export function orderLooksPaid(order: { payment?: unknown; metadata?: Record<string, unknown> } | null | undefined): boolean {
  const statusOf = (p: unknown) =>
    p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>).status : undefined;
  return statusOf(order?.payment) === "paid" || statusOf(order?.metadata?.payment) === "paid";
}
