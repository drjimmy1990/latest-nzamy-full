"use client";

import { motion } from "framer-motion";
import { FileText, Warning, Sparkle, CheckCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { ContractType } from "./contractTypes";

interface Props {
  selectedType: ContractType;
  formData: Record<string, string>;
  agreed: boolean;
  isGenerating: boolean;
  onBack: () => void;
  onAgreedChange: (v: boolean) => void;
  onGenerate: () => void;
  ArrowBack: React.ElementType;
  Arrow: React.ElementType;
}

// ─── StepPreviewSign ─────────────────────────────────────────────────────────

export default function StepPreviewSign({
  selectedType, formData, agreed, isGenerating,
  onBack, onAgreedChange, onGenerate, ArrowBack, Arrow,
}: Props) {
  const { theme, lang } = useTheme();
  const isDark = theme === "dark";
  const isRTL = lang === "ar";

  return (
    <motion.div
      key="step3"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl mx-auto"
    >
      {/* Draft preview card */}
      <div className={`rounded-[2rem] border p-8 sm:p-10 mb-6 ${isDark ? "border-white/10 bg-zinc-900/50 backdrop-blur-xl" : "border-zinc-200 bg-white shadow-lg"}`}>
        <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? "bg-[#0B3D2E]/20 text-[#0B3D2E]" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
              <FileText size={26} weight="duotone" className={isDark ? "text-emerald-400" : ""} />
            </div>
            <h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
              {isRTL ? `مسوّدة ${selectedType.labelAr}` : `Draft ${selectedType.labelEn}`}
            </h2>
          </div>
          <span className={`text-[12px] font-bold px-4 py-1.5 rounded-full border ${isDark ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
            {isRTL ? "مسودة أولية" : "Initial Draft"}
          </span>
        </div>
        <div className="space-y-4">
          {selectedType.fields.map((field) => formData[field.id] && (
            <div key={field.id} className={`flex gap-4 text-[14px] py-3 border-b last:border-b-0 ${isDark ? "border-white/5" : "border-zinc-100"}`}>
              <span className={`w-40 flex-shrink-0 font-bold ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{isRTL ? field.labelAr : field.labelEn}</span>
              <span className={`font-medium ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{formData[field.id]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className={`rounded-[1.5rem] border p-6 mb-6 ${isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex gap-4">
          <Warning size={24} weight="duotone" className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className={`text-[15px] font-bold mb-1.5 ${isDark ? "text-amber-400" : "text-amber-700"}`}>
              {isRTL ? "تنبيه قانوني" : "Important Legal Notice"}
            </p>
            <p className={`text-[13px] font-medium leading-relaxed ${isDark ? "text-amber-500/80" : "text-amber-700/80"}`}>
              {isRTL
                ? "هذه المسودة أُعدّت بشكل آلي للمساعدة في صياغة أطر عامة فقط، ولا تُعدّ وثيقة قانونية مُلزِمة ولا تغني عن رأي محامٍ مرخّص. نوصي بمراجعة المحامي قبل أي توقيع."
                : "This draft was automatically prepared to assist with general frameworks only. It is not a legally binding document and does not substitute for a licensed lawyer's opinion. We recommend lawyer review before signing."}
            </p>
          </div>
        </div>
      </div>

      {/* Agree checkbox */}
      <label className={`flex items-start gap-4 cursor-pointer p-5 rounded-[1.5rem] border transition-all duration-300 ${
        agreed ? isDark ? "border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.1)]" : "border-emerald-200 bg-emerald-50" : isDark ? "border-white/10 bg-zinc-900/50" : "border-zinc-200 bg-white"
      }`}>
        <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border transition-colors ${
          agreed ? "bg-emerald-500 border-emerald-500" : isDark ? "border-zinc-600 bg-zinc-800" : "border-zinc-300 bg-white"
        }`}>
          <input type="checkbox" checked={agreed} onChange={(e) => onAgreedChange(e.target.checked)} className="hidden" />
          {agreed && <CheckCircle size={14} weight="bold" className="text-white" />}
        </div>
        <span className={`text-[13px] font-medium leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
          {isRTL
            ? "أفهم أن هذه المسودة للمساعدة فقط وليست وثيقة قانونية نهائية، وأنني أتحمل مسؤولية توقيعها بدون مراجعة محامٍ."
            : "I understand this draft is for assistance only and not a final legal document. I assume responsibility if I sign without a lawyer's review."}
        </span>
      </label>

      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={onBack}
          className={`flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl transition-all ${isDark ? "bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900"}`}
        >
          <ArrowBack size={16} weight="bold" />
          {isRTL ? "تعديل التفاصيل" : "Edit Details"}
        </button>
        <motion.button
          onClick={() => agreed && onGenerate()}
          disabled={!agreed || isGenerating}
          whileHover={agreed && !isGenerating ? { scale: 1.02, y: -2 } : {}}
          whileTap={agreed && !isGenerating ? { scale: 0.97 } : {}}
          className={`flex items-center gap-3 px-8 py-3.5 rounded-[1rem] font-bold text-[15px] transition-all duration-300 ${
            agreed && !isGenerating
              ? "bg-[#0B3D2E] text-white hover:bg-[#0a3328] shadow-[0_4px_14px_0_rgba(11,61,46,0.39)] hover:shadow-[0_6px_20px_rgba(11,61,46,0.23)]"
              : isDark ? "bg-white/5 text-zinc-600 cursor-not-allowed border border-white/5" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
          }`}
        >
          {isGenerating ? (
            <>
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
              />
              {isRTL ? "جاري صياغة العقد..." : "Drafting..."}
            </>
          ) : (
            <>
              <Sparkle size={18} weight="fill" />
              {isRTL ? "اصدر العقد النهائي" : "Generate Contract"}
              <Arrow size={18} weight="bold" />
            </>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
