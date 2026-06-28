"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

type Urgency = "critical" | "high" | "normal";

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "hearing",      label: "جلسة قضائية" },
  { value: "deadline",     label: "موعد طعن / نهائي" },
  { value: "gov_review",   label: "مراجعة جهة حكومية" },
  { value: "client_meet",  label: "اجتماع موكل" },
  { value: "internal",     label: "أخرى" },
];

export default function AddHearingModal({ onClose, isDark, user }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Controlled inputs
  const [type, setType] = useState("");
  const [caseName, setCaseName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("normal");
  const [location, setLocation] = useState("");

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
    isDark
      ? "border-white/[0.08] bg-zinc-800 text-zinc-200 focus:border-[#C8A762]"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 focus:border-[#0B3D2E]"
  }`;

  const urgencyBtn = (key: Urgency, label: string, activeCls: string) => (
    <button
      type="button"
      onClick={() => setUrgency(key)}
      className={`rounded-xl border py-2 text-[12px] font-bold transition-all focus:ring-2 focus:ring-offset-0 ${urgency === key ? activeCls : isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-300" : "border-slate-200 bg-white text-slate-600"}`}
    >
      {label}
    </button>
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const id = createWorkflowId();
      const typeLabel = TYPE_OPTIONS.find(t => t.value === type)?.label ?? "جلسة";
      await createWorkflowRequest({
        id,
        type: "service",
        title: caseName.trim() ? `جلسة — ${caseName.trim()}` : typeLabel,
        description: notes.trim(),
        receiver: "lawyer",
        status: "pending_assignment",
        requester: {
          userId: user?.userId,
          name: user?.name || "محامي نظامي",
          role: user?.userType ?? "lawyer",
          tier: user?.tier ?? "free",
        },
        payment: { amount: 0, status: "not_required" },
        sourcePath: "",
        metadata: { date, time, type, urgency, location, notes, caseName },
        assignedTo: user?.userId ?? null,
      });
      setDone(true);
      window.dispatchEvent(new CustomEvent("nzamy-workflow-updated"));
    } catch (err) {
      console.error("[AddHearingModal] createWorkflowRequest failed:", err);
      setError("تعذّر إضافة الموعد. يرجى المحاولة مرة أخرى.");
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
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>إضافة موعد / جلسة جديدة</h3>
          <button onClick={onClose} className={`flex h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400 hover:text-white" : "bg-zinc-100 text-zinc-500 hover:text-black"}`}>
            <XCircle size={16} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} weight="fill" className="text-emerald-500" />
            </div>
            <p className={`font-bold text-[16px] flex-col ${isDark ? "text-white" : "text-zinc-900"}`}>تم إضافة الموعد بنجاح!</p>
            <p className={`text-[12px] mt-1 mb-4 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              تم تسجيل الموعد في جدول أعمالك ومزامنته مع التقويم.
            </p>
            <button onClick={onClose} className="rounded-xl px-5 py-2.5 w-full text-[13px] font-bold bg-[#0B3D2E] text-white hover:bg-[#0B3D2E]/90 transition">
              إغلاق
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className={`rounded-xl px-3 py-2 text-[12px] font-semibold ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {error}
              </div>
            )}
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>نوع الموعد</label>
                    <select value={type} onChange={e => setType(e.target.value)} className={inputCls}>
                      <option value="" disabled>اختر التصنيف...</option>
                      {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>القضية / الموكل (اختياري)</label>
                    <input type="text" value={caseName} onChange={e => setCaseName(e.target.value)} placeholder="مثال: قضية الأفق" className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>التاريخ</label>
                      <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الوقت</label>
                      <input type="time" value={time} onChange={e => setTime(e.target.value)} className={inputCls} />
                    </div>
                  </div>
                  <button onClick={() => setStep(2)} disabled={!type} className="w-full rounded-xl bg-[#0B3D2E] text-[#C8A762] py-2.5 text-[13px] font-bold hover:bg-[#092e22] transition mt-2 disabled:opacity-40">
                    الخطوة التالية
                  </button>
                </motion.div>
              )}
              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-4">
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الموقع</label>
                    <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="مثال: المحكمة التجارية - الرياض" className={inputCls} />
                  </div>
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>ملاحظات والتزامات</label>
                    <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="أي مستندات مطلوبة للصياغة؟" className={`${inputCls} resize-none`} />
                  </div>
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>مستوى الأهمية / الاستعجال</label>
                    <div className="grid grid-cols-3 gap-2">
                      {urgencyBtn("critical", "حرجة", isDark ? "border-red-500/30 bg-red-500/10 text-red-400 focus:ring-red-500/50" : "border-red-200 bg-red-50 text-red-600 focus:ring-red-500/50")}
                      {urgencyBtn("high", "عاجلة", isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-400 focus:ring-amber-500/50" : "border-amber-200 bg-amber-50 text-amber-600 focus:ring-amber-500/50")}
                      {urgencyBtn("normal", "طبيعية", isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-300 focus:ring-blue-500/50" : "border-slate-200 bg-white text-slate-600 focus:ring-blue-500/50")}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-6">
                    <button onClick={() => setStep(1)} className={`flex-1 rounded-xl py-2.5 text-[13px] font-bold transition ${isDark ? "bg-white/[0.08] text-zinc-300 hover:bg-white/[0.12]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      رجوع
                    </button>
                    <button onClick={handleSave} disabled={saving} className="flex-[2] rounded-xl bg-[#0B3D2E] text-[#C8A762] py-2.5 text-[13px] font-bold hover:bg-[#092e22] shadow-[0_4px_12px_rgba(11,61,46,0.3)] transition disabled:opacity-50">
                      {saving ? "جارٍ الحفظ..." : "حفظ الموعد"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}