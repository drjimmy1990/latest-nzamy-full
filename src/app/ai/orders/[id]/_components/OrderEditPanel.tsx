"use client";

import { useState } from "react";
import { PencilSimple } from "@phosphor-icons/react";
import type { ServiceOrder } from "@/lib/services/serviceOrders";
import { evaluateOrderEditability, MAX_EDIT_LENGTH } from "@/lib/services/orderEditGate";

/**
 * «تعديل الطلب قبل بدء التنفيذ» — owner item ٥.
 *
 * A client who mistypes a date has, until now, two options: cancel the order
 * and fill the whole form again, or message support. This is the third.
 *
 * The window is decided by evaluateOrderEditability() — the SAME function the
 * PATCH handler calls. Not a re-implementation of it: a second copy of the
 * rule is how a button comes to offer something the server refuses, and this
 * particular rule has a trap in it (a routed order keeps its
 * `pending_assignment` status, so status alone is not the answer).
 *
 * Renders nothing at all when the window has closed — no disabled button, no
 * greyed-out «تعديل». A control that is visible but dead invites the client to
 * keep clicking it; the order page's other actions behave the same way.
 */
export function OrderEditPanel({
  order,
  userId,
  isDark,
  onSaved,
}: {
  order: ServiceOrder;
  /** The signed-in client. Absent while the session is still resolving. */
  userId: string | null;
  isDark: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(order.description ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const gate = evaluateOrderEditability({
    requesterUserId: userId,
    callerUserId: userId ?? "",
    status: order.status,
    assignedTo: order.assigned_to ?? null,
    metadata: order.metadata as Record<string, unknown> | null,
  });
  if (!userId || !gate.editable) return null;

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/v1/service-requests/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ action: "edit_details", description: text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // This handler answers in Arabic on every refusal it owns (the gate
        // message, the length message), so echoing it is safe here — unlike
        // the cancel path, whose 401/404/500 bodies are English. The fallback
        // covers exactly those.
        setErr(typeof body.error === "string" && body.error ? body.error : "تعذّر حفظ التعديل.");
        setBusy(false);
        return;
      }
      setOpen(false);
      onSaved();
    } catch {
      setErr("تعذّر حفظ التعديل. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => { setText(order.description ?? ""); setErr(""); setOpen(true); }}
        className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-[12px] font-bold ${
          isDark ? "border-white/10 text-zinc-300" : "border-zinc-200 text-zinc-600"}`}
        dir="rtl"
      >
        <PencilSimple size={13} weight="bold" />
        تعديل تفاصيل الطلب
      </button>
    );
  }

  return (
    <div className="space-y-2" dir="rtl">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        maxLength={MAX_EDIT_LENGTH}
        placeholder="اكتب تفاصيل طلبك كما تريد أن يقرأها الفريق."
        className={`w-full rounded-xl p-3 text-[12px] leading-relaxed border ${
          isDark ? "bg-zinc-950 border-white/[0.07] text-zinc-200" : "bg-white border-zinc-200 text-zinc-800"}`}
      />
      <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
        يُحفظ النص السابق في سجل الطلب — التعديل لا يمحو ما كتبته أولاً.
      </p>
      {err && <p className="text-[11px] text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy || !text.trim()}
          className="rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-white disabled:opacity-40"
        >
          {busy ? "جارٍ الحفظ…" : "حفظ التعديل"}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={busy}
          className={`rounded-xl border px-4 py-2 text-[12px] font-bold ${
            isDark ? "border-white/10 text-zinc-300" : "border-zinc-200 text-zinc-600"}`}
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}
