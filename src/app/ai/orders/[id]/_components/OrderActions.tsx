"use client";

/**
 * OrderActions.tsx — Task 7.
 *
 * Lets the client cancel their own still-open order. The server both permits
 * and enforces exactly that — src/app/api/v1/service-requests/[id]/route.ts
 * (read, not modified; another agent owns that file this wave):
 *
 *   - Method: PATCH /api/v1/service-requests/[id]
 *   - Body key read for the new status: `patch.status` (route.ts:144 is
 *     `const rawPatch = body.patch ?? body`, so a bare `{status:...}` body
 *     also works, but this component sends the `{patch:{status:...}}` shape
 *     to match every other caller of this route, e.g.
 *     createServiceOrder()'s sibling POST).
 *   - The gate for `receiver === "ai_workspace"` orders (the four
 *     AI-fulfilled services this page serves) is route.ts:255-258 —
 *     `isRequester && targetStatus === "cancelled" &&
 *     canRequesterCancel(String(existing.status ?? ""))`. It checks all
 *     three of *who* is asking, *what* they are asking for, and the order's
 *     *current* status. That last check is owner decision س٢ (20 August),
 *     added by Task 1: cancellation is locked at the server the moment an
 *     order is delivered, and not merely by hiding this button. The source
 *     statuses a requester may cancel from are REQUESTER_CANCELLABLE
 *     (src/lib/services/orderTransitions.ts:115-121 — draft,
 *     pending_assignment, pending_payment, assigned, in_review), and that
 *     set fails closed, so `completed`, `cancelled`, and any status it does
 *     not model are refused with 403 «غير مسموح بتنفيذ هذا الإجراء»
 *     (route.ts:284-287).
 *
 * This component offers cancel on a narrower set than the server would
 * honour: the shared OPEN_ORDER_STATUSES (pending_assignment / assigned /
 * in_review — the same "still open" set OrderTimeline's delivery-time card
 * uses). It has always been a subset of REQUESTER_CANCELLABLE, and the two
 * statuses it withholds are withheld by choice, not by the server: `draft`
 * and `pending_payment` would both be honoured if this button offered them.
 * `completed` and `cancelled` are the opposite case — the server now refuses
 * those, so a cancel button on them would be a control whose action cannot
 * succeed.
 *
 * That does not make the 403 unreachable. This button is gated on
 * `order.status` as captured at page load: an admin can complete the order
 * meanwhile (src/app/api/v1/admin/service-orders/[id]/route.ts:89 — a
 * different route, on a service-role client, that never enters the handler
 * above), and a click from that now-stale tab is exactly what Task 1
 * refuses. Before Task 1 the same click silently cancelled an
 * already-delivered order.
 *
 * What that refusal gets is a *message*, not a re-gate: doCancel renders
 * Arabic copy for it (cancelErrorAr below) but does not reload, so
 * `order.status` stays stale and the button remains on screen, refused again
 * on every further click until the page is reloaded. Reloading here instead
 * would swap the visible failure for a silent one — the parent's reload
 * moves the status to `completed`, this component then returns null, and the
 * error message unmounts with it before it can be read.
 */

import { useState } from "react";
import type { ServiceOrder } from "@/lib/services/serviceOrders";
import { OPEN_ORDER_STATUSES } from "./openOrderStatuses";

const CANCELLABLE_STATUSES = OPEN_ORDER_STATUSES;

/**
 * Map the route's HTTP status to Arabic copy for the client.
 *
 * The response body is deliberately NOT echoed. Two of this route's refusals
 * carry an English `error` string — `{"error":"Unauthorized"}` (401,
 * route.ts:138) and `{"error":"Service request not found"}` (404,
 * route.ts:205-208) — and a 500 returns the raw PostgREST message verbatim
 * (`{ error: error.message }`, route.ts:299), which is English too. Showing
 * any of them would put English in front of an Arabic user.
 *
 * They must not be translated at the route either: those literals are
 * load-bearing elsewhere. src/hooks/useOrderAttachments.ts:28 matches
 * `raw === "Unauthorized"` exactly to produce its own Arabic session-expired
 * copy, so renaming the 401 body would silently break that mapping. Hence
 * the translation lives here, keyed on the status code.
 *
 * Wording is taken from cancelErrorAr in
 * src/app/dashboard/client/requests/page.tsx:628-635 so the two cancel
 * surfaces read alike. Only the fallback differs: that one also covers
 * thrown transport errors and so mentions connectivity, whereas reaching
 * this function at all means the server answered. Of the route's own codes,
 * 400 and 500 fall through to it — and the 400 («لا توجد حقول صالحة
 * للتحديث») is not reachable from this button, which always sends a `status`
 * field, the one key on the route's ALLOWED_PATCH_FIELDS (route.ts:160), so
 * its patch is never empty. Codes the route never emits at all — a 502/504
 * from the platform in front of it — land on the fallback too. The transport
 * case, where no response arrives, is handled separately in doCancel's
 * catch.
 */
function cancelErrorAr(status: number): string {
  if (status === 401) return "انتهت جلستك. سجّل الدخول من جديد ثم أعد المحاولة.";
  if (status === 403) return "لا يمكن إلغاء هذا الطلب في وضعه الحالي.";
  if (status === 404) return "لم يعد هذا الطلب موجوداً.";
  return "تعذّر إلغاء الطلب. حاول مرة أخرى.";
}

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
        // Translate the status code; never echo `body.error`, which is
        // English on 401/404/500 — see cancelErrorAr above. The machine
        // cause is logged for developers only.
        console.error("[OrderActions] cancel refused:", res.status);
        setErr(cancelErrorAr(res.status));
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
