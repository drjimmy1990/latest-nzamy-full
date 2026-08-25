"use client";

import { useEffect, useState, useCallback } from "react";
import { DownloadSimple } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { uploadDocumentFile } from "@/lib/services/documentService";
import type { OrderAttachment } from "@/lib/services/orderIntake";
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

  // Task 9b — click-to-fetch-then-open, same pattern as
  // src/app/ai/orders/[id]/page.tsx's download(): never prefetch, never
  // cache the signed URL (it expires in 300s), fetch fresh on every click.
  async function downloadAttachment(orderId: string, attachmentId: string) {
    setErr("");
    try {
      const res = await fetch(
        `/api/v1/service-requests/${orderId}/attachments/${encodeURIComponent(attachmentId)}`,
      );
      if (!res.ok) {
        setErr((await res.json().catch(() => ({}))).error ?? "تعذّر التحميل");
        return;
      }
      const { url } = await res.json();
      window.open(url, "_blank");
    } catch {
      setErr("تعذّر التحميل. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.");
    }
  }

  // Fix (review finding IMPORTANT 1): `notes` is a single page-level state
  // shared by every order card's deliver/cancel form. Without this reset, an
  // admin who drafts a note for order A and then opens order B without
  // submitting would have A's leftover text sent as B's delivery notes or
  // cancellation reason. Clearing it on every open/close transition — not
  // just on successful submit (act() already does that) — closes that gap.
  const [clientNotes, setClientNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  function toggleOpen(o: AdminOrder) {
    setOpen(open?.id === o.id ? null : o);
    setClientNotes("");
    setInternalNotes("");
    setSelectedFile(null);
  }

  async function handleDeliver(order: AdminOrder) {
    if (!selectedFile) return;
    setBusy(true); setErr("");
    try {
      const doc = await uploadDocumentFile(selectedFile, { requestId: order.id });
      await act(order.id, {
        action: "deliver",
        documentId: doc.id,
        fileName: doc.file_name,
        notes: clientNotes.trim(),
        internalNotes: internalNotes.trim(),
      });
    } catch (e) {
      setErr(uploadErrorMessage(e));
      setBusy(false);
    }
  }

  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <div className="p-5 md:p-7 space-y-4" dir="rtl">
      <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>طلبات الخدمات</h1>

      <div className="flex gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button key={s.key} onClick={() => setFilter(s.key)}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold border transition-all ${
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
        {orders.map((o) => {
          const isOpen = open?.id === o.id;
          return (
            <div key={o.id} className={`${card} transition-all overflow-hidden`}>
              {/* Entire header row is clickable to open/close */}
              <div
                onClick={() => toggleOpen(o)}
                className={`p-4 flex items-center gap-3 cursor-pointer select-none transition-colors ${
                  isOpen ? (isDark ? "bg-white/[0.03]" : "bg-slate-50") : (isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50/50")
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{o.title}</p>
                  <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    {o.profile?.display_name ?? "—"} · {o.profile?.phone ?? "لا يوجد جوال"} · {new Date(o.created_at).toLocaleDateString("ar-SA")}
                  </p>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${
                  isOpen
                    ? isDark ? "border-[#C8A762]/30 bg-[#C8A762]/10 text-[#C8A762]" : "border-amber-200 bg-amber-50 text-amber-800"
                    : isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-zinc-500"
                }`}>
                  {isOpen ? "إغلاق" : "التفاصيل"}
                </span>
              </div>

              {isOpen && (
                <div className="p-4 space-y-4 border-t border-white/[0.06]">
                  {/* Intake summary */}
                  <div>
                    <p className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                      بيانات وموضوع الطلب
                    </p>
                    <pre className={`text-[11px] leading-[1.9] whitespace-pre-wrap p-3.5 rounded-xl overflow-x-auto ${
                      isDark ? "bg-zinc-950 text-zinc-300 border border-white/[0.04]" : "bg-slate-50 text-slate-700 border border-slate-100"}`}>
                      {JSON.stringify(o.metadata?.intake ?? {}, null, 2)}
                    </pre>
                  </div>

                  {/* Client attachments */}
                  {Array.isArray(o.metadata?.attachments) && (o.metadata.attachments as OrderAttachment[]).length > 0 && (
                    <div className="space-y-1.5">
                      <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                        مرفقات العميل ({((o.metadata.attachments as OrderAttachment[]).length)})
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {(o.metadata.attachments as OrderAttachment[])
                          .filter((a) => a && (typeof a.documentId === "string" || typeof a.documentId === "number"))
                          .map((a) => {
                            const documentId = String(a.documentId);
                            return (
                              <button key={documentId} disabled={busy}
                                onClick={() => downloadAttachment(o.id, documentId)}
                                className={`inline-flex items-center gap-2 text-[12px] font-semibold py-1 px-2.5 rounded-lg border text-start transition-colors disabled:opacity-40 ${
                                  isDark ? "border-white/[0.06] bg-zinc-800/50 text-emerald-400 hover:bg-zinc-800" : "border-emerald-100 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-50"}`}>
                                <DownloadSimple size={13} />
                                <span className="underline">{a.name || "مرفق"}</span>
                                {a.size ? <span className="opacity-60 text-[10px]">({Math.max(1, Math.round(a.size / 1024))} كيلوبايت)</span> : null}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Claim button if pending */}
                  {o.status === "pending_assignment" && (
                    <button disabled={busy} onClick={() => act(o.id, { action: "claim" })}
                      className="rounded-xl bg-[#0B3D2E] px-6 py-2.5 text-[12px] font-bold text-[#C8A762] shadow hover:bg-[#0B3D2E]/90 disabled:opacity-40 transition">
                      استلام الطلب والبدء
                    </button>
                  )}

                  {/* Execution panel if in_review */}
                  {o.status === "in_review" && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <p className={`text-[12px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>تنفيذ واعتماد الطلب</p>
                        <button disabled={busy} onClick={() => act(o.id, { action: "claim" })}
                          className="rounded-xl border border-emerald-500/30 px-3 py-1 text-[11px] font-bold text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-40 transition">
                          تولّي الطلب (نقل لي)
                        </button>
                      </div>

                      {/* Client-facing notes */}
                      <div>
                        <label className={`block text-[11px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                          ملاحظات تظهر للعميل مع المستند (اختياري)
                        </label>
                        <textarea value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} rows={2}
                          placeholder="مثال: تم إعداد المذكرة بناءً على آخر تعديلات نظام العمل وإرفاق المبادئ القضائية الداعمة..."
                          className={`w-full rounded-xl p-2.5 text-[12px] outline-none border transition ${
                            isDark ? "bg-zinc-950 border-white/[0.08] text-zinc-200 focus:border-[#C8A762]" : "bg-white border-zinc-200 text-zinc-800 focus:border-[#0B3D2E]"}`} />
                      </div>

                      {/* Internal team notes */}
                      <div>
                        <label className={`block text-[11px] font-semibold mb-1 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                          ملاحظة داخلية للفريق — لا يراها العميل (اختياري)
                        </label>
                        <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2}
                          placeholder="مثال: تم التدقيق بواسطة أ. رامي، المسودة رقم 1..."
                          className={`w-full rounded-xl p-2.5 text-[12px] outline-none border transition ${
                            isDark ? "bg-zinc-950/60 border-white/[0.06] text-zinc-300 focus:border-white/20" : "bg-slate-50 border-zinc-200 text-zinc-700 focus:border-zinc-300"}`} />
                      </div>

                      {/* Branded File Upload Box */}
                      <div className={`p-4 rounded-xl border-2 border-dashed text-center transition-colors ${
                        selectedFile
                          ? isDark ? "border-emerald-500/40 bg-emerald-500/5" : "border-emerald-300 bg-emerald-50/50"
                          : isDark ? "border-white/[0.08] bg-zinc-950/40" : "border-slate-200 bg-slate-50/50"
                      }`}>
                        <input
                          type="file"
                          id={`file-${o.id}`}
                          className="hidden"
                          disabled={busy}
                          accept=".pdf,.doc,.docx"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) setSelectedFile(f);
                          }}
                        />
                        {selectedFile ? (
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-emerald-500 text-sm">📄</span>
                              <span className={`text-[12px] font-bold truncate ${isDark ? "text-emerald-300" : "text-emerald-800"}`}>
                                {selectedFile.name}
                              </span>
                              <span className="text-[10px] opacity-60">({Math.max(1, Math.round(selectedFile.size / 1024))} KB)</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedFile(null)}
                              className="text-[11px] text-red-400 hover:text-red-500 font-semibold"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <label htmlFor={`file-${o.id}`} className="cursor-pointer block">
                            <p className={`text-[12px] font-bold mb-0.5 ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                              اضغط هنا لرفع مسودة المستند النهائي (Word / PDF)
                            </p>
                            <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                              يدعم صيغ .docx, .doc, .pdf
                            </p>
                          </label>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          disabled={busy || !selectedFile}
                          onClick={() => handleDeliver(o)}
                          className="flex-1 rounded-xl bg-[#0B3D2E] py-2.5 text-[12px] font-bold text-[#C8A762] hover:bg-[#092e22] shadow transition disabled:opacity-40"
                        >
                          {busy ? "جارٍ الاعتماد والرفع..." : "اعتماد وتسليم المستند للعميل"}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => act(o.id, { action: "cancel", reason: internalNotes || clientNotes })}
                          className="rounded-xl border border-red-500/30 px-4 py-2.5 text-[12px] font-bold text-red-500 hover:bg-red-500/10 disabled:opacity-40 transition"
                        >
                          إلغاء الطلب
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loadErr && orders.length === 0 && (
          <div className={`${card} p-8 text-center text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>لا توجد طلبات.</div>
        )}
      </div>
    </div>
  );
}
