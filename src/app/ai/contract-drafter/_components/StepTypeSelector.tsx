"use client";

import { motion } from "framer-motion";
import { CheckCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { ContractType, contractTypes } from "./contractTypes";

interface Props {
  selected: ContractType | null;
  onSelect: (ct: ContractType) => void;
  onBack: () => void;
  onNext: () => void;
  ArrowBack: React.ElementType;
  Arrow: React.ElementType;
}

// ─── StepTypeSelector ─────────────────────────────────────────────────────────

export default function StepTypeSelector({ selected, onSelect, onBack, onNext, ArrowBack, Arrow }: Props) {
  const { theme, lang } = useTheme();
  const isDark = theme === "dark";
  const isRTL = lang === "ar";
  const canProceed = selected !== null;

  return (
    <motion.div
      key="step1-draft"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
    >
      <button
        onClick={onBack}
        className={`flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl transition-all me-auto mb-4 ${
          isDark ? "bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900"
        }`}
      >
        <ArrowBack size={16} weight="bold" />
        {isRTL ? "رجوع للأنماط" : "Back to Modes"}
      </button>

      <h2 className={`text-2xl font-black mb-8 text-center tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`} style={{ fontFamily: 'var(--font-brand)' }}>
        {isRTL ? "ما هو نوع العقد الذي تحتاجه؟" : "What type of contract do you need?"}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {contractTypes.map((ct) => (
          <motion.button
            key={ct.id}
            onClick={() => onSelect(ct)}
            whileHover={{ y: -3, scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className={`group relative overflow-hidden rounded-[1.5rem] border p-6 text-start transition-all duration-300 ${
              selected?.id === ct.id
                ? isDark 
                  ? "border-emerald-500/50 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.15)]" 
                  : "border-[#0B3D2E]/40 bg-[#0B3D2E]/5 shadow-md ring-4 ring-[#0B3D2E]/10"
                : isDark
                ? "border-white/10 bg-zinc-900/50 hover:border-emerald-500/30 hover:bg-zinc-800/80"
                : "border-zinc-200 bg-white hover:border-[#0B3D2E]/30 hover:shadow-lg"
            }`}
          >
            {selected?.id === ct.id && (
              <div className="absolute top-0 end-0 w-16 h-16 bg-gradient-to-bl from-emerald-500/20 to-transparent pointer-events-none" />
            )}
            
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors ${
              selected?.id === ct.id
                ? isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"
                : isDark ? "bg-white/5 text-zinc-400 group-hover:text-emerald-400 group-hover:bg-emerald-500/10" : "bg-zinc-50 border border-zinc-100 text-zinc-400 group-hover:text-[#0B3D2E] group-hover:bg-[#0B3D2E]/5"
            }`}>
              <ct.icon size={26} weight={selected?.id === ct.id ? "fill" : "duotone"} />
            </div>
            
            <p className={`font-bold mt-1 mb-2 text-[15px] ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
              {isRTL ? ct.labelAr : ct.labelEn}
            </p>
            <p className={`text-[12px] leading-relaxed font-medium ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
              {isRTL ? ct.descAr : ct.descEn}
            </p>
            
            {selected?.id === ct.id && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-4 end-4">
                <CheckCircle size={22} weight="fill" className={isDark ? "text-emerald-400" : "text-[#0B3D2E]"} />
              </motion.div>
            )}
          </motion.button>
        ))}
      </div>

      <div className="mt-10 flex justify-end">
        <motion.button
          onClick={() => canProceed && onNext()}
          disabled={!canProceed}
          whileHover={canProceed ? { scale: 1.02, y: -2 } : {}}
          whileTap={canProceed ? { scale: 0.97 } : {}}
          className={`flex items-center gap-3 px-8 py-3.5 rounded-[1rem] font-bold text-[15px] transition-all duration-300 ${
            canProceed
              ? "bg-[#0B3D2E] text-white hover:bg-[#0a3328] shadow-[0_4px_14px_0_rgba(11,61,46,0.39)] hover:shadow-[0_6px_20px_rgba(11,61,46,0.23)]"
              : isDark ? "bg-white/5 text-zinc-600 cursor-not-allowed border border-white/5" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
          }`}
        >
          {isRTL ? "التالي — إدخال التفاصيل" : "Next — Enter Details"}
          <Arrow size={18} weight="bold" />
        </motion.button>
      </div>
    </motion.div>
  );
}
