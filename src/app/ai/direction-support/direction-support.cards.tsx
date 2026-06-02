"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookmarkSimple, CaretLeft, Check, Copy, Warning, CheckCircle, PushPin } from "@phosphor-icons/react";

import type { GlobalCase, Precedent } from "./direction-support.types";

function SimilarityBar({ value, isDark }: { value: number; isDark: boolean }) {
  const color = value >= 90 ? "bg-emerald-500" : value >= 80 ? "bg-teal-500" : value >= 70 ? "bg-amber-400" : "bg-slate-400";
  const textColor = value >= 90 ? "text-emerald-400" : value >= 80 ? "text-teal-400" : value >= 70 ? "text-amber-400" : isDark ? "text-zinc-500" : "text-slate-400";
  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.8 }}
          className={`h-full rounded-full ${color}`} />
      </div>
      <span className={`text-[10px] font-black w-8 text-left ${textColor}`}>{value}%</span>
    </div>
  );
}

// ─── Precedent Card ───────────────────────────────────────────────────────────
export function PrecedentCard({ item, isDark, saved, onSave, copied, onCopy }: {
  item: Precedent; isDark: boolean;
  saved: boolean; onSave: () => void;
  copied: boolean; onCopy: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isMine = item.outcome === "مع";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border overflow-hidden ${
        isDark ? "bg-zinc-900/70 border-white/[0.06]" : "bg-white border-slate-200 shadow-sm"
      } ${!isMine ? isDark ? "border-red-700/20" : "border-red-200" : ""}`}>

      {/* Header row */}
      <div className="flex items-start gap-3 p-4">
        {/* Similarity */}
        <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center border ${
          isMine ? isDark ? "border-emerald-700/30 bg-emerald-900/20" : "border-emerald-200 bg-emerald-50"
                 : isDark ? "border-red-700/20 bg-red-900/10" : "border-red-200 bg-red-50"
        }`}>
          <p className={`text-[14px] font-black leading-none ${isMine ? "text-emerald-500" : "text-red-400"}`}>{item.similarity}%</p>
          <p className={`text-[8px] font-bold ${isMine ? isDark ? "text-emerald-600" : "text-emerald-600" : "text-red-400"}`}>تشابه</p>
        </div>

        <div className="flex-1 min-w-0">
          {/* Outcome badge */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
              isMine ? isDark ? "border-emerald-700/30 bg-emerald-900/20 text-emerald-400"
                             : "border-emerald-200 bg-emerald-50 text-emerald-700"
                     : isDark ? "border-red-700/20 bg-red-900/10 text-red-400"
                              : "border-red-200 bg-red-50 text-red-600"
            }`}>
              {isMine ? <span className="flex items-center gap-1"><CheckCircle size={10} weight="fill" /> حكم داعم لموقفك</span> : <span className="flex items-center gap-1"><Warning size={10} weight="fill" /> حكم مخالف — للاطلاع</span>}
            </span>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${isDark ? "border-white/[0.07] text-zinc-500" : "border-slate-200 text-slate-400"}`}>
              {item.year}
            </span>
          </div>
          <p className={`text-[12px] font-bold leading-snug ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{item.court}</p>
          <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>رقم القضية: {item.caseNo}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 flex-shrink-0">
          <button onClick={onSave}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
              saved ? "bg-teal-500/10 text-teal-500" : isDark ? "hover:bg-white/[0.06] text-zinc-600" : "hover:bg-slate-100 text-slate-400"
            }`}>
            <BookmarkSimple size={13} weight={saved ? "fill" : "regular"} />
          </button>
          <button onClick={onCopy}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
              copied ? "bg-emerald-500/10 text-emerald-500" : isDark ? "hover:bg-white/[0.06] text-zinc-600" : "hover:bg-slate-100 text-slate-400"
            }`}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {/* Similarity bar */}
      <div className={`px-4 pb-3 border-b ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
        <div className="flex items-center justify-between mb-1">
          <p className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>نسبة التشابه</p>
        </div>
        <SimilarityBar value={item.similarity} isDark={isDark} />
      </div>

      {/* Facts match */}
      <div className={`px-4 py-3 border-b ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
        <p className={`text-[9px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لماذا هي مشابهة؟</p>
        <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{item.factsMatch}</p>
      </div>

      {/* Verdict (always visible) */}
      <div className={`px-4 py-3 ${expanded ? `border-b ${isDark ? "border-white/[0.04]" : "border-slate-100"}` : ""}`}>
        <p className={`text-[9px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>منطوق الحكم</p>
        <p className={`text-[11px] leading-relaxed font-medium ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{item.verdict}</p>
      </div>

      {/* Expand button */}
      <button onClick={() => setExpanded(v => !v)}
        className={`w-full flex items-center justify-center gap-1 py-2 text-[10px] font-bold transition ${isDark ? "text-zinc-600 hover:text-zinc-400 border-t border-white/[0.04]" : "text-slate-400 hover:text-slate-600 border-t border-slate-100"}`}>
        {expanded ? "إخفاء التسبيب" : "عرض أسباب التسبيب"}
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.18 }}>
          <CaretLeft size={9} style={{ transform: "rotate(-90deg)" }} />
        </motion.span>
      </button>

      {/* Reasoning (expandable) */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className={`px-4 pb-4 pt-1 border-t ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
              <p className={`text-[9px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>أبرز أسباب التسبيب</p>
              <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{item.reasoning}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {item.tags.map(tag => (
                  <span key={tag} className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-slate-100 text-slate-500"}`}>{tag}</span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── GlobalCaseCard ──────────────────────────────────────────────────────────
export function GlobalCaseCard({ item, isDark, copied, onCopy }: {
  item: GlobalCase; isDark: boolean; copied: boolean; onCopy: () => void;
}) {
  const [exp, setExp] = useState(false);
  const isLocal = item.scope === "محلية";
  return (
    <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
      className={`rounded-2xl border overflow-hidden ${
        isDark ? "bg-zinc-900/70 border-white/[0.06]" : "bg-white border-slate-200 shadow-sm"
      }`}>
      <div className="flex items-start gap-3 p-4">
        <div className={`flex-shrink-0 px-2 py-1 rounded-xl text-[9px] font-black border mt-0.5 ${
          isLocal
            ? isDark ? "border-emerald-700/30 bg-emerald-900/20 text-emerald-400" : "border-emerald-200 bg-emerald-50 text-emerald-700"
            : isDark ? "border-blue-700/30 bg-blue-900/20 text-blue-400" : "border-blue-200 bg-blue-50 text-blue-700"
        }`}>{item.scope}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
              isDark ? "border-white/[0.07] text-zinc-500" : "border-slate-200 text-slate-400"
            }`}>{item.domain}</span>
            {!item.binding && <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
              isDark ? "bg-amber-900/20 text-amber-400" : "bg-amber-50 text-amber-600"
            }`}> <Warning size={10} weight="fill" className="inline mr-1" /> استئناس فقط</span>}
          </div>
          <p className={`text-[12px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{item.name}</p>
          <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{item.court} — {item.year}</p>
        </div>
        <button onClick={onCopy} className={`w-7 h-7 rounded-lg flex items-center justify-center transition flex-shrink-0 ${
          copied ? "bg-emerald-500/10 text-emerald-500" : isDark ? "hover:bg-white/[0.06] text-zinc-600" : "hover:bg-slate-100 text-slate-400"
        }`}>{copied ? <Check size={12} /> : <Copy size={12} />}</button>
      </div>
      <div className={`px-4 pb-3 space-y-2.5 border-t ${isDark ? "border-white/[0.04]" : "border-slate-100"} pt-3`}>
        <div>
          <p className={`text-[9px] font-black uppercase tracking-wider mb-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>الوقائع والحكم</p>
          <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{item.facts}</p>
        </div>
        <div>
          <p className={`text-[9px] font-black uppercase tracking-wider mb-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>المبدأ / المنطوق</p>
          <p className={`text-[11px] leading-relaxed font-medium ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{item.ruling}</p>
        </div>
      </div>
      <button onClick={() => setExp(v => !v)}
        className={`w-full flex items-center justify-center gap-1 py-2 text-[10px] font-bold border-t transition ${
          isDark ? "border-white/[0.04] text-zinc-600 hover:text-teal-400" : "border-slate-100 text-slate-400 hover:text-teal-600"
        }`}>
        {exp ? "إخفاء" : <span className="flex items-center justify-center gap-1"><PushPin size={12} weight="fill" /> مفاد ذلك في نزاعنا الراهن</span>}
      </button>
      <AnimatePresence>
        {exp && (
          <motion.div initial={{ height:0, opacity:0 }} animate={{ height:"auto", opacity:1 }} exit={{ height:0, opacity:0 }} className="overflow-hidden">
            <div className={`px-4 py-3 border-t ${isDark ? "border-white/[0.04] bg-teal-900/10" : "border-slate-100 bg-teal-50/60"}`}>
              <p className={`text-[9px] font-black uppercase tracking-wider mb-1.5 ${isDark ? "text-teal-600" : "text-teal-700"}`}>مفاد ذلك في نزاعنا الراهن</p>
              <p className={`text-[11px] leading-relaxed ${isDark ? "text-teal-300" : "text-teal-800"}`}>{item.impact}</p>
              {item.source && <p className={`text-[9px] mt-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>المصدر: {item.source}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Mode options ─────────────────────────────────────────────────────────────
