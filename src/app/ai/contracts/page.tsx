"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check, ArrowRight, ArrowLeft, PencilSimple, ShieldCheck, FileText, Files, Warning, LockKey } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

import { useContractsState } from "@/hooks/useContractsState";

import { StepParties } from "@/components/contracts/steps/draft/StepParties";
import { StepDomain } from "@/components/contracts/steps/draft/StepDomain";
import { StepContext } from "@/components/contracts/steps/draft/StepContext";
import { StepClauses } from "@/components/contracts/steps/draft/StepClauses";
import { StepBestPractices } from "@/components/contracts/steps/draft/StepBestPractices";
import { StepDrafting } from "@/components/contracts/steps/draft/StepDrafting";
import { StepReview } from "@/components/contracts/steps/draft/StepReview";
import { StepApproval } from "@/components/contracts/steps/draft/StepApproval";

import { StepRIdentity } from "@/components/contracts/steps/review/StepRIdentity";
import { StepRUpload } from "@/components/contracts/steps/review/StepRUpload";
import { StepRAnalysis } from "@/components/contracts/steps/review/StepRAnalysis";
import { StepRDecisions } from "@/components/contracts/steps/review/StepRDecisions";
import { StepRReport } from "@/components/contracts/steps/review/StepRReport";

export default function AIContractsPage() {
  const { isDark } = useTheme();
  const s = useContractsState();
  const card = isDark ? "bg-zinc-900 border border-white/[0.07] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <div className={`p-5 md:p-7 max-w-5xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>محترف العقود</h1>
          <span className="rounded-full bg-[#C8A762]/15 border border-[#C8A762]/30 px-2.5 py-0.5 text-[10px] font-bold text-[#C8A762]">PRO</span>
          <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">جديد</span>
        </div>
        <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          {s.contractMode === "review"
            ? "مراجعة العقود وتحليل المخاطر بدقة قانونية — بحث أفضل الممارسات · تعديل مباشر · مشاركة العميل"
            : "صياغة ومراجعة العقود — وصف الفكرة · بحث أفضل الممارسات · تعديل مباشر على البنود · إملاء صوتي"}
        </p>
      </div>

      {/* ── B0: Mode Selector ─────────────────────────────────────────────── */}
      {!s.contractMode && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Draft Mode — goes to B0.5 */}
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => s.setContractMode("draft")}
              className={`rounded-2xl border-2 p-6 text-center transition-all ${isDark ? "border-[#0B3D2E]/60 bg-[#0B3D2E]/15 hover:border-[#0B3D2E]/80 hover:bg-[#0B3D2E]/25" : "border-[#0B3D2E]/30 bg-[#0B3D2E]/5 hover:border-[#0B3D2E]/50 hover:bg-[#0B3D2E]/10"}`}>
              <div className={`h-14 w-14 mx-auto mb-3 flex items-center justify-center rounded-2xl ${isDark ? "bg-[#0B3D2E]/40" : "bg-[#0B3D2E]/10"}`}>
                <PencilSimple size={26} weight="duotone" className={isDark ? "text-emerald-300" : "text-[#0B3D2E]"} />
              </div>
              <p className={`text-[16px] font-bold mb-1 ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>صياغة عقد</p>
              <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>صمّم عقداً جديداً من الصفر</p>
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {["وصف الفكرة", "بحث أفضل الممارسات", "تعديل البنود", "اعتماد + مشاركة"].map(f => (
                  <span key={f} className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>{f}</span>
                ))}
              </div>
            </motion.button>

            {/* Review Mode */}
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => { s.setContractMode("review"); s.setStep("r_identity"); }}
              className={`rounded-2xl border-2 p-6 text-center transition-all ${isDark ? "border-[#C8A762]/40 bg-[#C8A762]/8 hover:border-[#C8A762]/60 hover:bg-[#C8A762]/15" : "border-[#C8A762]/40 bg-amber-50/60 hover:border-[#C8A762]/70 hover:bg-amber-50"}`}>
              <div className={`h-14 w-14 mx-auto mb-3 flex items-center justify-center rounded-2xl ${isDark ? "bg-[#C8A762]/15" : "bg-amber-50"}`}>
                <ShieldCheck size={26} weight="duotone" className="text-[#C8A762]" />
              </div>
              <p className={`text-[16px] font-bold mb-1 ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>مراجعة عقد</p>
              <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>تحليل عقد موجود وكشف المخاطر</p>
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {["رفع العقد", "تحليل المخاطر", "ملاحظات التعديل", "اعتماد + مشاركة"].map(f => (
                  <span key={f} className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>{f}</span>
                ))}
              </div>
            </motion.button>
          </div>
          <p className={`text-center text-[11px] flex justify-center items-center gap-1.5 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}><LockKey size={14} weight="bold" /> الاختيار قابل للتغيير في أي وقت من أعلى الصفحة</p>
        </motion.div>
      )}

      {/* ── B0.5: Complexity Selector (Draft only, before step 1) ─────────── */}
      {s.contractMode === "draft" && !s.contractComplexity && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          <div className={`p-4 rounded-2xl border flex items-start gap-3 ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
            <span className="text-xl flex-shrink-0 mt-0.5"><PencilSimple size={20} weight="duotone" /></span>
            <div>
              <p className={`text-[13px] font-bold ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>صياغة عقد جديد — حدد مستوى التفصيل</p>
              <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-amber-600"}`}>سيؤثر هذا على عدد الخطوات والبنود المقترحة</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Simple */}
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => { s.setContractComplexity("simple"); s.setStep("parties"); }}
              className={`rounded-2xl border-2 p-6 text-right transition-all ${isDark ? "border-blue-500/30 bg-blue-500/5 hover:border-blue-500/50 hover:bg-blue-500/10" : "border-blue-200 bg-blue-50/50 hover:border-blue-400 hover:bg-blue-50 shadow-sm"}`}>
              <div className={`h-12 w-12 mb-3 flex items-center justify-center rounded-2xl ${isDark ? "bg-blue-500/15" : "bg-blue-50"}`}>
                <FileText size={24} weight="duotone" className="text-blue-500" />
              </div>
              <p className={`text-[16px] font-bold mb-1 flex items-center gap-1.5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`}><FileText size={18} weight="duotone" /> عقد بسيط</p>
              <p className={`text-[12px] mb-3 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>صفحة — صفحتان | خطوات مختصرة</p>
              <div className="flex flex-wrap gap-1">
                {["بيع/شراء", "تعيين موظف", "عمولة", "إيجار بسيط"].map(t => (
                  <span key={t} className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-white text-slate-500 border border-slate-200"}`}>{t}</span>
                ))}
              </div>
            </motion.button>

            {/* Detailed */}
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => { s.setContractComplexity("detailed"); s.setStep("parties"); }}
              className={`rounded-2xl border-2 p-6 text-right transition-all ${isDark ? "border-[#0B3D2E]/50 bg-[#0B3D2E]/10 hover:border-[#0B3D2E]/80 hover:bg-[#0B3D2E]/20" : "border-[#0B3D2E]/25 bg-white hover:border-[#0B3D2E]/50 hover:bg-[#0B3D2E]/5 shadow-sm"}`}>
              <div className={`h-12 w-12 mb-3 flex items-center justify-center rounded-2xl ${isDark ? "bg-[#0B3D2E]/30" : "bg-[#0B3D2E]/8"}`}>
                <Files size={24} weight="duotone" className={isDark ? "text-emerald-300" : "text-[#0B3D2E]"} />
              </div>
              <p className={`text-[16px] font-bold mb-1 flex items-center gap-1.5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`}><Files size={18} weight="duotone" /> عقد تفصيلي</p>
              <p className={`text-[12px] mb-3 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>5+ صفحات | جميع الخطوات</p>
              <div className="flex flex-wrap gap-1">
                {["شراكات", "تجاري معقد", "اتفاقية مساهمين", "حوكمة"].map(t => (
                  <span key={t} className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-white text-slate-500 border border-slate-200"}`}>{t}</span>
                ))}
              </div>
            </motion.button>
          </div>

          <button onClick={() => { s.setContractMode(null); s.setContractComplexity(null); }}
            className={`text-[11px] underline transition-colors ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-600"}`}>
            ← رجوع لاختيار الوضع
          </button>
        </motion.div>
      )}

      {/* ── Steps flow: after mode & complexity are resolved ─────────────── */}
      {s.contractMode && (s.contractComplexity || s.contractMode === "review") && (
        <>
          {/* Progress bar */}
          <div className={`${card} p-4 shadow-sm`}>
            <div className="flex items-center gap-1">
              {s.currentSteps.map((stepInfo, i) => {
                const isActive = i === s.currentStepIndex;
                const isDone   = i < s.currentStepIndex;
                return (
                  <div key={stepInfo.key} className="flex items-center gap-1 flex-1">
                    <button onClick={() => { if (isDone) s.setStep(stepInfo.key); }}
                      disabled={!isDone}
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold transition-all flex-shrink-0 ${isDone ? "bg-emerald-500 text-white cursor-pointer hover:scale-105 active:scale-95" : isActive ? "bg-[#0B3D2E] text-white" : isDark ? "bg-zinc-800 text-zinc-500 cursor-default" : "bg-zinc-100 text-zinc-400 cursor-default"}`}>
                      {isDone ? <Check size={11} weight="bold" /> : stepInfo.num}
                    </button>
                    <span className={`text-[10px] hidden lg:block truncate ${isActive ? (isDark ? "text-white font-semibold" : "text-zinc-900 font-semibold") : isDone ? "text-emerald-500 font-medium" : isDark ? "text-zinc-500" : "text-zinc-400"}`}>{stepInfo.label}</span>
                    {i < s.currentSteps.length - 1 && (
                      <div className={`flex-1 h-px mx-1 ${isDone ? "bg-emerald-500/40" : isDark ? "bg-zinc-800" : "bg-zinc-200"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Complexity badge */}
          {s.contractComplexity && s.contractMode === "draft" && (
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold border ${s.contractComplexity === "simple" ? isDark ? "border-blue-500/30 bg-blue-500/10 text-blue-400" : "border-blue-200 bg-blue-50 text-blue-600" : isDark ? "border-[#0B3D2E]/40 bg-[#0B3D2E]/10 text-emerald-400" : "border-[#0B3D2E]/30 bg-[#0B3D2E]/5 text-[#0B3D2E]"}`}>
                {s.contractComplexity === "simple" ? <span className="flex items-center gap-1"><FileText size={12} weight="duotone" /> عقد بسيط</span> : <span className="flex items-center gap-1"><Files size={12} weight="duotone" /> عقد تفصيلي</span>}
              </span>
              <button onClick={() => { s.setContractComplexity(null); }}
                className={`text-[10px] underline ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-600"}`}>
                تغيير
              </button>
            </div>
          )}

          {/* DRAFT MODE STEPS */}
          {s.step === "parties"  && <StepParties isDark={isDark} party1Data={s.party1Data} setParty1Data={s.setParty1Data} party2Data={s.party2Data} setParty2Data={s.setParty2Data} />}

          {s.step === "domain" && (
            <>
              <StepDomain
                isDark={isDark}
                contractMode={s.contractMode}
                setContractMode={s.setContractMode}
                contractType={s.contractType}
                setContractType={s.setContractType}
                contractLanguage={s.contractLanguage}
                setContractLanguage={s.setContractLanguage}
                customLanguageName={s.customLanguageName}
                setCustomLanguageName={s.setCustomLanguageName}
                customLanguageLayout={s.customLanguageLayout}
                setCustomLanguageLayout={s.setCustomLanguageLayout}
                customLanguageBase={s.customLanguageBase}
                setCustomLanguageBase={s.setCustomLanguageBase}
              />
              {/* 🚨 Labor 2025 warning banner */}
              <AnimatePresence>
                {s.contractType === "labor" && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className={`flex gap-3 p-4 rounded-2xl border ${isDark ? "border-emerald-700/30 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"}`}>
                    <Warning size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" weight="fill" />
                    <div>
                      <p className={`text-[12px] font-bold mb-0.5 ${isDark ? "text-emerald-300" : "text-emerald-800"}`}>
                        تنبيه: نظام العمل المحدَّث 2025
                      </p>
                      <p className={`text-[11px] leading-relaxed ${isDark ? "text-emerald-400/70" : "text-emerald-700"}`}>
                        هذا العقد يشمل بنوداً تتعلق بنظام العمل المحدَّث 2025 — تم تحديث إجازات الأمومة/الأبوة وفترات التجربة وآليات الإنهاء.
                        سيتولى النظام التحقق من المطابقة تلقائياً.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {/* 🆕 Partnership agreement highlight */}
              <AnimatePresence>
                {s.contractType === "shareholders" && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className={`flex gap-3 p-4 rounded-2xl border ${isDark ? "border-amber-600/30 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
                    <Warning size={16} className="text-amber-500 flex-shrink-0 mt-0.5" weight="fill" />
                    <div>
                      <p className={`text-[12px] font-bold mb-0.5 ${isDark ? "text-amber-300" : "text-amber-800"}`}>
                        اتفاقية المساهمين — أكثر ما يُسبب النزاعات
                      </p>
                      <p className={`text-[11px] leading-relaxed ${isDark ? "text-amber-400/70" : "text-amber-700"}`}>
                        غياب اتفاقية الشركاء الواضحة هو سبب 60%+ من نزاعات الحوكمة في الشركات السعودية.
                        سيوجّهك النظام لتغطية: نسب الملكية · التصويت · التخارج · حل Deadlock · ميثاق السلوك.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {s.step === "context"  && <StepContext isDark={isDark} contractDesc={s.contractDesc} setContractDesc={s.setContractDesc} courtType={s.courtType} setCourtType={s.setCourtType} useFirmMemory={s.useFirmMemory} setUseFirmMemory={s.setUseFirmMemory} />}
          {s.step === "clauses"  && <StepClauses isDark={isDark} clauses={s.clauses} setClauses={s.setClauses} clauseEdits={s.clauseEdits} setClauseEdits={s.setClauseEdits} newClause={s.newClause} setNewClause={s.setNewClause} additionalClauses={s.additionalClauses} setAdditionalClauses={s.setAdditionalClauses} />}
          {s.step === "bestprac" && <StepBestPractices isDark={isDark} contractType={s.contractType} bestPractices={[]} bpSearching={s.bpSearching} bpDone={s.bpDone} startBPSearch={s.startBPSearch} deepSearch={s.deepSearch} setDeepSearch={s.setDeepSearch} skipBP={s.skipBP} setSkipBP={s.setSkipBP} appliedBP={s.appliedBP} setAppliedBP={s.setAppliedBP} />}
          {s.step === "drafting" && (
            <StepDrafting
              isDark={isDark}
              contractType={s.contractType}
              copied={s.copied}
              setCopied={s.setCopied}
              paraEdits={s.paraEdits}
              setParaEdits={s.setParaEdits}
              generalEdits={s.generalEdits}
              setGeneralEdits={s.setGeneralEdits}
              contractLanguage={s.contractLanguage}
              customLanguageName={s.customLanguageName}
              customLanguageLayout={s.customLanguageLayout}
              customLanguageBase={s.customLanguageBase}
            />
          )}
          {s.step === "review"   && <StepReview isDark={isDark} contractType={s.contractType} clauses={s.clauses} additionalClauses={s.additionalClauses} onGoToStep={(st) => s.setStep(st as any)} />}
          {s.step === "approval" && <StepApproval isDark={isDark} shareLink={s.shareLink} sharePasscode={s.sharePasscode} linkCopied={s.linkCopied} setLinkCopied={s.setLinkCopied} clientEmail={s.clientEmail} setClientEmail={s.setClientEmail} clientPhone={s.clientPhone} setClientPhone={s.setClientPhone} generateShareLink={s.generateShareLink} setShareLink={s.setShareLink} setSharePasscode={s.setSharePasscode} />}

          {/* REVIEW MODE STEPS */}
          {s.step === "r_identity"  && <StepRIdentity isDark={isDark} rPartyFocus={s.rPartyFocus} setRPartyFocus={s.setRPartyFocus} rFears={s.rFears} setRFears={s.setRFears} rOtherParty={s.rOtherParty} setROtherParty={s.setROtherParty} />}
          {s.step === "r_upload"    && <StepRUpload isDark={isDark} contractType={s.contractType} setContractType={s.setContractType} />}
          {s.step === "r_analysis"  && <StepRAnalysis isDark={isDark} />}
          {s.step === "r_decisions" && <StepRDecisions isDark={isDark} rClauseDecisions={s.rClauseDecisions} setRClauseDecisions={s.setRClauseDecisions} />}
          {s.step === "r_report"    && <StepRReport isDark={isDark} shareLink={s.shareLink} sharePasscode={s.sharePasscode} linkCopied={s.linkCopied} setLinkCopied={s.setLinkCopied} clientEmail={s.clientEmail} setClientEmail={s.setClientEmail} clientPhone={s.clientPhone} setClientPhone={s.setClientPhone} generateShareLink={s.generateShareLink} setShareLink={s.setShareLink} setSharePasscode={s.setSharePasscode} />}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            <button onClick={s.prevStep} disabled={s.currentStepIndex === 0}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-semibold border disabled:opacity-30 ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-zinc-200 bg-white text-zinc-600"}`}>
              <ArrowRight size={13} /> السابق
            </button>
            {s.currentStepIndex < s.currentSteps.length - 1 && (
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={s.nextStep} disabled={!s.canProceed() || s.processing}
                className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-6 py-2.5 text-[12px] font-bold text-white shadow-md disabled:opacity-40">
                {s.processing ? (
                  <><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white" />معالجة...</>
                ) : (
                  <>التالي <ArrowLeft size={13} /></>
                )}
              </motion.button>
            )}
          </div>

          <div className="flex justify-center mt-2">
            <button onClick={() => { s.setContractMode(null); s.setContractComplexity(null); }}
              className={`text-[11px] underline transition-colors ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-600"}`}>
              تغيير الوضع ({s.contractMode === "draft" ? "صياغة عقد" : "مراجعة عقد"})
            </button>
          </div>
        </>
      )}
    </div>
  );
}
