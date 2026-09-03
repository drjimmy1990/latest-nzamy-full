"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { createWorkflowRequest } from "@/lib/services/workflowService";
import { apiMutate, isSupabaseMode } from "@/lib/services/api";
import { createWorkflowId } from "@/lib/workflowStore";
import { getLawyerClients, type LawyerClient } from "@/lib/services/lawyerClientsService";
import type { UserType, UserTier } from "@/hooks/useUser";

interface Props {
  onClose: () => void;
  isDark: boolean;
  /**
   * Current user context from the parent page (useUser()).
   *
   * REQUIRED — it used to be optional, and a caller that omitted it saved
   * `assigned_to: null`. That is not a cosmetic default: /dashboard/lawyer and
   * every «قضاياي» filter select on the lawyer's own id, so an unowned case
   * disappeared from the board it was created on, and the row's shape
   * (`assigned_to IS NULL` + `status='pending_assignment'` + receiver='lawyer')
   * is exactly what the marketplace browse policy opens to every OTHER verified
   * lawyer. Making the prop required turns that into a compile error at the call
   * site instead of a lost case; `userId` is re-checked at save time because the
   * session can still be resolving when the modal opens.
   */
  user: { userId?: string; name: string; userType: UserType; tier: UserTier };
}

type Priority = "critical" | "high" | "normal";

