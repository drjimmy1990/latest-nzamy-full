"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, Spinner } from "@phosphor-icons/react";
import { CasePicker } from "@/components/ui/CasePicker";
import { apiMutate, isSupabaseMode } from "@/lib/services/api";

interface Props {
  onClose: () => void;
  isDark: boolean;
}

export default function AddTaskModal({ onClose, isDark }: Props) {
  const [done, setDone] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("normal");
  const [category, setCategory] = useState("case");
  const [caseId, setCaseId] = useState("");
  const [caseRef, setCaseRef] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none transition-colors ${
    isDark
      ? "border-white/[0.08] bg-zinc-800 text-zinc-200 focus:border-[#C8A762]"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 focus:border-[#0B3D2E]"
  }`;

  async function handleSave() {
    if (!title.trim()) {
      setError("يرجى كتابة عنوان المهمة");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isSupabaseMode) {
        await apiMutate("/api/v1/lawyer/tasks", "POST", {
          title: title.trim(),
          category,
          priority,
          dueDate: dueDate || null,
          caseId: caseId || undefined,
          caseRef: caseRef || undefined,
          notes: notes.trim() || undefined,
        });
      }
      setDone(true);
      window.dispatchEvent(new CustomEvent("nzamy-workflow-updated"));
    } catch (e: any) {
      console.error("[AddTaskModal] save failed:", e);
      setError("تعذّر حفظ المهمة. يرجى المحاولة مرة أخرى.");
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
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>تفاصيل المهمة الجديدة</h3>
          <button onClick={onClose} className={`flex h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
            <XCircle size={16} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} weight="fill" className="text-emerald-500" />
            </div>
            <p className={`font-bold text-[16px] ${isDark ? "text-white" : "text-zinc-900"}`}>تم إضافة المهمة بنجاح!</p>
            <p className={`text-[12px] mt-1 mb-4 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>تم ربطها بجدول أعمالك ومزامنتها مع قضاياك.</p>
            <button onClick={onClose} className="rounded-xl px-5 py-2.5 w-full text-[13px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22] transition">إغلاق</button>
          </div>
        ) : (
          <div className="space-y-3.5">
            {error && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-[11px] font-semibold">
                {error}
              </div>
            )}

            <div>
              <label className={`block text-[11px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>عنوان المهمة *</label>
              <input
                autoFocus
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="مثال: كتابة مذكرة رد على دعوى التعويض..."
                className={inputCls}
              />
            </div>

            <div>
              <label className={`block text-[11px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>ارتباط بقضية (اختياري)</label>
              <CasePicker
                value={caseId}
                onChange={(id, title) => { setCaseId(id); setCaseRef(title); }}
                isDark={isDark}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-[11px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>تاريخ الاستحقاق</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={`block text-[11px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الأولوية</label>
                <select value={priority} onChange={e => setPriority(e.target.value)} className={inputCls}>
                  <option value="urgent">عاجلة جداً</option>
                  <option value="high">عالية</option>
                  <option value="normal">عادية</option>
                  <option value="low">منخفضة</option>
                </select>
              </div>
            </div>

            <div>
              <label className={`block text-[11px] font-semibold mb-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>ملاحظات أو تفاصيل</label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="أي ملاحظات أو روابط مطلوبة للإنجاز..."
                className={`${inputCls} resize-none`}
              />
            </div>

            <button
              disabled={saving || !title.trim()}
              onClick={handleSave}
              className="w-full rounded-xl bg-[#0B3D2E] py-2.5 text-[13px] font-bold text-[#C8A762] hover:bg-[#092e22] shadow transition disabled:opacity-40 mt-1"
            >
              {saving ? "جارٍ الحفظ..." : "تأكيد إضافة المهمة"}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

