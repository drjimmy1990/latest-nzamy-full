"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Check, ArrowRight, ArrowLeft } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useDraftState } from "@/hooks/useDraftState";
import { STEPS } from "@/components/draft/draftConstants";
import { DraftPreStep } from "@/components/draft/DraftPreStep";
import { StepIdentify }  from "@/components/draft/steps/StepIdentify";
import { StepCase }      from "@/components/draft/steps/StepCase";
import { StepAnalysis }  from "@/components/draft/steps/StepAnalysis";
import { StepDefenses }  from "@/components/draft/steps/StepDefenses";
import { StepLaws }      from "@/components/draft/steps/StepLaws";
import { StepDrafting }  from "@/components/draft/steps/StepDrafting";
import { StepReview }    from "@/components/draft/steps/StepReview";
import { StepApproval }  from "@/components/draft/steps/StepApproval";

// Labels shown as badge in wizard header when ?mode= param is present
const MODE_BADGE_LABELS: Record<string, string> = {
  arbitration: "صائغ حكم التحكيم",
  notary:      "صائغ عقد التوثيق",
  report:      "صياغة تقرير",
  minutes:     "صياغة محضر",
  reply:       "رد احترافي",
};

export default function AIDraftPage() {
  const { isDark } = useTheme();
  const searchParams = useSearchParams();
  const modeParam = searchParams.get("mode") ?? "";

  const s = useDraftState(modeParam);
  // "pre" = show chooser, "draft" = show 8-step wizard
  // If a mode param is provided skip the chooser and go straight to draft
  const [preMode, setPreMode] = useState<"pre" | "draft">(modeParam ? "draft" : "pre");

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  // ── Pre-step: route chooser ────────────────────────────────────────────────
  if (preMode === "pre") {
    return (
      <div className={`p-5 md:p-7 max-w-5xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
        <DraftPreStep onStartDraft={() => setPreMode("draft")} initialMode={modeParam} />
      </div>
    );
  }

  // ── Main 8-step wizard ────────────────────────────────────────────────────
  return (
    <div className={`p-5 md:p-7 max-w-5xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => setPreMode("pre")}
          className={`flex items-center gap-1.5 text-[12px] font-semibold ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
          <ArrowRight size={13} /> تغيير المسار
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>الصائغ القانوني</h1>
            <span className="rounded-full bg-[#C8A762]/15 border border-[#C8A762]/30 px-2.5 py-0.5 text-[10px] font-bold text-[#C8A762]">PRO</span>
            {/* Mode badge — shown when arriving from a sidebar link with ?mode= */}
            {modeParam && MODE_BADGE_LABELS[modeParam] && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                isDark ? "bg-[#C8A762]/10 border-[#C8A762]/25 text-[#C8A762]" : "bg-[#0B3D2E]/8 border-[#0B3D2E]/20 text-[#0B3D2E]"
              }`}>
                {MODE_BADGE_LABELS[modeParam]}
              </span>
            )}
          </div>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>صياغة جديدة — ٨ خطوات ذكية</p>
        </div>
      </div>

      {/* Progress stepper */}
      <div className={`${card} p-4 shadow-sm`}>
        <div className="flex items-center gap-1">
          {STEPS.map((step, i) => {
            const isActive = i === s.currentStepIndex;
            const isDone   = i < s.currentStepIndex;
            return (
              <div key={step.key} className="flex items-center gap-1 flex-1">
                <button
                  onClick={() => { if (isDone) s.setStep(step.key); }}
                  disabled={!isDone}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold transition-all flex-shrink-0 ${
                    isDone   ? "bg-emerald-500 text-white cursor-pointer hover:scale-105 active:scale-95" :
                    isActive ? "bg-[#0B3D2E] text-white shadow-md" :
                    isDark   ? "bg-zinc-800 text-zinc-500 cursor-default" : "bg-zinc-100 text-zinc-400 cursor-default"
                  }`}>
                  {isDone ? <Check size={12} weight="bold" /> : step.num}
                </button>
                <span className={`text-[10px] hidden lg:block truncate ${
                  isActive ? (isDark ? "text-white font-semibold" : "text-zinc-900 font-semibold") :
                  isDone   ? "text-emerald-500 font-medium" :
                  (isDark  ? "text-zinc-600" : "text-zinc-400")
                }`}>{step.label}</span>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-1 ${isDone ? "bg-emerald-500/40" : isDark ? "bg-zinc-800" : "bg-zinc-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      {s.step === "identify"  && <StepIdentify  isDark={isDark} clientRole={s.clientRole} setClientRole={s.setClientRole} memoType={s.memoType} setMemoType={s.setMemoType} memoSubType={s.memoSubType} setMemoSubType={s.setMemoSubType} legalBranch={s.legalBranch} setLegalBranch={s.setLegalBranch} notesText={s.notesText} setNotesText={s.setNotesText} showPreFiling={s.showPreFiling} setShowPreFiling={s.setShowPreFiling} />}
      {s.step === "case"      && <StepCase      isDark={isDark} clientRole={s.clientRole} memoType={s.memoType} legalBranch={s.legalBranch} caseText={s.caseText} setCaseText={s.setCaseText} caseFile={s.caseFile} setCaseFile={s.setCaseFile} supportDocs={s.supportDocs} addDoc={s.addDoc} removeDoc={s.removeDoc} updateDoc={s.updateDoc} lawyerNotes={s.lawyerNotes} setLawyerNotes={s.setLawyerNotes} useFirmMemory={s.useFirmMemory} setUseFirmMemory={s.setUseFirmMemory} bulkUpload={s.bulkUpload} setBulkUpload={s.setBulkUpload} partyOne={s.partyOne} setPartyOne={s.setPartyOne} partyTwo={s.partyTwo} setPartyTwo={s.setPartyTwo} caseFileRef={s.caseFileRef} attachRefs={s.attachRefs} plaintiffName={s.plaintiffName} setPlaintiffName={s.setPlaintiffName} defendantName={s.defendantName} setDefendantName={s.setDefendantName} judgmentCourt={s.judgmentCourt} setJudgmentCourt={s.setJudgmentCourt} judgmentNumber={s.judgmentNumber} setJudgmentNumber={s.setJudgmentNumber} judgmentDate={s.judgmentDate} setJudgmentDate={s.setJudgmentDate} judgmentText={s.judgmentText} setJudgmentText={s.setJudgmentText} judgmentReasons={s.judgmentReasons} setJudgmentReasons={s.setJudgmentReasons} />}
      {s.step === "analysis"  && <StepAnalysis  isDark={isDark} memoType={s.memoType} memoSubType={s.memoSubType} disputeSummary={s.disputeSummary} setDisputeSummary={s.setDisputeSummary} plaintiffName={s.plaintiffName} defendantName={s.defendantName} judgmentCourt={s.judgmentCourt} judgmentNumber={s.judgmentNumber} judgmentDate={s.judgmentDate} judgmentText={s.judgmentText} judgmentReasons={s.judgmentReasons} partyOne={s.partyOne} preFilingAnswers={s.preFilingAnswers} setPreFilingAnswers={s.setPreFilingAnswers} legalBranch={s.legalBranch} />}
      {s.step === "defenses"  && <StepDefenses  isDark={isDark} />}
      {s.step === "laws"      && <StepLaws      isDark={isDark} customLegalTexts={s.customLegalTexts} setCustomLegalTexts={s.setCustomLegalTexts} />}
      {s.step === "drafting"  && <StepDrafting  isDark={isDark} memoType={s.memoType} memoSubType={s.memoSubType} />}
      {s.step === "review"    && <StepReview    isDark={isDark} memoType={s.memoType} legalBranch={s.legalBranch} hasParties={!!(s.partyOne?.fullName || s.partyOne?.companyName)} hasCaseText={s.caseText.length > 30} hasJudgmentData={!!(s.judgmentNumber && s.judgmentText)} />}
      {s.step === "approval"  && <StepApproval  isDark={isDark} shareLink={s.shareLink} sharePasscode={s.sharePasscode} linkCopied={s.linkCopied} setLinkCopied={s.setLinkCopied} clientEmail={s.clientEmail} setClientEmail={s.setClientEmail} clientPhone={s.clientPhone} setClientPhone={s.setClientPhone} setShareLink={s.setShareLink} setSharePasscode={s.setSharePasscode} generateShareLink={s.generateShareLink} />}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button onClick={s.prevStep} disabled={s.currentStepIndex === 0}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-semibold border transition-colors disabled:opacity-30 ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-zinc-200 bg-white text-zinc-600"}`}>
          <ArrowRight size={13} /> السابق
        </button>
        {s.currentStepIndex < STEPS.length - 1 && (
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={s.nextStep} disabled={!s.canProceed() || s.processing}
            className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-6 py-2.5 text-[12px] font-bold text-white shadow-md disabled:opacity-40">
            {s.processing ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white" />
                جارٍ المعالجة...
              </>
            ) : (
              <>التالي <ArrowLeft size={13} /></>
            )}
          </motion.button>
        )}
      </div>
    </div>
  );
}
