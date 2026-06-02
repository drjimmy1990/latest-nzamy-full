"use client";

import { motion, AnimatePresence } from "framer-motion";
import { FileText, Brain, Warning, CheckCircle, Copy, Check, Minus, Sparkle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { ContractType, ReviewResult } from "./contractTypes";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";

interface Props {
  contractText: string;
  contractType: ContractType | null;
  copied: boolean;
  step4Tab: "text" | "review";
  isReviewing: boolean;
  reviewResult: ReviewResult | null;
  onCopy: () => void;
  onTabChange: (tab: "text" | "review") => void;
  onBack: () => void;
  onRequestLawyer: () => void;
  ArrowBack: React.ElementType;
  Arrow: React.ElementType;
  savedId?: string | null;
}

// ─── StepContractResult ───────────────────────────────────────────────────────

export default function StepContractResult({
  contractText, contractType, copied, step4Tab, isReviewing, reviewResult,
  onCopy, onTabChange, onBack, onRequestLawyer, ArrowBack, Arrow, savedId,
}: Props) {
  const { theme, lang } = useTheme();
  const isDark = theme === "dark";
  const isRTL = lang === "ar";

  return (
    <BetaReviewGate toolId="contract-drafter.result" toolName={isRTL ? "مسودة العقد ومراجعته السريعة" : "Contract draft and quick review"} reviewScope="legal-data">
    <motion.div
      key="step4"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="max-w-4xl mx-auto"
    >
      {/* Header */}
      <div className="text-center mb-10">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="w-20 h-20 rounded-full bg-[#0B3D2E]/10 border border-[#0B3D2E]/20 flex items-center justify-center mx-auto mb-5 relative"
        >
          <div className="absolute inset-0 bg-[#0B3D2E]/20 blur-xl rounded-full" />
          <FileText size={40} weight="fill" className="text-[#0B3D2E] relative z-10" />
        </motion.div>
        <h2 className={`text-3xl font-black mb-3 tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`} style={{ fontFamily: 'var(--font-brand)' }}>
          {isRTL ? "مسوّدة عقدك جاهزة ✓" : "Your contract draft is ready ✓"}
        </h2>
        <p className={`text-[15px] max-w-lg mx-auto font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          {isRTL ? "هذا عقد مبسّط للاستخدام الأولي فقط — غير موثّق ولا يُعدّ حجة قانونية كاملة" : "This is a simplified draft for preliminary use only — not notarized and not a complete legal instrument"}
        </p>
        {savedId && (
          <p className="mt-3 text-[12px] font-bold px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full inline-block">
            {isRTL ? `تم حفظ المسودة في عقودي: ${savedId}` : `Saved to contracts: ${savedId}`}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className={`flex gap-1.5 p-1.5 rounded-[1.25rem] mb-6 shadow-inner mx-auto max-w-md ${isDark ? "bg-zinc-900" : "bg-slate-100"}`}>
        {[
          { id: "text" as const, label: isRTL ? "نص العقد" : "Contract Text", icon: FileText },
          { id: "review" as const, label: isRTL ? "مراجعة سريعة AI" : "Quick AI Review", icon: Brain },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-bold rounded-[14px] transition-all duration-300 ${
              step4Tab === id
                ? isDark ? "bg-white/[0.09] text-white shadow-sm" : "bg-white text-[#0B3D2E] shadow-sm"
                : isDark ? "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]" : "text-slate-400 hover:text-slate-600 hover:bg-black/5"
            }`}
          >
            <Icon size={18} weight={step4Tab === id ? "bold" : "regular"} />
            {label}
            {id === "review" && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#C8A762]/15 border border-[#C8A762]/30 text-[#C8A762]">جديد</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {step4Tab === "text" && (
          <motion.div key="text-tab" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
            <div className={`rounded-[2rem] border mb-6 overflow-hidden ${isDark ? "border-white/10 bg-zinc-900/50 backdrop-blur-xl" : "border-zinc-200 bg-white shadow-lg"}`}>
              <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? "border-white/10 bg-zinc-800/50" : "border-zinc-100 bg-zinc-50"}`}>
                <span className={`text-[13px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  {isRTL ? contractType?.labelAr : contractType?.labelEn}
                </span>
                <motion.button
                  onClick={onCopy}
                  whileTap={{ scale: 0.95 }}
                  aria-label={isRTL ? "نسخ نص العقد" : "Copy contract text"}
                  className={`flex items-center gap-2 text-[13px] font-bold px-4 py-2 rounded-xl transition-all ${
                    copied
                      ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                      : isDark ? "bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900"
                  }`}
                >
                  {copied ? <><Check size={16} weight="bold" />{isRTL ? "تم النسخ" : "Copied!"}</> : <><Copy size={16} weight="bold" />{isRTL ? "نسخ العقد" : "Copy"}</>}
                </motion.button>
              </div>
              <pre className={`p-8 text-[14px] whitespace-pre-wrap leading-relaxed font-mono max-h-[500px] overflow-y-auto ${isDark ? "text-zinc-300" : "text-zinc-800"}`} dir={isRTL ? "rtl" : "ltr"}>
                {contractText}
              </pre>
            </div>
          </motion.div>
        )}

        {step4Tab === "review" && (
          <motion.div key="review-tab" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
            {isReviewing ? (
              <div className={`rounded-[2rem] border p-12 flex flex-col items-center gap-6 ${isDark ? "border-white/10 bg-zinc-900/50 backdrop-blur-xl" : "border-zinc-200 bg-white shadow-lg"}`}>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }} className="w-20 h-20 rounded-full bg-violet-500/10 flex items-center justify-center border border-violet-500/20 relative">
                  <div className="absolute inset-0 bg-violet-500/20 blur-xl rounded-full" />
                  <Brain size={36} className="text-violet-500 relative z-10" weight="duotone" />
                </motion.div>
                <p className={`text-[15px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
                  {isRTL ? "AI يراجع بنود العقد بتمعّن…" : "AI is carefully reviewing contract clauses…"}
                </p>
              </div>
            ) : reviewResult && (
              <div className="space-y-6">
                {/* Score */}
                <div className={`rounded-[2rem] border p-8 flex items-center gap-6 ${isDark ? "border-white/10 bg-zinc-900/50 backdrop-blur-xl" : "border-zinc-200 bg-white shadow-lg"}`}>
                  <div className="relative flex-shrink-0">
                    <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
                      <circle cx="50" cy="50" r="40" fill="none" strokeWidth="8" className={isDark ? "stroke-zinc-800" : "stroke-zinc-100"} />
                      <motion.circle cx="50" cy="50" r="40" fill="none" strokeWidth="8" stroke="#C8A762" strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 40}`}
                        initial={{ strokeDashoffset: 2 * Math.PI * 40 }}
                        animate={{ strokeDashoffset: 2 * Math.PI * 40 * (1 - reviewResult.score / 100) }}
                        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }} className="drop-shadow-[0_0_10px_rgba(200,167,98,0.5)]" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-black text-[#C8A762] tabular-nums">{reviewResult.score}</span>
                      <span className={`text-[11px] font-bold ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>/100</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className={`text-[12px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>تقييم العقد</p>
                    <p className={`text-[16px] font-bold leading-relaxed ${isDark ? "text-white" : "text-zinc-800"}`}>{reviewResult.verdict}</p>
                  </div>
                </div>

                {/* Risks & Suggestions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className={`rounded-[1.5rem] border p-6 ${isDark ? "border-rose-500/20 bg-rose-500/5" : "border-rose-200 bg-rose-50"}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
                        <Warning size={18} className="text-rose-500" weight="duotone" />
                      </div>
                      <p className={`text-[14px] font-black ${isDark ? "text-white" : "text-zinc-900"}`}>مخاطر محتملة</p>
                    </div>
                    <ul className="space-y-3">
                      {reviewResult.risks.map((r, i) => (
                        <li key={i} className={`flex items-start gap-3 text-[13px] leading-relaxed font-medium ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                          <Minus size={12} weight="bold" className="flex-shrink-0 mt-1 text-rose-500" />{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={`rounded-[1.5rem] border p-6 ${isDark ? "border-emerald-500/20 bg-emerald-500/5" : "border-emerald-200 bg-emerald-50"}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <CheckCircle size={18} className="text-emerald-500" weight="duotone" />
                      </div>
                      <p className={`text-[14px] font-black ${isDark ? "text-white" : "text-zinc-900"}`}>توصيات للتحسين</p>
                    </div>
                    <ul className="space-y-3">
                      {reviewResult.suggestions.map((s, i) => (
                        <li key={i} className={`flex items-start gap-3 text-[13px] leading-relaxed font-medium ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                          <Minus size={12} weight="bold" className="flex-shrink-0 mt-1 text-emerald-500" />{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>


              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Disclaimer */}
      <div className={`rounded-[1.5rem] border p-5 mt-6 ${isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex gap-4">
          <Warning size={20} weight="duotone" className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className={`text-[13px] leading-relaxed font-medium ${isDark ? "text-amber-500/80" : "text-amber-800/80"}`}>
            {isRTL
              ? "هذا العقد أُعدّ بشكل آلي للمساعدة، وهو مسوّدة أولية مبسّطة فقط. لا تُوقّع عليه دون مراجعة محامٍ مرخّص للتأكد من توافقه مع الأنظمة السعودية."
              : "This contract was automatically generated for assistance only. It is a simplified preliminary draft. Do not sign it without a licensed lawyer's review to ensure compliance with Saudi regulations."}
          </p>
        </div>
      </div>

      {/* Unified Result Actions */}
      <div className={`pt-6 mt-6 border-t ${isDark ? "border-white/10" : "border-zinc-200"}`}>
        <AiResultActions
          text={contractText}
          filename={`contract-${contractType?.id ?? "draft"}`}
          showVault
          showHumanReview
          className="justify-start"
        />
      </div>

      <div className="flex items-center justify-between mt-8">
        <button
          onClick={onBack}
          className={`flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl transition-all ${isDark ? "bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900"}`}
        >
          <ArrowBack size={16} weight="bold" />
          {isRTL ? "رجوع" : "Back"}
        </button>
        <motion.button
          onClick={onRequestLawyer}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-3 px-8 py-3.5 rounded-[1rem] font-bold text-[15px] bg-[#0B3D2E] text-white hover:bg-[#0a3328] shadow-[0_4px_14px_0_rgba(11,61,46,0.39)] hover:shadow-[0_6px_20px_rgba(11,61,46,0.23)] transition-all duration-300"
        >
          <Sparkle size={18} weight="fill" />
          {isRTL ? "اطلب تنقيح العقد من محامٍ" : "Request Lawyer Refinement"}
          <Arrow size={18} weight="bold" />
        </motion.button>
      </div>
    </motion.div>
    </BetaReviewGate>
  );
}
