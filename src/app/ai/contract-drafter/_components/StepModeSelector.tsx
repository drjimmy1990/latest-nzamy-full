"use client";

import { motion } from "framer-motion";
import { FileText, Brain } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { Mode } from "./contractTypes";

interface Props {
  onSelect: (mode: Mode) => void;
}

// ─── StepModeSelector ─────────────────────────────────────────────────────────

export default function StepModeSelector({ onSelect }: Props) {
  const { theme, lang } = useTheme();
  const isDark = theme === "dark";
  const isRTL = lang === "ar";

  return (
    <motion.div
      key="step0"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl mx-auto"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Draft mode */}
        <motion.button
          whileHover={{ y: -5, scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onSelect("draft")}
          className={`group p-8 rounded-[2rem] border text-start transition-all duration-300 ${
            isDark 
              ? "bg-zinc-900/50 backdrop-blur-xl border-white/10 hover:bg-zinc-800/80 hover:border-emerald-500/30 hover:shadow-[0_0_30px_rgba(16,185,129,0.1)]" 
              : "bg-white border-zinc-200 hover:border-[#0B3D2E]/30 hover:shadow-xl hover:shadow-[#0B3D2E]/5"
          }`}
        >
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-colors ${
            isDark ? "bg-[#0B3D2E]/30 text-emerald-400 group-hover:bg-[#0B3D2E]/50" : "bg-emerald-50 border border-emerald-100 text-emerald-600 group-hover:bg-emerald-100"
          }`}>
            <FileText size={32} weight="duotone" />
          </div>
          <h3 className={`text-xl font-bold mb-3 ${isDark ? "text-white" : "text-zinc-900"}`}>
            {isRTL ? "إنشاء عقد جديد" : "Draft New Contract"}
          </h3>
          <p className={`text-[13px] leading-relaxed font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            {isRTL ? "بناء مسودة عقد مخصصة لاحتياجاتك بخطوات بسيطة وذكية تعتمد على تفاصيلك." : "Build a custom contract draft tailored to your needs step by step based on your details."}
          </p>
        </motion.button>

        {/* Review mode */}
        <motion.button
          whileHover={{ y: -5, scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onSelect("review")}
          className={`group p-8 rounded-[2rem] border text-start transition-all duration-300 relative overflow-hidden ${
            isDark 
              ? "bg-zinc-900/50 backdrop-blur-xl border-white/10 hover:bg-zinc-800/80 hover:border-violet-500/30 hover:shadow-[0_0_30px_rgba(139,92,246,0.1)]" 
              : "bg-white border-zinc-200 hover:border-violet-500/30 hover:shadow-xl hover:shadow-violet-500/5"
          }`}
        >
          <div className="absolute -top-6 -end-6 w-32 h-32 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-full blur-2xl pointer-events-none group-hover:scale-110 transition-transform duration-500" />
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 relative transition-colors ${
            isDark ? "bg-violet-500/20 text-violet-400 group-hover:bg-violet-500/30" : "bg-violet-50 border border-violet-100 text-violet-600 group-hover:bg-violet-100"
          }`}>
            <Brain size={32} weight="duotone" />
          </div>
          <h3 className={`text-xl font-bold mb-3 ${isDark ? "text-white" : "text-zinc-900"}`}>
            {isRTL ? "مراجعة عقد قائم" : "Review Existing Contract"}
          </h3>
          <p className={`text-[13px] leading-relaxed font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            {isRTL ? "ألصق نص عقدك الحالي وسيقوم AI بتحليل المخاطر واقتراح التعديلات لحمايتك." : "Paste your contract text and let AI analyze risks and suggest edits to protect you."}
          </p>
          <span className={`absolute top-6 end-6 text-[10px] font-bold px-3 py-1.5 rounded-full border ${
            isDark ? "bg-violet-500/10 border-violet-500/20 text-violet-400" : "bg-violet-50 border-violet-200 text-violet-600"
          }`}>AI Powered</span>
        </motion.button>
      </div>
    </motion.div>
  );
}
