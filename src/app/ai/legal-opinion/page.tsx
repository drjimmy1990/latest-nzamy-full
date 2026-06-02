"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Lightning, ArrowLeft, ArrowRight,
  Sparkle, ArrowSquareOut,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { VoiceInput } from "@/components/ui/VoiceInput";
import Link from "next/link";
import { ContextConsult } from "@/components/legal-opinion/ContextConsult";
import { ContextStudy } from "@/components/legal-opinion/ContextStudy";
import type { StudyGoalId } from "@/components/legal-opinion/ContextStudy";
import { ContextMemo } from "@/components/legal-opinion/ContextMemo";
import { ContextResearch } from "@/components/legal-opinion/ContextResearch";
import { ContextDueDiligence } from "@/components/legal-opinion/ContextDueDiligence";
import { ContextCrossExam } from "@/components/legal-opinion/ContextCrossExam";
import { CrossExamResultView } from "./_components/CrossExamResultView";

// Internal
import type { OutputType, SearchDepth, StepKey } from "./_types";
import { OUTPUT_TYPES, AGENTS_QUICK, AGENTS_DEEP, AGENTS_COMPREHENSIVE } from "./_constants";
import { StepProgress, ProcessingView } from "./_components/SharedViews";
import { ResultView } from "./_components/ResultView";
import { LetterWorkflow } from "./_components/LetterWorkflow";
import { SettingsStep } from "./_components/SettingsStep";

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AILegalOpinionPage() {
  const { isDark } = useTheme();

  // State
  const [selectedType, setSelectedType] = useState<OutputType | "">("");
  const [currentStep, setCurrentStep] = useState<StepKey>("type");
  const [topicArea, setTopicArea] = useState("");
  const [description, setDescription] = useState("");
  const [question, setQuestion] = useState("");
  const [searchDepth, setSearchDepth] = useState<SearchDepth>("deep");
  // Settings state — Study
  const [studyGoal, setStudyGoal] = useState<StudyGoalId | "">(""); 
  const [litigationStage, setLitigationStage] = useState<"first" | "appeal" | "cassation">("first");
  // Settings state — Memo
  const [memoStructure, setMemoStructure] = useState({ facts: true, legal: true, recommendation: true, attachments: false });
  const [memoDetailLevel, setMemoDetailLevel] = useState<"brief" | "detailed" | "comprehensive">("detailed");
  const [includesPrecedents, setIncludesPrecedents] = useState(true);
  // Settings state — Research
  const [researchSources, setResearchSources] = useState({ nzamy: true, laws: true, judgments: false, decrees: false });
  const [researchLimit, setResearchLimit] = useState<"5" | "10" | "unlimited">("10");
  const [processing, setProcessing] = useState(false);
  const [processingDone, setProcessingDone] = useState(false);

  const opConfig = OUTPUT_TYPES.find(o => o.id === selectedType);
  // For letter type, show dedicated letter UI
  const isLetterMode = selectedType === "letter" && currentStep !== "type";

  const steps = opConfig?.steps ?? ["type", "context", "processing", "result"];
  const ci = steps.indexOf(currentStep);

  const agents =
    opConfig?.depth === "quick" ? AGENTS_QUICK :
    opConfig?.depth === "comprehensive" ? AGENTS_COMPREHENSIVE :
    AGENTS_DEEP;

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-slate-200/70 rounded-2xl shadow-sm";

  // ─── Type-specific validators ────────────────────────────────────────────────
  function canProceed() {
    if (currentStep === "type") return !!selectedType;
    if (currentStep === "context") {
      if (selectedType === "consult") return !!topicArea && description.trim().length > 10;
      if (selectedType === "study") return description.trim().length > 10;
      if (selectedType === "legal-memo") return description.trim().length > 10;
      if (selectedType === "research") return description.trim().length > 10;
      if (selectedType === "due-diligence") return true;
      if (selectedType === "cross-exam") return description.trim().length > 50;
      return true;
    }
    return true;
  }

  const next = useCallback(async () => {
    if (ci >= steps.length - 1) return;
    const nextStep = steps[ci + 1];
    if (nextStep === "processing") {
      setCurrentStep("processing");
      setProcessing(true);
      const duration = opConfig?.depth === "quick" ? 2200 :
                       opConfig?.depth === "comprehensive" ? 6000 : 4000;
      await new Promise(r => setTimeout(r, duration));
      setProcessing(false);
      setProcessingDone(true);
      setTimeout(() => setCurrentStep("result"), 600);
      return;
    }
    setCurrentStep(nextStep);
  }, [ci, steps, opConfig]);

  const prev = () => {
    if (ci <= 0) return;
    setCurrentStep(steps[ci - 1]);
  };

  const reset = () => {
    setSelectedType("");
    setCurrentStep("type");
    setTopicArea("");
    setDescription("");
    setQuestion("");
    setStudyGoal("");
    setProcessing(false);
    setProcessingDone(false);
  };

  return (
    <div className={`p-5 md:p-7 max-w-4xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-xl bg-[#C8A762]/10 flex items-center justify-center">
            <Brain size={18} weight="duotone" className="text-[#C8A762]" />
          </div>
          <div>
            <h1 className={`text-lg font-bold leading-none ${isDark ? "text-white" : "text-zinc-900"}`}>
              الرأي الفصل
            </h1>
            <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>Al-Ra&apos;y Al-Fasl · رأي · بحث · دراسة · عناية واجبة</p>
          </div>
          <div className="flex gap-1.5 ms-2">
            <span className="rounded-full bg-[#C8A762]/15 border border-[#C8A762]/30 px-2 py-0.5 text-[9px] font-black text-[#C8A762]">MULTI-AGENT</span>
            <span className="rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[9px] font-black text-blue-500">٥ نماذج AI</span>
          </div>
        </div>
        <p className={`text-[12px] mt-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          استشارات · دراسات · مذكرات رأي · بحث قانوني متخصص · عناية واجبة — متعدد المصادر ومتعدد الوكلاء
        </p>
      </div>

      {/* Progress */}
      {currentStep !== "type" && !isLetterMode && (
        <div className={`${card} p-4`}>
          <StepProgress steps={steps} currentStep={currentStep} isDark={isDark} onStepClick={setCurrentStep} />
        </div>
      )}

      {/* ── LETTER MODE ── */}
      {isLetterMode && (
        <LetterWorkflow
          isDark={isDark}
          card={card}
          onBack={() => { setSelectedType(""); setCurrentStep("type"); }}
        />
      )}

      {/* ── STEP: TYPE ── */}
      <AnimatePresence mode="wait">
        {currentStep === "type" && (
          <motion.div key="step-type" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>

            {/* Quick Chat Input */}
            <div className={`mb-6 p-4 rounded-2xl border flex flex-col gap-3 transition-colors ${
              isDark ? "border-white/[0.08] bg-zinc-900/50 focus-within:border-[#C8A762]/50 focus-within:bg-zinc-900"
                     : "border-slate-200 bg-white shadow-sm focus-within:border-[#C8A762]/50"
            }`}>
              <div className="flex items-center gap-2">
                <Lightning size={16} weight="fill" className="text-[#C8A762]" />
                <span className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>استشارة سريعة المباشرة</span>
              </div>
              <textarea
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="اسأل المستشار ماكس باختصار هنا..."
                className={`w-full bg-transparent resize-none outline-none text-[13px] h-12 py-1 ${
                  isDark ? "text-white placeholder:text-zinc-600" : "text-slate-800 placeholder:text-slate-400"
                }`}
              />
              <div className="flex justify-between items-center">
                <VoiceInput onTranscript={(t) => setQuestion(prev => prev ? prev + " " + t : t)} className="w-8 h-8 rounded-full" />
                <button
                  disabled={question.trim().length === 0}
                  onClick={() => {
                    setSelectedType("consult");
                    setTopicArea("أخرى"); // fallback
                    setDescription(question);
                    // Force state update and then jump
                    setCurrentStep("processing");
                    setProcessing(true);
                    setTimeout(() => {
                      setProcessing(false);
                      setProcessingDone(true);
                      setTimeout(() => setCurrentStep("result"), 600);
                    }, 2200);
                  }}
                  className={`px-4 py-2 rounded-xl text-[11px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] disabled:opacity-50 transition-colors flex items-center gap-2`}>
                  إرسال
                  <ArrowSquareOut size={12} weight="bold" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <div className={`flex-1 h-px ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
              <p className={`text-[10px] font-black uppercase tracking-wider flex-shrink-0 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                أو اختر مساراً متخصصاً
              </p>
              <div className={`flex-1 h-px ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {OUTPUT_TYPES.map((ot, i) => {
                const isSelected = selectedType === ot.id;
                return (
                  <motion.button key={ot.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedType(ot.id)}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    className={`rounded-2xl border p-4 text-start transition-all ${
                      isSelected
                        ? isDark ? `${ot.border} ${ot.bg}` : `${ot.border} ${ot.bg}`
                        : isDark ? "border-white/[0.06] bg-zinc-900 hover:border-white/[0.12]"
                                 : "border-slate-200 bg-white hover:border-slate-300 shadow-sm"
                    }`}>
                    <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${ot.bg}`}>
                      <ot.icon size={20} weight="duotone" className={ot.color} />
                    </div>
                    <h3 className={`font-bold text-[13px] mb-0.5 ${isDark ? "text-white" : "text-zinc-900"}`}>{ot.title}</h3>
                    <p className={`text-[11px] leading-relaxed mb-2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{ot.desc}</p>
                    <div className="flex items-center justify-between">
                      <span className={`text-[9px] rounded-full px-2 py-0.5 ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-slate-100 text-slate-400"}`}>{ot.audience}</span>
                      <span className={`text-[9px] font-mono ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{ot.credits} ك</span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── STEP: CONTEXT (type-specific) ── */}
        {currentStep === "context" && (
          <motion.div key="step-context" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
            <AnimatePresence mode="wait">
              {selectedType === "consult" && (
                <ContextConsult
                  key="ctx-consult"
                  topicArea={topicArea} setTopicArea={setTopicArea}
                  description={description} setDescription={setDescription}
                  isDark={isDark} card={card}
                />
              )}
              {selectedType === "study" && (
                <ContextStudy
                  key="ctx-study"
                  topicArea={topicArea} setTopicArea={setTopicArea}
                  description={description} setDescription={setDescription}
                  studyGoal={studyGoal} setStudyGoal={setStudyGoal}
                  isDark={isDark} card={card}
                />
              )}
              {selectedType === "legal-memo" && (
                <ContextMemo
                  key="ctx-memo"
                  topicArea={topicArea} setTopicArea={setTopicArea}
                  description={description} setDescription={setDescription}
                  question={question} setQuestion={setQuestion}
                  isDark={isDark} card={card}
                />
              )}
              {selectedType === "research" && (
                <ContextResearch
                  key="ctx-research"
                  description={description} setDescription={setDescription}
                  isDark={isDark} card={card}
                />
              )}
              {selectedType === "due-diligence" && (
                <ContextDueDiligence
                  key="ctx-dd"
                  description={description} setDescription={setDescription}
                  isDark={isDark} card={card}
                />
              )}
              {selectedType === "cross-exam" && (
                <ContextCrossExam
                  key="ctx-cross-exam"
                  description={description} setDescription={setDescription}
                  isDark={isDark} card={card}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ── STEP: SETTINGS (type-specific) ── */}
        {currentStep === "settings" && (
          <motion.div key="step-settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <SettingsStep
              isDark={isDark} card={card}
              selectedType={selectedType}
              agents={agents}
              searchDepth={searchDepth} setSearchDepth={setSearchDepth}
              studyGoal={studyGoal}
              litigationStage={litigationStage} setLitigationStage={setLitigationStage}
              memoStructure={memoStructure} setMemoStructure={setMemoStructure}
              memoDetailLevel={memoDetailLevel} setMemoDetailLevel={setMemoDetailLevel}
              researchSources={researchSources} setResearchSources={setResearchSources}
              researchLimit={researchLimit} setResearchLimit={setResearchLimit}
            />
          </motion.div>
        )}

        {/* ── STEP: PROCESSING ── */}
        {currentStep === "processing" && (
          <motion.div key="step-processing" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className={`${card} p-5`}>
              <ProcessingView agents={agents} isDark={isDark} />
            </div>
          </motion.div>
        )}

        {/* ── STEP: RESULT ── */}
        {currentStep === "result" && (
          <motion.div key="step-result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {selectedType === "cross-exam" ? (
              <CrossExamResultView isDark={isDark} card={card} onReset={reset} />
            ) : (
              <ResultView
                outputType={selectedType as OutputType}
                isDark={isDark}
                onReset={reset}
                onEdit={() => setCurrentStep("context")}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation — hidden in letter mode (letter has its own nav) */}
      {currentStep !== "processing" && currentStep !== "result" && !isLetterMode && (
        <div className="flex items-center justify-between pt-1">
          <button onClick={prev} disabled={ci === 0}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-semibold border transition-colors disabled:opacity-30 ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-slate-200 bg-white text-slate-600"}`}>
            <ArrowRight size={13} /> السابق
          </button>
          {ci < steps.length - 1 && (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={next} disabled={!canProceed()}
              className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-6 py-2.5 text-[12px] font-bold text-white disabled:opacity-40">
              {steps[ci + 1] === "processing" ? (
                <><Sparkle size={13} weight="fill" />ابدأ التحليل</>
              ) : (
                <>التالي <ArrowLeft size={13} /></>
              )}
            </motion.button>
          )}
        </div>
      )}
    </div>
  );
}
