"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, CheckCircle, Sparkle, DownloadSimple,
  Copy, Check, X, MagicWand, Robot, Spinner, PencilSimple,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { AutoFix, MOCK_AUTO_FIXES, FIXED_DOC_B } from "./_compare-types";

export function AutoFixPanel({ isDark }: { isDark: boolean }) {
  const [fixes, setFixes] = useState<AutoFix[]>(MOCK_AUTO_FIXES);
  const [editedDoc, setEditedDoc] = useState(FIXED_DOC_B);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const card = isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70" : "rounded-2xl border border-slate-200 bg-white shadow-sm";

  const rejectFix = (id: number) => {
    setFixes(prev => prev.map(f => f.id === id ? { ...f, rejected: true } : f));
  };

  const activeFixes = fixes.filter(f => !f.rejected);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeInOut" }}
      className="overflow-hidden"
    >
      <div className="space-y-4 pt-2">
        {/* Fixes list */}
        <div className={`${card} p-4`}>
          <div className="flex items-center gap-2 mb-3">
            <MagicWand size={14} weight="duotone" className="text-emerald-500" />
            <p className={`text-[12px] font-black uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-slate-600"}`}>التعديلات التلقائية المُطبَّقة</p>
          </div>
          <div className="space-y-2">
            {fixes.map(fix => (
              <div key={fix.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                fix.rejected
                  ? isDark ? "border-white/[0.04] bg-transparent opacity-40" : "border-slate-100 opacity-40"
                  : isDark ? "border-emerald-700/20 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"
              }`}>
                <CheckCircle size={15} weight="fill" className={fix.rejected ? "text-zinc-500" : "text-emerald-500"} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] font-semibold ${fix.rejected ? (isDark ? "text-zinc-600 line-through" : "text-slate-400 line-through") : (isDark ? "text-zinc-200" : "text-zinc-800")}`}>{fix.description}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full mt-1 inline-block ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-white text-slate-500 border border-slate-200"}`}>{fix.law}</span>
                </div>
                {!fix.rejected && (
                  <button onClick={() => rejectFix(fix.id)} className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors border ${
                    isDark ? "border-red-700/30 text-red-400 hover:bg-red-900/20" : "border-red-200 text-red-500 hover:bg-red-50"
                  }`}>
                    <X size={10} /> رفض
                  </button>
                )}
              </div>
            ))}
          </div>
          {activeFixes.length === 0 && (
            <p className={`text-center text-[11px] mt-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>تم رفض جميع التعديلات — المستند الأصلي بدون تغيير.</p>
          )}
        </div>

        {/* Before / After diff labels */}
        <div className="grid grid-cols-2 gap-3">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-600"}`}>
            <FileText size={12} weight="duotone" /> المستند ب — قبل
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold border-emerald-500/30 text-emerald-600 bg-emerald-500/5">
            <Sparkle size={12} weight="fill" className="text-emerald-500" /> المستند ب — بعد الإصلاح
          </div>
        </div>

        {/* Editable fixed doc */}
        <div className={`${card} overflow-hidden`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
            <div className="flex items-center gap-2">
              <PencilSimple size={13} className={isDark ? "text-zinc-500" : "text-slate-400"} />
              <span className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>المستند المحسّن — قابل للتعديل المباشر</span>
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(editedDoc); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition ${
                isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-slate-400 hover:text-slate-600"
              }`}>
              {copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
              {copied ? "تم" : "نسخ"}
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={editedDoc}
            onChange={e => setEditedDoc(e.target.value)}
            rows={14}
            className={`w-full px-5 py-4 text-[12px] leading-[1.9] resize-none outline-none font-sans ${
              isDark ? "bg-transparent text-zinc-300" : "bg-zinc-50/30 text-zinc-700"
            }`}
            dir="rtl"
          />
          <div className={`flex items-center gap-2 px-4 py-3 border-t ${isDark ? "border-white/[0.04]" : "border-slate-100"}`}>
            <Robot size={13} className={isDark ? "text-zinc-600" : "text-slate-400"} />
            <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>حدِّد أي نص في المستند واضغط على</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
              isDark ? "border-purple-700/30 bg-purple-900/10 text-purple-400" : "border-purple-200 bg-purple-50 text-purple-600"
            }`}>🤖 اقترح بديلاً</span>
            <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>للحصول على صياغة AI</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-[12px] font-bold text-white">
            <DownloadSimple size={14} /> تنزيل Word
          </motion.button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => { navigator.clipboard.writeText(editedDoc); }}
            className={`flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[12px] font-semibold ${
              isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-slate-200 bg-white text-slate-600"
            }`}>
            <Copy size={14} /> نسخ النص
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
