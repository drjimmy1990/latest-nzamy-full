"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowsLeftRight, Sparkle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { Stage, DOC_TYPES, PROCESSING_STEPS } from "./_compare-types";
import { ProcessingView, DocUploadBox } from "./_compare-components";
import { ResultView } from "./_result-view";

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function SmartComparePage() {
  const { isDark } = useTheme();
  const [stage,   setStage]   = useState<Stage>("input");
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [textA,   setTextA]   = useState("");
  const [textB,   setTextB]   = useState("");
  const [nameA,   setNameA]   = useState<string | null>(null);
  const [nameB,   setNameB]   = useState<string | null>(null);

  const canCompare = textA.trim().length >= 30 && textB.trim().length >= 30;
  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70" : "rounded-2xl border border-slate-200 bg-white shadow-sm";

  async function handleCompare() {
    if (!canCompare) return;
    setStage("processing");
    const total = PROCESSING_STEPS.reduce((a, s) => a + s.duration, 0);
    await new Promise(r => setTimeout(r, total + 500));
    setStage("result");
  }

  return (
    <div className={`p-5 md:p-7 max-w-5xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-purple-500/10" : "bg-purple-50"}`}>
          <ArrowsLeftRight size={20} weight="duotone" className="text-purple-500" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>المقارن الذكي</h1>
            <span className="rounded-full bg-purple-500/15 border border-purple-500/30 px-2.5 py-0.5 text-[10px] font-bold text-purple-400">جديد</span>
          </div>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>قارِن بين نسختين من أي وثيقة قانونية واستخرج الاختلافات والمخاطر تلقائياً</p>
        </div>
      </div>

      <AnimatePresence mode="wait">

        {/* Input stage */}
        {stage === "input" && (
          <motion.div key="input" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* Doc type selector */}
            <div className={`${card} p-4 space-y-3`}>
              <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>نوع الوثيقة</p>
              <div className="flex flex-wrap gap-2">
                {DOC_TYPES.map(t => (
                  <button
                    key={t}
                    onClick={() => setDocType(t)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-medium border transition-all ${
                      docType === t
                        ? isDark ? "border-purple-500/40 bg-purple-500/10 text-purple-400" : "border-purple-300 bg-purple-50 text-purple-700 font-semibold"
                        : isDark ? "border-white/[0.06] text-zinc-400 hover:border-white/[0.12]" : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >{t}</button>
                ))}
              </div>
            </div>

            {/* Document upload boxes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DocUploadBox label="المستند أ" color="white" text={textA} setText={setTextA} fileName={nameA} setFileName={setNameA} isDark={isDark} />
              <DocUploadBox label="المستند ب" color="[#C8A762]" text={textB} setText={setTextB} fileName={nameB} setFileName={setNameB} isDark={isDark} />
            </div>

            <p className={`text-[11px] text-center ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              الحد الأدنى ٣٠ حرفاً لكل مستند · يدعم العربية والإنجليزية والفرنسية
            </p>

            <motion.button
              whileHover={canCompare ? { scale: 1.02 } : {}}
              whileTap={canCompare ? { scale: 0.98 } : {}}
              onClick={handleCompare}
              disabled={!canCompare}
              className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-[14px] font-bold transition-all ${
                canCompare
                  ? "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0B3D2E]/90 shadow-lg"
                  : isDark ? "bg-zinc-800 text-zinc-600 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"
              }`}
            >
              <ArrowsLeftRight size={17} />
              ابدأ المقارنة الذكية
              <Sparkle size={14} weight="fill" />
            </motion.button>
          </motion.div>
        )}

        {/* Processing stage */}
        {stage === "processing" && (
          <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ProcessingView isDark={isDark} />
          </motion.div>
        )}

        {/* Result stage */}
        {stage === "result" && (
          <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ResultView
              isDark={isDark}
              docAName={nameA ?? "المستند أ"}
              docBName={nameB ?? "المستند ب"}
            />
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