export default function AddCaseModal({ onClose, isDark, user }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Controlled inputs
  const [clientName, setClientName] = useState("");
  const [title, setTitle] = useState("");
  const [court, setCourt] = useState("المحكمة التجارية");
  const [assignee, setAssignee] = useState("أنا فقط");
  const [priority, setPriority] = useState<Priority>("normal");
  const [description, setDescription] = useState("");

  // Optional client picker (Phase 2 — public.lawyer_clients). Only cards
  // ("source: 'card'") are offered: a "profile" row has no id in
  // lawyer_clients yet, so it cannot be linked via lawyerClientId. The
  // free-text name field above stays the fallback path when nothing is
  // picked, or while the list is loading/unreadable.
  const [clientCards, setClientCards] = useState<LawyerClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsUnreadable, setClientsUnreadable] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const read = await getLawyerClients();
      if (cancelled) return;
      if (!read.ok) {
        setClientsUnreadable(true);
        setClientsLoading(false);
        return;
      }
      setClientCards(read.items.filter((c) => c.source === "card"));
      setClientsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  function handleClientPick(id: string) {
    setSelectedClientId(id);
    const picked = clientCards.find((c) => c.id === id);
    if (picked) setClientName(picked.name);
  }

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
    isDark
      ? "border-white/[0.08] bg-zinc-800 text-zinc-200"
      : "border-zinc-200 bg-zinc-50 text-zinc-800"
  }`;

  const priorityBtn = (key: Priority, label: string, activeCls: string) => (
    <button
      type="button"
      onClick={() => setPriority(key)}
      className={`rounded-xl border py-2 text-[12px] font-bold transition-all ${priority === key ? activeCls : isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-500" : "border-slate-200 bg-slate-50 text-slate-500"}`}
    >
      {label}
    </button>
  );

  async function handleSave() {
    // See the `user` prop doc: an unowned row is a lost case AND a row other
    // lawyers can read. Refuse rather than write one.
    if (!user.userId) {
      setError("تعذّر تحديد حسابك. أعد تحميل الصفحة ثم حاول مرة أخرى.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = createWorkflowId();
      const payload = {
        id,
        type: "service" as const,
        title: title.trim() || `قضية — ${clientName.trim() || "عميل نظامي"}`,
        description: description.trim(),
        receiver: "lawyer" as const,
        status: "pending_assignment" as const,
        requester: {
          userId: user.userId,
          name: clientName.trim() || user.name || "عميل نظامي",
          role: user.userType ?? "lawyer",
          tier: user.tier ?? "free",
        },
        payment: { amount: 0, status: "not_required" as const },
        sourcePath: "",
        metadata: { court, priority, assignee },
        assignedTo: user.userId,
        ...(selectedClientId ? { lawyerClientId: selectedClientId } : {}),
      };

      // Same reason as AddHearingModal: createWorkflowRequest() swallows a
      // failed POST and writes to localStorage instead
      // (workflowService.ts:54-57), so it resolves on a 401/500/RLS refusal and
      // this catch could never fire — the lawyer read «تم إضافة القضية بنجاح»
      // over a case that reached no database. Go straight to the API in supabase
      // mode so a non-2xx throws; demo mode keeps the local store, which there
      // is the real backend and genuinely reads back.
      if (isSupabaseMode) {
        await apiMutate("/api/v1/service-requests", "POST", payload);
      } else {
        await createWorkflowRequest(payload);
      }
      setDone(true);
      window.dispatchEvent(new CustomEvent("nzamy-workflow-updated"));
    } catch (err) {
      console.error("[AddCaseModal] save failed:", err);
      setError(
        err instanceof Error && err.message
          ? `تعذّر إضافة القضية: ${err.message}`
          : "تعذّر إضافة القضية. تحقّق من الاتصال ثم أعد المحاولة.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -10 }}
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>إضافة قضية جديدة</h3>
          <button onClick={onClose} className={`flex h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
            <XCircle size={16} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} weight="fill" className="text-emerald-500" />
            </div>
            <p className={`font-bold text-[16px] ${isDark ? "text-white" : "text-zinc-900"}`}>تم إضافة القضية بنجاح!</p>
            <p className={`text-[12px] mt-1 mb-4 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>تم إدراجها في قائمة قضاياك النشطة.</p>
            <button onClick={onClose} className="rounded-xl px-5 py-2 text-[13px] font-bold bg-[#0B3D2E] text-white">إغلاق</button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className={`rounded-xl px-3 py-2 text-[12px] font-semibold ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {error}
              </div>
            )}
            {step === 1 && (
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                {!clientsUnreadable && (clientsLoading || clientCards.length > 0) && (
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>اختيار من قائمة الموكّلين (اختياري)</label>
                    <select
                      value={selectedClientId}
                      onChange={e => handleClientPick(e.target.value)}
                      disabled={clientsLoading}
                      className={inputCls}
                    >
                      <option value="">
                        {clientsLoading ? "جارٍ تحميل الموكّلين..." : "— بدون اختيار (اكتب الاسم يدوياً) —"}
                      </option>
                      {clientCards.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>اسم الموكل</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={e => { setClientName(e.target.value); if (selectedClientId) setSelectedClientId(""); }}
                    placeholder="اختر الموكل أو أضف موكلاً جديداً..."
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>عنوان القضية</label>
                  <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="مثال: مطالبة مالية - مؤسسة العليان" className={inputCls} />
                </div>
                <div>
                  <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>المحكمة المختصة</label>
                  <select value={court} onChange={e => setCourt(e.target.value)} className={inputCls}>
                    <option>المحكمة التجارية</option>
                    <option>المحكمة العامة</option>
                    <option>المحكمة العمالية</option>
                  </select>
                </div>
                <button onClick={() => setStep(2)} className="w-full rounded-xl bg-[#0B3D2E] py-2.5 text-[13px] font-bold text-white mt-2">التالي</button>
              </motion.div>
            )}
            {step === 2 && (
              <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                <div>
                  <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>إسناد إلى المحامي</label>
                  <select value={assignee} onChange={e => setAssignee(e.target.value)} className={inputCls}>
                    <option>أنا فقط</option>
                    <option>فريق العمل</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>مستوى الأهمية / الاستعجال</label>
                  <div className="grid grid-cols-3 gap-2">
                    {priorityBtn("critical", "حرجة", "border-red-500/30 bg-red-500/10 text-red-500")}
                    {priorityBtn("high", "عاجلة", "border-amber-500/30 bg-amber-500/10 text-amber-500")}
                    {priorityBtn("normal", "طبيعية", "border-blue-500/30 bg-blue-500/10 text-blue-500")}
                  </div>
                </div>
                <div>
                  <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>وصف القضية</label>
                  <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="ملخص موجز عن القضية وطلب الموكل..." className={`${inputCls} resize-none`} />
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setStep(1)} className={`flex-1 rounded-xl py-2.5 text-[13px] font-bold ${isDark ? "bg-white/[0.08] text-zinc-300" : "bg-slate-100 text-slate-600"}`}>رجوع</button>
                  <button onClick={handleSave} disabled={saving} className="flex-1 rounded-xl bg-[#0B3D2E] text-[#C8A762] py-2.5 text-[13px] font-bold disabled:opacity-50">
                    {saving ? "جارٍ الحفظ..." : "حفظ واعتماد"}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}