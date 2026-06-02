"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Broom, X, Copy, Check, DownloadSimple, Warning, CheckCircle, XCircle, MathOperations, Eraser, ListNumbers, Sparkle, TextT, ArrowSquareOut } from "@phosphor-icons/react";
import AiResultActions from "@/components/AiResultActions";

const MAX_CHARS = 10_000;
const TARGET_CHARS = 9_000;

interface OptimizationReport {
  originalLength: number;
  finalLength:    number;
  removedEmojis:  number;
  removedBlanks:  number;
  isUnderLimit:   boolean;
  wasSummarized:  boolean;
}

function runNajizOptimizer(text: string): { result: string; report: OptimizationReport } {
  let result = text;
  let removedEmojis = 0;
  let removedBlanks = 0;

  const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Extended_Pictographic})/gu;
  result = result.replace(emojiRegex, () => { removedEmojis++; return ""; });
  result = result.replace(/[•▪●◦▶➤►→]/gu, "*");

  const blankLineRegex = /^[^\n]*(?:\.{5,}|_{5,}|-{5,}|\s{5,})[^\n]*$/gm;
  result = result.replace(blankLineRegex, (m) => {
    if (/[^\s.•*:\-_]{15,}/.test(m)) {
      return m.replace(/[\u0600-\u06FF\s]+:?\s*\.{5,}/g, "").replace(/_{5,}/g, "").replace(/-{5,}/g, "").trim();
    }
    removedBlanks++;
    return "";
  });

  result = result.replace(/\n{3,}/g, "\n\n");

  const wasSummarized = result.length > MAX_CHARS;
  if (wasSummarized) {
    const fillerPhrases = [/وحيث إن\s*/g, /ولما كان\s*/g, /من الجدير بالذكر\s*/g, /مفاد ذلك أن\s*/g, /وبناءً على ما تقدم،?\s*/g, /وخلاصة القول،?\s*/g, /إشارةً إلى ما سبق،?\s*/g];
    for (const phrase of fillerPhrases) { result = result.replace(phrase, ""); }
    result = result.replace(/\n{3,}/g, "\n\n");
  }

  return {
    result: result.trim(),
    report: { originalLength: text.length, finalLength: result.trim().length, removedEmojis, removedBlanks, isUnderLimit: result.trim().length <= MAX_CHARS, wasSummarized },
  };
}

function CharBar({ count, isDark }: { count: number; isDark: boolean }) {
  const pct = Math.min((count / MAX_CHARS) * 100, 100);
  const color = count > MAX_CHARS ? "bg-red-500" : count > TARGET_CHARS ? "bg-amber-500" : "bg-emerald-500";
  const label = count > MAX_CHARS ? "text-red-500" : count > TARGET_CHARS ? "text-amber-500" : "text-emerald-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] font-bold">
        <span className={label}>{count.toLocaleString()} حرف</span>
        <span className={isDark ? "text-zinc-500" : "text-slate-400"}>الحد الأقصى: {MAX_CHARS.toLocaleString()}</span>
      </div>
      <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} className={`h-full rounded-full ${color}`} />
      </div>
    </div>
  );
}

interface NajizOptimizerModalProps {
  isDark: boolean;
  initialText: string;
  onClose: () => void;
}

