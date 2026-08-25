"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, Warning, CircleNotch } from "@phosphor-icons/react";
import { CasePicker } from "@/components/ui/CasePicker";
import { createLawyerTask } from "@/lib/services/lawyerTasksService";

interface Props {
  onClose: () => void;
  isDark: boolean;
}

export default function AddTaskModal({ onClose, isDark }: Props) {
  // `done` is set ONLY after the server has confirmed the insert — never
  // optimistically. The old version flipped it on click, so the lawyer read a
  // success screen for a task that was never written anywhere.
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("normal");
  const [caseId, setCaseId] = useState("");
  const [caseRef, setCaseRef] = useState("");

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none disabled:opacity-50 ${
    isDark
      ? "border-white/[0.08] bg-zinc-800 text-zinc-200"
      : "border-zinc-200 bg-zinc-50 text-zinc-800"
  }`;

  const save = async () => {
    const clean = title.trim();
    if (!clean) {
      setError("يرجى كتابة عنوان المهمة أولاً.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createLawyerTask({
        title: clean,
        category: caseId ? "case" : "admin",
        priority,
        dueDate: dueDate || undefined,
        caseId: caseId || undefined,
        caseRef: caseRef || undefined,
      });
      setDone(true);
      // Same signal the tasks Kanban and the dashboard widgets listen for.
      window.dispatchEvent(new CustomEvent("nzamy-workflow-updated"));
    } catch (e) {
      console.error("[AddTaskModal] create failed:", e);
      setError(
        e instanceof Error && e.message
          ? e.message
          : "تعذّر حفظ المهمة. تحقّق من الاتصال ثم أعد المحاولة.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -10 }}
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>إضافة مهمة جديدة</h3>
          <button onClick={onClose} disabled={saving} className={`flex h-7 w-7 items-center justify-center rounded-full disabled:opacity-40 ${isDark ? "bg-white/[0.07] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
            <XCircle size={16} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} weight="fill" className="text-emerald-500" />
            </div>
            <p className={`font-bold text-[16px] ${isDark ? "text-white" : "text-zinc-900"}`}>تم حفظ المهمة!</p>
            <p className={`text-[12px] mt-1 mb-4 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              {caseRef ? `أُضيفت إلى مهامك وربطت بقضية «${caseRef}».` : "أُضيفت إلى قائمة مهامك."}
            </p>
            <button onClick={onClose} className="rounded-xl px-5 py-2 text-[13px] font-bold bg-[#0B3D2E] text-white">إغلاق</button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[12px] font-semibold text-red-500">
                <Warning size={14} weight="fill" className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>عنوان المهمة</label>
              <input
                type="text"
                autoFocus
                value={title}
                disabled={saving}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") save(); }}
                placeholder="مثال: مراجعة العقد"
                className={inputCls}
              />
            </div>

            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>ارتباط بقضية (اختياري)</label>
              <CasePicker
                value={caseId}
                onChange={(id, caseTitle) => { setCaseId(id); setCaseRef(caseTitle); }}
                isDark={isDark}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>تاريخ التسليم</label>
                <input type="date" value={dueDate} disabled={saving} onChange={e => setDueDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الأولوية</label>
                <select value={priority} disabled={saving} onChange={e => setPriority(e.target.value)} className={inputCls}>
                  <option value="high">عالية</option>
                  <option value="normal">متوسطة</option>
                  <option value="low">منخفضة</option>
                </select>
              </div>
            </div>

            <button
              onClick={save}
              disabled={saving || !title.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] py-2.5 text-[13px] font-bold text-[#C8A762] mt-2 disabled:opacity-50"
            >
              {saving && <CircleNotch size={14} weight="bold" className="animate-spin" />}
              {saving ? "جارٍ الحفظ..." : "حفظ المهمة"}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
