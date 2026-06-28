"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { createWorkflowRequest } from "@/lib/services/workflowService";
import { createWorkflowId } from "@/lib/workflowStore";
import type { UserType, UserTier } from "@/hooks/useUser";

interface Props {
  onClose: () => void;
  isDark: boolean;
  /** Current user context from the parent page (useUser()). */
  user?: { userId?: string; name: string; userType: UserType; tier: UserTier };
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
    setSaving(true);
    setError(null);
    try {
      const id = createWorkflowId();
      await createWorkflowRequest({
        id,
        type: "service",
        title: title.trim() || `قضية — ${clientName.trim() || "عميل نظامي"}`,
        description: description.trim(),
        receiver: "lawyer",
        status: "pending_assignment",
        requester: {
          userId: user?.userId,
          name: clientName.trim() || user?.name || "عميل نظامي",
          role: user?.userType ?? "lawyer",
          tier: user?.tier ?? "free",
        },
        payment: { amount: 0, status: "not_required" },
        sourcePath: "",
        metadata: { court, priority, assignee },
        assignedTo: user?.userId ?? null,
      });
      setDone(true);
      window.dispatchEvent(new CustomEvent("nzamy-workflow-updated"));
    } catch (err) {
      console.error("[AddCaseModal] createWorkflowRequest failed:", err);
      setError("تعذّر إضافة القضية. يرجى المحاولة مرة أخرى.");
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
            <p className={`text-[12px] mt-1 mb-4 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>تم إدراجها في القائمة النشطة مع تعيين فريق العمل.</p>
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
                <div>
                  <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>اسم الموكل</label>
                  <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="اختر الموكل أو أضف موكلاً جديداً..." className={inputCls} />
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