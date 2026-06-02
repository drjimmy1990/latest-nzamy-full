"use client";
// ─── SmartTemplateModal — Lawyer Documents ───────────────────────────────────
// Extracted from page.tsx (PR-7 decomposition S78)

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Template } from "./_taxonomy";

interface SmartTemplateModalProps {
  template: Template;
  isDark: boolean;
  onClose: () => void;
}

export function SmartTemplateModal({ template, isDark, onClose }: SmartTemplateModalProps) {
  const [step,       setStep]       = useState<"fill" | "ai" | "result">("fill");
  const [vars,       setVars]       = useState<Record<string, string>>({});
  const [aiHint,     setAiHint]     = useState("");
  const [processing, setProcessing] = useState(false);

  async function generate() {
    setProcessing(true);
    await new Promise(r => setTimeout(r, 1600));
    setProcessing(false);
    setStep("result");
  }

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
          className={`w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}>

          {/* Header */}
          <div className={`flex items-center justify-between px-5 pt-5 pb-3 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
            <div>
              <p className={`text-[11px] font-bold uppercase tracking-wider mb-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>نموذج ذكي</p>
              <h3 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{template.title}</h3>
            </div>
            <button onClick={onClose} className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isDark ? "bg-white/10 text-zinc-400" : "bg-slate-100 text-slate-500"}`}>×</button>
          </div>

          {/* Metadata strip */}
          <div className={`flex items-center gap-4 px-5 py-2.5 text-[10px] border-b ${isDark ? "border-white/[0.04] text-zinc-600" : "border-slate-100 text-slate-400"}`}>
            <span>تاريخ الإنشاء: اليوم</span>
            <span>آخر تحديث: اليوم</span>
            <span>استخدام: {template.uses.toLocaleString()} مرة</span>
            <span className="mr-auto text-emerald-500 font-bold">★ معتمد</span>
          </div>

          {/* Step indicators */}
          <div className={`flex gap-1 px-5 py-3 border-b ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
            {(["fill", "ai", "result"] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-1 flex-1">
                <div className={`w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center flex-shrink-0 ${
                  step === s ? "bg-[#0B3D2E] text-[#C8A762]" :
                  (["fill","ai","result"].indexOf(step) > i) ? "bg-emerald-500 text-white" :
                  isDark ? "bg-zinc-800 text-zinc-600" : "bg-slate-100 text-slate-400"
                }`}>{i + 1}</div>
                <span className={`text-[9px] font-bold hidden sm:block ${step === s ? isDark ? "text-zinc-200" : "text-zinc-800" : isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  {s === "fill" ? "تعبئة المتغيرات" : s === "ai" ? "توليد AI" : "النتيجة"}
                </span>
                {i < 2 && <div className={`flex-1 h-px mx-1 ${isDark ? "bg-zinc-800" : "bg-slate-100"}`} />}
              </div>
            ))}
          </div>

          {/* Content */}
          <div className="p-5 space-y-3 max-h-[50vh] overflow-y-auto">
            <AnimatePresence mode="wait">
              {/* Step: Fill */}
              {step === "fill" && (
                <motion.div key="fill" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>عبِّٔء الحقول أدناه أو انتقل لتوليد AI</p>
                  {["اسم الموكل", "رقم القضية", "تاريخ التوكيل", "موضوع القضية"].slice(0, Math.min(template.fields, 4)).map(v => (
                    <div key={v}>
                      <label className={`block text-[10px] font-bold mb-1 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{v}</label>
                      <input
                        value={vars[v] || ""} onChange={e => setVars(p => ({ ...p, [v]: e.target.value }))}
                        placeholder={`أدخل ${v}...`}
                        className={`w-full rounded-xl border px-3 py-2 text-[12px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-100 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400"}`}
                      />
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setStep("ai")} className={`flex-1 py-2.5 rounded-xl border text-[12px] font-bold ${isDark ? "border-white/[0.08] text-zinc-300" : "border-slate-200 text-slate-600"}`}>توليد AI →</button>
                    <button onClick={generate} className="flex-1 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold">توليد يدوي →</button>
                  </div>
                </motion.div>
              )}

              {/* Step: AI */}
              {step === "ai" && (
                <motion.div key="ai" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>صف تفاصيل القضية وسيملأ AI النموذج تلقائياً</p>
                  <textarea value={aiHint} onChange={e => setAiHint(e.target.value)} rows={4}
                    placeholder="مثال: موكلي شركة تجارية تطعن على حكم ابتدائي..."
                    className={`w-full rounded-xl border px-3 py-2.5 text-[12px] resize-none outline-none leading-relaxed ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-100 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder:text-zinc-400"}`}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setStep("fill")} className={`px-4 py-2.5 rounded-xl border text-[12px] font-bold ${isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-slate-500"}`}>←</button>
                    <button onClick={generate} disabled={aiHint.trim().length < 5 || processing}
                      className="flex-1 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold disabled:opacity-40">
                      {processing ? (
                        <span className="flex items-center justify-center gap-2">
                          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            className="w-3.5 h-3.5 rounded-full border-2 border-[#C8A762]/30 border-t-[#C8A762]" />
                          جارٍ التوليد...
                        </span>
                      ) : "توليد المستند"}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Step: Result */}
              {step === "result" && (
                <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                  <div className={`rounded-xl p-4 text-[12px] leading-[2] ${isDark ? "bg-zinc-800/60 text-zinc-300" : "bg-slate-50 text-zinc-700"}`} dir="rtl">
                    <p className="font-bold text-[13px] text-center mb-2">بسم الله الرحمن الرحيم</p>
                    <p><strong>{template.title}</strong></p>
                    <p>الموكل: <strong>{vars["اسم الموكل"] || "[ اسم الموكل ]"}</strong></p>
                    <p>تاريخ التوكيل: {vars["تاريخ التوكيل"] || "اليوم"}</p>
                    <p className={`mt-2 text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>— تم توليده بواسطة نظامي AI —</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-[12px] font-bold">PDF</button>
                    <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B3D2E]/80 text-[#C8A762] text-[12px] font-bold">Word</button>
                    <button className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border text-[12px] font-semibold ${isDark ? "border-white/[0.08] text-zinc-400" : "border-slate-200 text-slate-500"}`}>نسخ</button>
                    <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 text-white text-[12px] font-bold">واتساب الموكل</button>
                    <button onClick={onClose} className={`ms-auto px-4 py-2 rounded-xl border text-[12px] ${isDark ? "border-white/[0.08] text-zinc-500" : "border-slate-200 text-slate-400"}`}>إغلاق</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
