"use client";

import { useEffect, useState, useCallback } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { uploadDocumentFile } from "@/lib/services/documentService";
import { uploadErrorMessage } from "./_errorCopy";

interface AdminOrder {
  id: string; title: string; description: string; status: string;
  created_at: string; metadata: Record<string, unknown>;
  profile: { display_name?: string; email?: string; phone?: string } | null;
}

const STATUSES = [
  { key: "", label: "الكل" },
  { key: "pending_assignment", label: "جديدة" },
  { key: "in_review", label: "قيد التنفيذ" },
  { key: "completed", label: "مُسلّمة" },
  { key: "cancelled", label: "ملغاة" },
];

export default function AdminServiceOrdersPage() {
  const { isDark } = useTheme();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<AdminOrder | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loadErr, setLoadErr] = useState("");

  // Deliberate deviation from the brief's literal load(): the original has
  // no error path, so a 403/500/dropped connection leaves `orders` at its
  // previous value (or `[]`) and the page renders "لا توجد طلبات." — visually
  // identical to a genuinely empty queue. This is the one screen whose whole
  // job is telling a human what work exists, so a silent failure here is
  // worse than elsewhere. Mirrors the loading/error split already
  // established in src/app/ai/orders/[id]/page.tsx.
  const load = useCallback(async () => {
    setLoadErr("");
    try {
      const res = await fetch(`/api/v1/admin/service-orders${filter ? `?status=${filter}` : ""}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadErr(body.error ?? "تعذّر تحميل الطلبات");
        return;
      }
      const body = await res.json();
      setOrders(body.data ?? []);
    } catch {
      setLoadErr("تعذّر تحميل الطلبات. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function act(id: string, payload: Record<string, unknown>) {
    setBusy(true); setErr("");
    // Deliberate deviation from the brief's literal act(): the original
    // fetch is unguarded, so a dropped connection throws out of an
    // onClick handler with no catch anywhere in the call chain — busy
    // stays true forever and claim/cancel look permanently disabled with
    // no error shown. try/finally guarantees setBusy(false) always runs.
    try {
      const res = await fetch(`/api/v1/admin/service-orders/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) setErr((await res.json().catch(() => ({}))).error ?? "فشل الإجراء");
      else { setOpen(null); setNotes(""); await load(); }
    } catch {
      setErr("تعذّر تنفيذ الإجراء. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  async function deliver(order: AdminOrder, file: File) {
    setBusy(true); setErr("");
    try {
      const doc = await uploadDocumentFile(file, { requestId: order.id });
      await act(order.id, { action: "deliver", documentId: doc.id, fileName: doc.file_name, notes });
    } catch (e) {
      // Fix (review finding IMPORTANT 3): uploadDocumentFile can throw raw,
      // untranslated causes — see _errorCopy.ts for the full trace and the
      // covering tests. Never render e.message verbatim.
      setErr(uploadErrorMessage(e));
      setBusy(false);
    }
  }

  // Fix (review finding IMPORTANT 1): `notes` is a single page-level state
  // shared by every order card's deliver/cancel form. Without this reset, an
  // admin who drafts a note for order A and then opens order B without
  // submitting would have A's leftover text sent as B's delivery notes or
  // cancellation reason. Clearing it on every open/close transition — not
  // just on successful submit (act() already does that) — closes that gap.
  function toggleOpen(o: AdminOrder) {
    setOpen(open?.id === o.id ? null : o);
    setNotes("");
  }

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <div className="p-5 md:p-7 space-y-4" dir="rtl">
      <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>طلبات الخدمات</h1>

      <div className="flex gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button key={s.key} onClick={() => setFilter(s.key)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold border ${
              filter === s.key ? "bg-[#0B3D2E] text-white border-transparent"
                : isDark ? "border-white/10 text-zinc-400" : "border-zinc-200 text-zinc-500"}`}>
            {s.label}
          </button>
        ))}
      </div>

      {err && <p className="text-[12px] text-red-500">{err}</p>}

      {loadErr && (
        <div className={`${card} p-5 flex items-center justify-between gap-3`}>
          <p className="text-[12px] text-red-500">{loadErr}</p>
          <button onClick={() => load()}
            className="shrink-0 rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-white">
            إعادة المحاولة
          </button>
        </div>
      )}

      <div className="space-y-2">
        {orders.map((o) => (
          <div key={o.id} className={`${card} p-4`}>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{o.title}</p>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                  {o.profile?.display_name ?? "—"} · {o.profile?.phone ?? "لا يوجد جوال"} · {new Date(o.created_at).toLocaleDateString("ar-SA")}
                </p>
              </div>
              <button onClick={() => toggleOpen(o)}
                className={`text-[11px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
                {open?.id === o.id ? "إغلاق" : "التفاصيل"}
              </button>
            </div>

            {open?.id === o.id && (
              <div className="mt-4 space-y-3 border-t pt-4 border-white/[0.06]">
                <pre className={`text-[11px] leading-[1.9] whitespace-pre-wrap p-3 rounded-xl overflow-x-auto ${
                  isDark ? "bg-zinc-950 text-zinc-400" : "bg-slate-50 text-slate-600"}`}>
                  {JSON.stringify(o.metadata?.intake ?? {}, null, 2)}
                </pre>

                {o.status === "pending_assignment" && (
                  <button disabled={busy} onClick={() => act(o.id, { action: "claim" })}
                    className="rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-white disabled:opacity-40">
                    استلام
                  </button>
                )}

                {o.status === "in_review" && (
                  <div className="space-y-2">
                    {/* Fix (review finding IMPORTANT 2): the backend's claim
                        action is an intentional takeover — it re-assigns an
                        in_review order to whoever calls it, specifically so an
                        order stuck with an AWOL admin can be unstuck (see the
                        PATCH handler's own comment). Without this control, a
                        second admin who opens an in_review order they aren't
                        assigned to has no way to become the assignee, so their
                        upload silently 403s at POST /api/v1/documents. */}
                    <button disabled={busy} onClick={() => act(o.id, { action: "claim" })}
                      className="rounded-xl border border-emerald-500/30 px-4 py-2 text-[12px] font-bold text-emerald-500 disabled:opacity-40">
                      تولّي الطلب (نقل لي)
                    </button>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                      placeholder="ملاحظات للعميل (اختياري)"
                      className={`w-full rounded-xl p-2.5 text-[12px] border ${
                        isDark ? "bg-zinc-950 border-white/[0.07] text-zinc-200" : "bg-white border-zinc-200"}`} />
                    <input type="file" disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        // Reset the input so a failed upload can be retried by
                        // re-picking the exact same file — without this, the
                        // browser suppresses onChange for an unchanged value
                        // and the file picker looks dead after an error.
                        e.target.value = "";
                        if (f) deliver(o, f);
                      }}
                      className={`block text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`} />
                    <button disabled={busy} onClick={() => act(o.id, { action: "cancel", reason: notes })}
                      className="rounded-xl border border-red-500/30 px-4 py-2 text-[12px] font-bold text-red-500 disabled:opacity-40">
                      إلغاء الطلب
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {!loadErr && orders.length === 0 && (
          <div className={`${card} p-8 text-center text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>لا توجد طلبات.</div>
        )}
      </div>
    </div>
  );
}
