"use client";

/**
 * Owner package 25 Nov, §٧.٤ (l16 D-04) — «إلغاء الطلب» on every open order
 * card, not only inside the «قيد المراجعة» block.
 *
 * The admin route already cancels from any open status
 * (PATCH /api/v1/admin/service-orders/[id] { action: "cancel" } — service
 * role, refuses a completed or cancelled order); only the button was missing
 * for an order that still waits (بانتظار الاستلام / بانتظار السداد / مُسند).
 *
 * Two steps, so a stray click cancels nothing: «إلغاء الطلب» opens the reason
 * box, «تأكيد الإلغاء» sends it. The reason is sent to the client as the
 * cancellation reason (the same metadata.cancelReason the in-review block
 * writes). A paid order is not refunded by a cancellation: the box says so.
 */
import { useState } from "react";
import { cancelBoxShown, orderLooksPaid } from "./pendingOrderCancel";

export default function PendingOrderCancelBox({
  order,
  isDark,
  busy,
  onCancel,
}: {
  order: { status: string; payment?: unknown; metadata?: Record<string, unknown> };
  isDark: boolean;
  busy: boolean;
  onCancel: (reason: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  if (!cancelBoxShown(order.status)) return null;
  const paid = orderLooksPaid(order);

  if (!confirming) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setConfirming(true)}
        className="rounded-xl border border-red-500/30 px-4 py-2 text-[12px] font-bold text-red-500 disabled:opacity-40"
      >
        إلغاء الطلب
      </button>
    );
  }

  return (
    <div className={`space-y-2 rounded-xl border p-3 ${isDark ? "border-red-500/25 bg-red-500/[0.05]" : "border-red-200 bg-red-50"}`}>
      <p className={`text-[12px] font-bold ${isDark ? "text-red-300" : "text-red-700"}`}>تأكيد إلغاء الطلب</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="سبب الإلغاء — يظهر للعميل (اختياري)"
        className={`w-full rounded-xl p-2.5 text-[12px] border ${isDark ? "bg-zinc-950 border-white/[0.07] text-zinc-200" : "bg-white border-zinc-200"}`}
      />
      {paid && (
        <p className={`text-[11px] leading-6 ${isDark ? "text-amber-300" : "text-amber-700"}`}>
          هذا الطلب مدفوع: الإلغاء لا يردّ المبلغ تلقائياً. يُردّ المبلغ من صفحة «عمليات الدفع والاسترداد».
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onCancel(reason.trim())}
          className="rounded-xl bg-red-600 px-4 py-2 text-[12px] font-bold text-white disabled:opacity-40"
        >
          تأكيد الإلغاء
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setConfirming(false);
            setReason("");
          }}
          className={`rounded-xl px-4 py-2 text-[12px] font-bold disabled:opacity-40 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}
        >
          تراجع
        </button>
      </div>
    </div>
  );
}
