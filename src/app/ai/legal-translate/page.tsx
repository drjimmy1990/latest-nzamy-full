"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Translate, ArrowRight, ArrowLeft, FileArrowUp, X,
  ArrowsLeftRight, Detective,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  LANGS,
  SPECIALIZATIONS,
  LEVELS,
  PROCESSING_STEPS,
  type LangCode,
  type Stage,
} from "@/constants/translationData";
import {
  ProcessingView,
  ResultView,
} from "@/components/translation/TranslationComponents";

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function LegalTranslatePage() {
  const { isDark } = useTheme();
  const [stage,       setStage]       = useState<Stage>("input");
  const [sourceLang,  setSourceLang]  = useState<LangCode>("ar");
  const [targetLang,  setTargetLang]  = useState<LangCode>("en");
  const [autoDetect,  setAutoDetect]  = useState(true);
  const [text,        setText]        = useState("");
  const [specId,      setSpecId]      = useState("commercial");
  const [levelId,     setLevelId]     = useState("adapted");
  const [fileName,    setFileName]    = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canTranslate = text.trim().length >= 20 || !!fileName;

  const card   = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70" : "rounded-2xl border border-slate-200 bg-white shadow-sm";
  const input  = isDark
    ? "border-white/[0.07] bg-zinc-800/80 text-zinc-200 placeholder-zinc-600 focus:border-[#C8A762]/40"
    : "border-slate-200 bg-white text-zinc-800 placeholder-slate-400 focus:border-[#C8A762]/60";

  function swapLangs() {
    if (autoDetect) return;
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
  }

  async function handleTranslate() {
    if (!canTranslate) return;
    setStage("processing");
    const total = PROCESSING_STEPS.reduce((a, s) => a + s.duration, 0);
    await new Promise(r => setTimeout(r, total + 600));
    setStage("result");
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = ev => setText((ev.target?.result as string)?.slice(0, 5000) ?? "");
    reader.readAsText(f);
  }

  return (
    <div className={`p-5 md:p-7 max-w-5xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-blue-500/10" : "bg-blue-50"}`}>
          <Translate size={20} weight="duotone" className="text-blue-500" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>المترجم القانوني</h1>
            <span className="rounded-full bg-blue-500/15 border border-blue-500/30 px-2.5 py-0.5 text-[10px] font-bold text-blue-400">جديد</span>
          </div>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>ترجمة احترافية للنصوص القانونية مع قاموس مصطلحات تلقائي</p>
        </div>
      </div>

      <AnimatePresence mode="wait">

        {/* ─── Input Stage ─── */}
        {stage === "input" && (
          <motion.div key="input" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* Language picker */}
            <div className={`${card} p-4 space-y-4`}>
              <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>اتجاه الترجمة</p>

              <div className="flex items-center gap-3">
                {/* Source */}
                <div className="flex-1">
                  <p className={`text-[10px] font-bold mb-1.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>من</p>
                  {autoDetect ? (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[12px] ${isDark ? "border-white/[0.07] bg-zinc-800/60 text-zinc-400" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                      <Detective size={14} className="text-[#C8A762]" />
                      كشف تلقائي
                    </div>
                  ) : (
                    <select
                      value={sourceLang}
                      onChange={e => setSourceLang(e.target.value as LangCode)}
                      className={`w-full px-3 py-2 rounded-xl border text-[12px] outline-none transition ${input}`}
                    >
                      {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                  )}
                </div>

                {/* Swap */}
                <button
                  onClick={swapLangs}
                  disabled={autoDetect}
                  className={`mt-5 flex-shrink-0 w-8 h-8 rounded-xl border flex items-center justify-center transition-all ${
                    autoDetect
                      ? isDark ? "border-white/[0.04] text-zinc-700" : "border-slate-100 text-slate-300"
                      : isDark ? "border-white/[0.08] text-zinc-400 hover:bg-white/[0.06] hover:text-white" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <ArrowsLeftRight size={14} />
                </button>

                {/* Target */}
                <div className="flex-1">
                  <p className={`text-[10px] font-bold mb-1.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>إلى</p>
                  <select
                    value={targetLang}
                    onChange={e => setTargetLang(e.target.value as LangCode)}
                    className={`w-full px-3 py-2 rounded-xl border text-[12px] outline-none transition ${input}`}
                  >
                    {LANGS.filter(l => autoDetect || l.code !== sourceLang).map(l => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Auto detect toggle */}
              <label className="flex items-center gap-2.5 cursor-pointer w-fit">
                <button
                  onClick={() => setAutoDetect(v => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${autoDetect ? "bg-[#0B3D2E]" : isDark ? "bg-zinc-700" : "bg-slate-200"}`}
                >
                  <motion.span
                    animate={{ x: autoDetect ? 16 : 2 }}
                    transition={{ type: "spring", stiffness: 400, damping: 28 }}
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm"
                  />
                </button>
                <span className={`text-[11px] font-medium ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                  كشف لغة المصدر تلقائياً
                </span>
              </label>
            </div>

            {/* Text input */}
            <div className={`${card} p-4 space-y-3`}>
              <div className="flex items-center justify-between">
                <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>النص المراد ترجمته</p>
                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" accept=".txt,.doc,.docx,.pdf" className="hidden" onChange={handleFile} />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition ${isDark ? "border-white/[0.08] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-slate-400 hover:text-slate-600"}`}
                  >
                    <FileArrowUp size={12} />
                    رفع ملف
                  </button>
                  {fileName && (
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${isDark ? "bg-zinc-800 text-zinc-400" : "bg-slate-100 text-slate-500"}`}>
                      {fileName.slice(0, 20)}
                      <button onClick={() => { setFileName(null); setText(""); }} className="hover:text-red-400"><X size={9} /></button>
                    </div>
                  )}
                </div>
              </div>

              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={8}
                placeholder="الصق النص القانوني هنا... (عقد، مذكرة، حكم، لائحة تنظيمية...)"
                className={`w-full px-4 py-3 rounded-xl border text-[13px] leading-loose resize-none outline-none transition ${input}`}
                dir="auto"
              />
              <p className={`text-[10px] ${isDark ? "text-zinc-700" : "text-slate-400"}`}>
                {text.length} / 10,000 حرف · يُقبل النص، Word، PDF
              </p>
            </div>

            {/* Specialization */}
            <div className={`${card} p-4 space-y-3`}>
              <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>التخصص القانوني</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SPECIALIZATIONS.map(sp => {
                  const Icon = sp.icon;
                  const active = specId === sp.id;
                  return (
                    <button
                      key={sp.id}
                      onClick={() => setSpecId(sp.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[12px] font-medium transition-all ${
                        active
                          ? isDark ? "border-[#C8A762]/40 bg-[#C8A762]/10 text-[#C8A762]" : "border-[#C8A762]/50 bg-[#C8A762]/8 text-[#0B3D2E] font-semibold"
                          : isDark ? "border-white/[0.06] text-zinc-400 hover:border-white/[0.12]" : "border-slate-200 text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      <Icon size={14} weight={active ? "fill" : "duotone"} />
                      {sp.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Level */}
            <div className={`${card} p-4 space-y-3`}>
              <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>مستوى الترجمة</p>
              <div className="space-y-2">
                {LEVELS.map(lv => {
                  const active = levelId === lv.id;
                  return (
                    <button
                      key={lv.id}
                      onClick={() => setLevelId(lv.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-right transition-all ${
                        active
                          ? isDark ? "border-[#0B3D2E]/60 bg-[#0B3D2E]/20" : "border-[#0B3D2E]/30 bg-[#0B3D2E]/5"
                          : isDark ? "border-white/[0.06] hover:border-white/[0.12]" : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                        active ? "border-[#0B3D2E]" : isDark ? "border-zinc-700" : "border-slate-300"
                      }`}>
                        {active && <span className="w-2 h-2 rounded-full bg-[#0B3D2E]" />}
                      </div>
                      <div className="flex-1">
                        <p className={`text-[12px] font-bold ${active ? isDark ? "text-white" : "text-zinc-800" : isDark ? "text-zinc-400" : "text-slate-600"}`}>{lv.label}</p>
                        <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{lv.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Submit */}
            <motion.button
              whileHover={canTranslate ? { scale: 1.02 } : {}}
              whileTap={canTranslate ? { scale: 0.98 } : {}}
              onClick={handleTranslate}
              disabled={!canTranslate}
              className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-[14px] font-bold transition-all ${
                canTranslate
                  ? "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0B3D2E]/90 shadow-lg"
                  : isDark ? "bg-zinc-800 text-zinc-600 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"
              }`}
            >
              <Translate size={17} />
              ابدأ الترجمة القانونية
              <ArrowLeft size={15} />
            </motion.button>
          </motion.div>
        )}

        {/* ─── Processing Stage ─── */}
        {stage === "processing" && (
          <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className={`${card} p-8`}>
              <ProcessingView isDark={isDark} />
            </div>
          </motion.div>
        )}

        {/* ─── Result Stage ─── */}
        {stage === "result" && (
          <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Redo button */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => { setStage("input"); setText(""); setFileName(null); }}
                className={`flex items-center gap-1.5 text-[12px] font-semibold ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}
              >
                <ArrowRight size={13} /> ترجمة نص جديد
              </button>
            </div>
            <ResultView sourceLang={sourceLang} targetLang={targetLang} text={text} isDark={isDark} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
