"use client";

/**
 * OrderActions.tsx — Task 7.
 *
 * Lets the client cancel their own still-open order. The server already
 * permits this — src/app/api/v1/service-requests/[id]/route.ts:183-210
 * (read, not modified, before writing this component; another agent owns
 * that file this wave):
 *
 *   - Method: PATCH /api/v1/service-requests/[id]
 *   - Body key read for the new status: `patch.status` (the handler does
 *     `const rawPatch = body.patch ?? body`, so a bare `{status:...}` body
 *     also works, but this component sends the `{patch:{status:...}}` shape
 *     to match every other caller of this route, e.g.
 *     createServiceOrder()'s sibling POST).
 *   - Source statuses accepted: for `receiver === "ai_workspace"` orders
 *     (the four AI-fulfilled services this page serves) the gate is
 *     `permitted = isRequester && targetStatus === "cancelled"` — note
 *     there is NO check on the order's *current* status at all, only on who
 *     is asking and what they're asking for. Read literally, the server
 *     would also let a requester "cancel" an already-completed or
 *     already-cancelled order.
 *
 * This component deliberately does NOT expose every status the server would
 * technically accept. It only offers cancel for the three statuses where
 * cancelling is a meaningful, safe action for the client to take —
 * pending_assignment / assigned / in_review (the same "still open" set
 * OrderTimeline's delivery-time card uses). A completed order already has a
 * real deliverable behind it; offering "cancel" there would dangle a button
 * that "succeeds" at the server (no source-status gate stops it) while
 * doing something no client actually wants and this product has no recovery
 * path for. A cancelled order cancelling itself again is a pointless no-op.
 * Both are excluded here as a client-side UX decision, not because the
 * server would refuse them.
 */

import { useState } from "react";
import type { ServiceOrder } from "@/lib/services/serviceOrders";

const CANCELLABLE_STATUSES = new Set<ServiceOrder["status"]>([
  "pending_assignment",
  "assigned",
  "in_review",
]);

export function OrderActions({
  order,
  isDark,
  onCancelled,
}: {
  order: ServiceOrder;
  isDark: boolean;
  onCancelled: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!CANCELLABLE_STATUSES.has(order.status)) return null;

  async function doCancel() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/v1/service-requests/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ patch: { status: "cancelled" } }),
      });
      if (!res.ok) {
        // The route's own refusal body is always Arabic — e.g.
        // "غير مسموح بتنفيذ هذا الإجراء" (403, the permission check this
        // button is scoped to stay inside of) or "لا توجد حقول صالحة
        // للتحديث" (400, malformed patch). Fall back to a fixed Arabic
        // string only if the body itself is missing or unparsable — never
        // fabricate an English message for the client.
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? "تعذّر إلغاء الطلب. حاول مرة أخرى.");
        setBusy(false);
        return;
      }
      // Reload from the server rather than assuming the new state locally —
      // page.tsx already has a load() function for exactly this.
      setConfirming(false);
      onCancelled();
    } catch {
      // Transport-level failure (offline, dropped connection) — never leave
      // the button looking dead with no feedback, same pattern as the
      // existing download()/downloadAttachment() handlers on this page.
      setErr("تعذّر إلغاء الطلب. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2" dir="rtl">
      {confirming ? (
        <div className="flex gap-2">
          <button
            onClick={doCancel}
            disabled={busy}
            className="rounded-xl bg-red-600 px-4 py-2 text-[12px] font-bold text-white disabled:opacity-40"
          >
            تأكيد الإلغاء
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className={`rounded-xl border px-4 py-2 text-[12px] font-bold ${
              isDark ? "border-white/10 text-zinc-300" : "border-zinc-200 text-zinc-600"}`}
          >
            تراجع
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="rounded-xl border border-red-500/30 px-4 py-2 text-[12px] font-bold text-red-500"
        >
          إلغاء الطلب
        </button>
      )}
      {err && <p className="text-[11px] text-red-500">{err}</p>}
    </div>
  );
}
