"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { FileText, Brain, Warning, Copy, Check, Sparkle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { ContractType } from "./contractTypes";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";

interface Props {
  contractText: string;
  contractType: ContractType | null;
  copied: boolean;
  step4Tab: "text" | "review";
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
  contractText, contractType, copied, step4Tab,
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
          { id: "review" as const, label: isRTL ? "مراجعة العقد" : "Contract Review", icon: Brain },
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
            <div className={`rounded-[2rem] border p-10 flex flex-col items-center text-center gap-5 ${isDark ? "border-white/10 bg-zinc-900/50 backdrop-blur-xl" : "border-zinc-200 bg-white shadow-lg"}`}>
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isDark ? "bg-[#0B3D2E]/20 border border-[#0B3D2E]/30" : "bg-[#0B3D2E]/10 border border-[#0B3D2E]/20"}`}>
                <Brain size={30} className="text-[#0B3D2E]" weight="duotone" />
              </div>
              <div>
                <p className={`text-[16px] font-bold mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
                  {isRTL ? "مراجعة العقد يقوم بها فريقنا القانوني" : "Contract review is handled by our legal team"}
                </p>
                <p className={`text-[13px] font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  {isRTL ? "المراجعة تتم عبر الفريق — يصلك التقرير في طلبك" : "Review is handled by the team — you'll receive the report in your request"}
                </p>
              </div>
              <Link
                href="/ai/contracts"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-6 py-3 text-[13px] font-bold text-white transition-colors hover:bg-[#0a3328]"
              >
                {isRTL ? "طلب مراجعة العقد" : "Request Contract Review"}
                <Arrow size={16} weight="bold" />
              </Link>
            </div>
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