export function NajizOptimizerModal({ isDark, initialText, onClose }: NajizOptimizerModalProps) {
  const [inputText, setInputText] = useState(initialText);
  const [result, setResult] = useState<string | null>(null);
  const [report, setReport] = useState<OptimizationReport | null>(null);
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Auto-optimize on open
  useEffect(() => {
    if (inputText) {
      setProcessing(true);
      setTimeout(() => {
        const { result: r, report: rep } = runNajizOptimizer(inputText);
        setResult(r);
        setReport(rep);
        setProcessing(false);
      }, 1000);
    }
  }, []);

  const card = isDark ? "rounded-xl border border-white/[0.06] bg-zinc-900/50" : "rounded-xl border border-slate-200 bg-white/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} 
        className={`relative w-full max-w-4xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col h-[90vh] ${isDark ? "border-white/[0.1] bg-zinc-950" : "border-slate-200 bg-zinc-50"}`}>
        
        {/* Header */}
        <div className={`flex items-center justify-between border-b px-5 py-4 ${isDark ? "border-white/[0.06] bg-zinc-900" : "border-slate-200 bg-white"}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0B3D2E] to-[#1a6b50] flex items-center justify-center">
              <Broom size={18} weight="duotone" className="text-[#C8A762]" />
            </div>
            <div>
              <h2 className={`text-[14px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>منقح ناجز</h2>
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>تهيئة المذكرة وإزالة الرموز قبل الرفع</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-lg transition ${isDark ? "hover:bg-white/10 text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}><X size={18} /></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 h-full">
            
            {/* Input Side (Hidden if processed successfully to save space, or keep it side by side) */}
            <div className={`flex flex-col ${card} overflow-hidden`}>
              <div className={`px-4 py-3 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>النص الأصلي</p>
              </div>
              <textarea value={inputText} onChange={e => setInputText(e.target.value)} disabled={processing}
                className={`flex-1 w-full p-4 text-[12px] leading-relaxed resize-none outline-none ${isDark ? "bg-transparent text-zinc-400" : "bg-transparent text-zinc-500"}`} />
              <div className="p-4 border-t border-white/[0.05]"><CharBar count={inputText.length} isDark={isDark} /></div>
            </div>

            {/* Output Side */}
            <div className="flex flex-col h-full space-y-4">
              {processing ? (
                <div className={`flex-1 ${card} flex flex-col items-center justify-center text-center p-8`}>
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} className="w-10 h-10 rounded-full border-2 border-[#C8A762]/30 border-t-[#C8A762] mb-4" />
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>جارٍ التنقيح الآلي...</p>
                </div>
              ) : result && report ? (
                <>
                  {/* Report */}
                  <div className={`grid grid-cols-2 gap-2 p-4 rounded-xl border ${isDark ? "border-white/[0.06] bg-zinc-900/50" : "border-slate-200 bg-white"}`}>
                    <div className="col-span-2 mb-2"><CharBar count={report.finalLength} isDark={isDark} /></div>
                    <div className={`flex items-center gap-2 p-2 rounded-lg ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
                      {report.isUnderLimit ? <CheckCircle size={15} weight="fill" className="text-emerald-500" /> : <XCircle size={15} weight="fill" className="text-red-500" />}
                      <span className={`text-[11px] font-bold ${report.isUnderLimit ? "text-emerald-500" : "text-red-500"}`}>{report.isUnderLimit ? "ضمن الحد" : "تجاوز الحد"}</span>
                    </div>
                    <div className={`flex items-center gap-2 p-2 rounded-lg ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
                      <Eraser size={15} weight="fill" className="text-amber-500" />
                      <span className={`text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{report.removedEmojis} رمز مُزال</span>
                    </div>
                  </div>

                  {/* Result Text */}
                  <div className={`flex-1 flex flex-col ${card} overflow-hidden`}>
                    <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
                      <p className={`text-[12px] font-bold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>النص المُنقَّح والجاهز للنسخ</p>
                      <button onClick={() => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${copied ? "bg-emerald-500/20 text-emerald-500" : isDark ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                        {copied ? <><Check size={12} /> نُسِخ بنجاح</> : <><Copy size={12} /> نسخ المذكرة</>}
                      </button>
                    </div>
                    <textarea value={result} onChange={e => setResult(e.target.value)}
                      className={`flex-1 w-full p-4 text-[13px] font-medium leading-relaxed resize-none outline-none ${isDark ? "bg-transparent text-zinc-200" : "bg-transparent text-zinc-800"}`} />
                  </div>
                  
                  {/* Footer Actions */}
                  <div className="flex gap-2">
                    <a href="https://najiz.sa" target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-l from-[#0B3D2E] to-[#1a6b50] text-white text-[12px] font-bold hover:opacity-90 transition">
                      <ArrowSquareOut size={14} /> فتح منصة ناجز للرفع
                    </a>
                    <button onClick={onClose} className={`flex-1 px-4 py-3 rounded-xl border text-[12px] font-bold transition ${isDark ? "border-white/[0.1] text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                      العودة للمسودة
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
