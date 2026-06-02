"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, UploadSimple, CheckCircle, Spinner,
  CaretDown, X, Lightbulb, ArrowsLeftRight,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { DiffSection, DIFF_STYLE, PROCESSING_STEPS } from "./_compare-types";

// ─── Processing view ────────────────────────────────────────────────────────────
export function ProcessingView({ isDark }: { isDark: boolean }) {
  const [step, setStep] = useState(0);
  useState(() => {
    let c = 0;
    const run = () => {
      if (c >= PROCESSING_STEPS.length) return;
      setTimeout(() => { setStep(c + 1); c++; run(); }, PROCESSING_STEPS[c]?.duration ?? 700);
    };
    run();
  });

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="py-14 flex flex-col items-center gap-8">
      {/* Animated double-doc icon */}
      <div className="relative w-24 h-16 flex items-center justify-center">
        <motion.div
          animate={{ x: [-8, -12, -8], rotate: [-3, -5, -3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className={`absolute left-0 w-12 h-16 rounded-xl border-2 flex items-center justify-center ${isDark ? "border-white/[0.1] bg-zinc-800" : "border-slate-200 bg-white shadow"}`}
        >
          <FileText size={18} weight="duotone" className={isDark ? "text-zinc-500" : "text-slate-400"} />
        </motion.div>
        <motion.div
          animate={{ x: [8, 12, 8], rotate: [3, 5, 3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className={`absolute right-0 w-12 h-16 rounded-xl border-2 flex items-center justify-center ${isDark ? "border-[#C8A762]/30 bg-zinc-800" : "border-[#C8A762]/40 bg-amber-50 shadow"}`}
        >
          <FileText size={18} weight="duotone" className="text-[#C8A762]" />
        </motion.div>
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="z-10 w-7 h-7 rounded-full bg-[#0B3D2E] flex items-center justify-center shadow"
        >
          <ArrowsLeftRight size={12} className="text-[#C8A762]" />
        </motion.div>
      </div>

      <div className="text-center">
        <p className={`text-[15px] font-bold mb-1 ${isDark ? "text-white" : "text-zinc-800"}`}>جارٍ المقارنة القانونية...</p>
        <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>يتم تحليل الاختلافات وتقييم الأثر القانوني</p>
      </div>

      <div className="w-full max-w-sm space-y-2">
        {PROCESSING_STEPS.map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: i <= step ? 1 : 0.25, x: 0 }} transition={{ delay: i * 0.1 }} className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${i < step ? "bg-emerald-500" : i === step ? "bg-[#C8A762]/20 border border-[#C8A762]/40" : isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
              {i < step
                ? <CheckCircle size={12} weight="fill" className="text-white" />
                : i === step
                  ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><Spinner size={10} className="text-[#C8A762]" /></motion.div>
                  : <span className={`text-[9px] font-bold ${isDark ? "text-zinc-700" : "text-slate-400"}`}>{i + 1}</span>
              }
            </div>
            <p className={`text-[12px] ${i < step ? "text-emerald-500" : i === step ? isDark ? "text-zinc-200 font-semibold" : "text-zinc-700 font-semibold" : isDark ? "text-zinc-700" : "text-slate-400"}`}>{s.label}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Diff section card ──────────────────────────────────────────────────────────
export function DiffCard({ diff, isDark }: { diff: DiffSection; isDark: boolean }) {
  const [open, setOpen] = useState(diff.status !== "identical");
  const st = DIFF_STYLE[diff.status];
  const borderCls = isDark ? st.bg.dark : st.bg.light;

  return (
    <div className={`rounded-2xl border ${borderCls} overflow-hidden`}>
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 px-4 py-3">
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 flex-shrink-0 ${st.badge}`}>
          {st.icon}{st.label}
        </span>
        <p className={`flex-1 text-right text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{diff.title}</p>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <CaretDown size={12} className={isDark ? "text-zinc-600" : "text-slate-400"} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className={`border-t ${isDark ? "border-white/[0.06]" : "border-slate-100/60"}`}>
              {diff.status !== "identical" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                  <div className={`p-4 ${isDark ? "border-b md:border-b-0 md:border-l border-white/[0.06]" : "border-b md:border-b-0 md:border-l border-slate-100"}`}>
                    <p className={`text-[10px] font-bold uppercase mb-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>المستند أ</p>
                    {diff.docA
                      ? <p className={`text-[12px] leading-relaxed ${diff.status === "removed" ? "line-through opacity-50" : ""} ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{diff.docA}</p>
                      : <p className={`text-[11px] italic ${isDark ? "text-zinc-700" : "text-slate-400"}`}>— غير موجود —</p>
                    }
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] font-bold uppercase mb-2 text-[#C8A762]">المستند ب</p>
                    {diff.docB
                      ? <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{diff.docB}</p>
                      : <p className={`text-[11px] italic ${isDark ? "text-zinc-700" : "text-slate-400"}`}>— غير موجود —</p>
                    }
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{diff.docA}</p>
                </div>
              )}

              {diff.note && (
                <div className={`mx-4 mb-4 p-2.5 rounded-xl border flex items-start gap-2 ${isDark ? "border-amber-700/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
                  <Lightbulb size={12} weight="duotone" className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className={`text-[11px] leading-relaxed ${isDark ? "text-amber-400/80" : "text-amber-700/80"}`}>{diff.note}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Doc upload box ─────────────────────────────────────────────────────────────
export function DocUploadBox({
  label, color, text, setText, fileName, setFileName, isDark,
}: {
  label: string; color: string;
  text: string; setText: (v: string) => void;
  fileName: string | null; setFileName: (v: string | null) => void;
  isDark: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const input = isDark
    ? "border-white/[0.07] bg-zinc-800/80 text-zinc-200 placeholder-zinc-600 focus:border-[#C8A762]/40"
    : "border-slate-200 bg-white text-zinc-800 placeholder-slate-400 focus:border-[#C8A762]/60";

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = ev => setText((ev.target?.result as string)?.slice(0, 4000) ?? "");
    reader.readAsText(f);
  }

  return (
    <div className={`rounded-2xl border overflow-hidden ${isDark ? `border-${color}/20 bg-${color}/5` : `border-slate-200 bg-slate-50`}`}>
      <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
        <div className="flex items-center gap-2">
          <FileText size={14} weight="duotone" className={color === "white" ? isDark ? "text-zinc-400" : "text-slate-500" : `text-[#C8A762]`} />
          <p className={`text-[12px] font-bold ${color === "white" ? isDark ? "text-zinc-300" : "text-zinc-700" : "text-[#C8A762]"}`}>{label}</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".txt,.doc,.docx" className="hidden" onChange={handleFile} />
          <button onClick={() => fileRef.current?.click()} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition ${isDark ? "border-white/[0.08] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-slate-400 hover:text-slate-600"}`}>
            <UploadSimple size={11} /> رفع
          </button>
          {fileName && (
            <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-white text-slate-500 border border-slate-200"}`}>
              {fileName.slice(0, 16)} <button onClick={() => { setFileName(null); setText(""); }}><X size={8} className="hover:text-red-400" /></button>
            </span>
          )}
        </div>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={9}
        placeholder={`الصق نص ${label} هنا...`}
        dir="auto"
        className={`w-full px-4 py-3 text-[12px] leading-loose resize-none outline-none border-none bg-transparent ${input} border-0`}
        style={{ background: "transparent" }}
      />
      <div className={`px-4 py-2 border-t ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
        <p className={`text-[10px] ${isDark ? "text-zinc-700" : "text-slate-400"}`}>{text.length} حرف</p>
      </div>
    </div>
  );
}
