"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { addCaseStage } from "@/lib/services/caseStagesService";
import { VALID_UI_DEGREES, type UiDegree } from "@/lib/services/caseStageVocabulary";
import { describeDateAr } from "@/lib/services/hijri";
import type { CaseStage } from "@/lib/services/caseStagesService";

interface Props {
  onClose: () => void;
  isDark: boolean;
  caseRequestId: string;
  onCreated: (stage: CaseStage) => void;
}

/**
 * Unlike AddHearingModal there is no "general diary" mode — a stage only
 * ever exists inside one case, so caseRequestId is required, not optional,
 * and there is no case-name field to hide/show.
 */
export default function AddCaseStageModal({ onClose, isDark, caseRequestId, onCreated }: Props) {
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [degree, setDegree] = useState<UiDegree | "">("");
  const [courtName, setCourtName] = useState("");
  const [courtCaseNo, setCourtCaseNo] = useState("");
  const [circuit, setCircuit] = useState("");
  const [judgeName, setJudgeName] = useState("");
  const [openedOn, setOpenedOn] = useState("");
  const [notes, setNotes] = useState("");

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
    isDark
      ? "border-white/[0.08] bg-zinc-800 text-zinc-200 focus:border-[#C8A762]"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 focus:border-[#0B3D2E]"
  }`;

  async function handleSave() {
    if (!degree) {
      setError("اختر درجة التقاضي قبل الحفظ.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await addCaseStage(caseRequestId, {
        degree,
        courtName: courtName.trim() || undefined,
        courtCaseNo: courtCaseNo.trim() || undefined,
        circuit: circuit.trim() || undefined,
        judgeName: judgeName.trim() || undefined,
        openedOn: openedOn || undefined,
        notes: notes.trim() || undefined,
      });
      onCreated(created);
      setDone(true);
    } catch (err) {
      console.error("[AddCaseStageModal] save failed:", err);
      setError(
        err instanceof Error && err.message
          ? `تعذّرت إضافة درجة التقاضي: ${err.message}`
          : "تعذّرت إضافة درجة التقاضي. تحقّق من الاتصال ثم أعد المحاولة.",
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
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>إضافة درجة تقاضٍ</h3>
          <button onClick={onClose} className={`flex h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400 hover:text-white" : "bg-zinc-100 text-zinc-500 hover:text-black"}`}>
            <XCircle size={16} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} weight="fill" className="text-emerald-500" />
            </div>
            <p className={`font-bold text-[16px] ${isDark ? "text-white" : "text-zinc-900"}`}>تمت إضافة درجة التقاضي</p>
            <button onClick={onClose} className="mt-4 rounded-xl px-5 py-2.5 w-full text-[13px] font-bold bg-[#0B3D2E] text-white hover:bg-[#0B3D2E]/90 transition">
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
            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الدرجة <span className="text-red-500">*</span></label>
              <select value={degree} onChange={e => setDegree(e.target.value as UiDegree)} className={inputCls}>
                <option value="" disabled>اختر درجة التقاضي...</option>
                {VALID_UI_DEGREES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>المحكمة</label>
              <input type="text" value={courtName} onChange={e => setCourtName(e.target.value)} placeholder="مثال: محكمة الاستئناف التجارية بالرياض" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>رقم القضية</label>
                <input type="text" value={courtCaseNo} onChange={e => setCourtCaseNo(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الدائرة</label>
                <input type="text" value={circuit} onChange={e => setCircuit(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>القاضي</label>
                <input type="text" value={judgeName} onChange={e => setJudgeName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>تاريخ الفتح</label>
                <input type="date" value={openedOn} onChange={e => setOpenedOn(e.target.value)} className={inputCls} />
              </div>
            </div>
            {openedOn && describeDateAr(openedOn) && (
              <div className={`rounded-xl px-3 py-2 border ${isDark ? "border-emerald-700/30 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"}`}>
                <p className={`text-[11px] font-semibold ${isDark ? "text-emerald-300" : "text-emerald-800"}`}>{describeDateAr(openedOn)}</p>
              </div>
            )}
            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>ملاحظات</label>
              <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} className={`${inputCls} resize-none`} />
            </div>
            <button onClick={handleSave} disabled={saving || !degree}
              className={`w-full rounded-xl py-2.5 text-[13px] font-bold transition ${
                saving || !degree
                  ? isDark ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22]"
              }`}>
              {saving ? "جارٍ الحفظ..." : "حفظ درجة التقاضي"}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
