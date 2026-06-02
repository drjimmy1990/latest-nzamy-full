"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, CheckCircle, Brain, PencilSimple } from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { createWorkflowId, saveWorkflowRequest } from "@/lib/workflowStore";
import { ContractType, Mode, ReviewResult, Step } from "./_components/contractTypes";
import { generateContractText } from "./_components/contractTemplates";
import StepModeSelector from "./_components/StepModeSelector";
import StepTypeSelector from "./_components/StepTypeSelector";
import { StepReviewInput, StepDetailsForm } from "./_components/StepForms";
import StepPreviewSign from "./_components/StepPreviewSign";
import StepContractResult from "./_components/StepContractResult";
import StepLawyerCTA from "./_components/StepLawyerCTA";
import { CreditsBanner } from "@/components/PaywallGate";

// ─── Step indicator labels ────────────────────────────────────────────────────

const DRAFT_STEPS = [
  { num: 1, labelAr: "نوع العقد", labelEn: "Contract Type" },
  { num: 2, labelAr: "تفاصيلك", labelEn: "Your Details" },
  { num: 3, labelAr: "المراجعة", labelEn: "Review" },
  { num: 4, labelAr: "نص العقد", labelEn: "Contract Text" },
  { num: 5, labelAr: "طلب محامٍ", labelEn: "Get a Lawyer" },
];

const REVIEW_STEPS = [
  { num: 1, labelAr: "نص العقد", labelEn: "Contract Text" },
  { num: 2, labelAr: "المراجعة", labelEn: "Review" },
  { num: 3, labelAr: "النتائج", labelEn: "Results" },
  { num: 4, labelAr: "التنقيح", labelEn: "Refinement" },
  { num: 5, labelAr: "طلب محامٍ", labelEn: "Get a Lawyer" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContractDrafterPage() {
  const { theme, lang } = useTheme();
  const user = useUser();
  const isDark = theme === "dark";
  const isRTL = lang === "ar";
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const ArrowBack = isRTL ? ArrowRight : ArrowLeft;
  const isExhausted = user.credits <= 0;

  // Wizard state
  const [mode, setMode] = useState<Mode>(null);
  const [step, setStep] = useState<Step>(1);
  const [selectedType, setSelectedType] = useState<ContractType | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [agreed, setAgreed] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [contractText, setContractText] = useState("");
  const [copied, setCopied] = useState(false);
  const [step4Tab, setStep4Tab] = useState<"text" | "review">("text");
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [savedContractId, setSavedContractId] = useState<string | null>(null);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleQuickReview() {
    setIsReviewing(true);
    setStep4Tab("review");
    await new Promise((r) => setTimeout(r, 2000));
    setReviewResult({
      score: 62,
      verdict: "المسودة مقبولة للغرض الأساسي لكنها تفتقر لبنود حماية مهمة",
      risks: [
        "لا تتضمن شرط جزائي واضح عند التأخر أو المخالفة",
        "بند حل النزاعات مكتفٍ بالتراضي فقط — يُنصح بتحديد المحكمة المختصة",
        "غياب آلية lien أو ضمان عيني يُضعف موقفك إن أخلّ الطرف الآخر بالتزاماته",
      ],
      suggestions: [
        "أضف شرطاً جزائياً: ٢-٥٪ من قيمة العقد عن كل أسبوع تأخير",
        "حدد المحكمة المختصة: محاكم مدينة ... باعتبارها الاختصاص الأصيل",
        "فكّر في مراجعة محامٍ متخصص للحصول على نسخة مُحكمة قانونياً",
      ],
    });
    setIsReviewing(false);
  }

  async function handleGenerateContract() {
    setIsGenerating(true);
    await new Promise((r) => setTimeout(r, 1800));
    const draftText = generateContractText(selectedType!, formData, isRTL);
    const id = createWorkflowId("CTR");
    saveWorkflowRequest({
      id,
      type: "ai_draft",
      title: selectedType?.labelAr ?? selectedType?.labelEn ?? "Contract draft",
      description: draftText.slice(0, 500),
      requester: {
        name: user.name,
        role: user.userType,
        tier: user.tier,
        businessRole: user.businessRole,
      },
      receiver: "ai_workspace",
      status: "completed",
      payment: {
        amount: 0,
        status: "not_required",
      },
      sourcePath: "/ai/contract-drafter",
      metadata: {
        contractType: selectedType?.id ?? null,
        mode: mode ?? null,
      },
      auditEvent: "contract_draft_saved",
    });
    setSavedContractId(id);
    setContractText(draftText);
    setIsGenerating(false);
    setStep(4);
  }

  function handleCopy() {
    navigator.clipboard.writeText(contractText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleModeSelect(m: Mode) {
    setMode(m);
    setStep(1);
  }

  function handleRestart() {
    setStep(1);
    setSelectedType(null);
    setFormData({});
    setAgreed(false);
    setContractText("");
    setReviewResult(null);
    setSavedContractId(null);
  }

  const steps = mode === "review" ? REVIEW_STEPS : DRAFT_STEPS;

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? "bg-[#111418] text-white" : "bg-zinc-50/50 text-zinc-900"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-10">
        <div className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${isDark ? "opacity-100" : "opacity-50"}`}>
          <div className="absolute inset-0 bg-gradient-to-br from-[#0B3D2E]/10 via-transparent to-[#C8A762]/5" />
          <div className="absolute top-1/4 -start-32 w-96 h-96 bg-emerald-500/10 blur-[100px] rounded-full" />
          <div className="absolute bottom-0 -end-32 w-96 h-96 bg-[#C8A762]/10 blur-[100px] rounded-full" />
        </div>
        <div className="max-w-4xl mx-auto px-6 sm:px-8 text-center relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className={`inline-flex items-center gap-2 text-sm font-bold px-5 py-2 rounded-xl mb-6 shadow-sm border transition-colors ${
              isDark ? "bg-[#0B3D2E]/20 text-emerald-400 border-[#0B3D2E]/40" : "bg-emerald-50 text-emerald-700 border-emerald-100"
            }`}>
              <PencilSimple weight="bold" size={16} />
              <span>{isRTL ? "أداة صياغة العقود المتقدمة" : "Advanced Contract Drafter"}</span>
            </div>
            <h1 className={`text-3xl sm:text-4xl lg:text-5xl font-black mb-4 tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`} style={{ fontFamily: 'var(--font-brand)' }}>
              {isRTL ? "محترف صياغة العقود" : "Contract Drafter Pro"}
            </h1>
            <p className={`text-[15px] max-w-xl mx-auto font-medium leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              {isRTL
                ? "أنشئ مسوّدة عقد احترافية في دقائق — ثم احصل على مراجعة محامٍ معتمد للتأكد من سلامتها القانونية وحماية حقوقك."
                : "Create a professional contract draft in minutes — then get it reviewed by a certified lawyer for legal peace of mind."}
            </p>
          </motion.div>

          {/* Step indicator */}
          {mode && (
            <div className="flex items-center justify-center gap-0 mt-12 mb-2">
              {steps.map((s, i) => (
                <div key={s.num} className="flex items-center">
                  <button type="button" disabled={s.num >= step} onClick={() => s.num < step && setStep(s.num as Step)} className="flex flex-col items-center group disabled:cursor-default">
                    <div className={`w-10 h-10 rounded-[1rem] flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                      step === s.num ? "bg-[#0B3D2E] text-white scale-110 shadow-lg"
                        : step > s.num ? "bg-emerald-500 text-white group-hover:scale-105"
                        : isDark ? "bg-white/5 border border-white/10 text-zinc-500" : "bg-white border border-zinc-200 text-zinc-400"
                    }`}>
                      {step > s.num ? <CheckCircle size={20} weight="fill" /> : s.num}
                    </div>
                    <span className={`mt-2 text-[12px] font-bold hidden sm:block transition-colors ${
                      step === s.num ? (isDark ? "text-zinc-200" : "text-zinc-900") : step > s.num ? "text-emerald-500 group-hover:text-emerald-600" : isDark ? "text-zinc-600" : "text-zinc-400"
                    }`}>
                      {isRTL ? s.labelAr : s.labelEn}
                    </span>
                  </button>
                  {i < steps.length - 1 && (
                    <div className={`w-14 sm:w-20 h-1 mx-2 mb-6 rounded-full transition-all duration-300 ${
                      step > s.num ? "bg-gradient-to-r from-emerald-500 to-[#0B3D2E]" : isDark ? "bg-white/5" : "bg-zinc-200"
                    }`} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Wizard Body ───────────────────────────────────────────────────── */}
      <section className="pb-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Credits exhausted banner */}
          {isExhausted && <CreditsBanner isDark={isDark} />}

          <AnimatePresence mode="wait">

            {/* Step 0: choose mode */}
            {!mode && <StepModeSelector onSelect={handleModeSelect} />}

            {/* DRAFT mode steps */}
            {mode === "draft" && step === 1 && (
              <StepTypeSelector
                selected={selectedType}
                onSelect={(ct) => { setSelectedType(ct); setFormData({}); }}
                onBack={() => setMode(null)}
                onNext={() => setStep(2)}
                ArrowBack={ArrowBack}
                Arrow={Arrow}
              />
            )}
            {mode === "draft" && step === 2 && selectedType && (
              <StepDetailsForm
                selectedType={selectedType}
                formData={formData}
                onChange={(id, v) => setFormData((p) => ({ ...p, [id]: v }))}
                onBack={() => setStep(1)}
                onNext={() => setStep(3)}
                ArrowBack={ArrowBack}
                Arrow={Arrow}
              />
            )}
            {mode === "draft" && step === 3 && selectedType && (
              <StepPreviewSign
                selectedType={selectedType}
                formData={formData}
                agreed={agreed}
                isGenerating={isGenerating}
                onBack={() => setStep(2)}
                onAgreedChange={setAgreed}
                onGenerate={handleGenerateContract}
                ArrowBack={ArrowBack}
                Arrow={Arrow}
              />
            )}
            {mode === "draft" && step === 4 && contractText && (
              <StepContractResult
                contractText={contractText}
                contractType={selectedType}
                copied={copied}
                step4Tab={step4Tab}
                isReviewing={isReviewing}
                reviewResult={reviewResult}
                onCopy={handleCopy}
                onTabChange={(tab) => { setStep4Tab(tab); if (tab === "review" && !reviewResult && !isReviewing) handleQuickReview(); }}
                onBack={() => setStep(3)}
                onRequestLawyer={() => setStep(5)}
                ArrowBack={ArrowBack}
                Arrow={Arrow}
                savedId={savedContractId}
              />
            )}

            {/* REVIEW mode steps */}
            {mode === "review" && step === 1 && (
              <StepReviewInput
                contractText={contractText}
                onTextChange={setContractText}
                onBack={() => setMode(null)}
                onStartReview={() => {
                  setStep(2);
                  handleQuickReview().then(() => setStep(3));
                }}
                ArrowBack={ArrowBack}
              />
            )}
            {mode === "review" && step === 2 && (
              <motion.div key="step2-review" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center py-20">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }} className="mb-6">
                  <Brain size={48} className="text-[#0B3D2E]" weight="duotone" />
                </motion.div>
                <h2 className={`text-xl font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
                  {isRTL ? "يتم تقييم العقد..." : "Evaluating Contract..."}
                </h2>
                <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  {isRTL ? "يقوم نظامي AI بفحص البنود لاكتشاف المخاطر وبنود الغبن." : "Nezamy AI is scanning clauses to detect risks."}
                </p>
              </motion.div>
            )}
            {mode === "review" && step === 3 && reviewResult && (
              <StepContractResult
                contractText={contractText}
                contractType={null}
                copied={copied}
                step4Tab="review"
                isReviewing={false}
                reviewResult={reviewResult}
                onCopy={handleCopy}
                onTabChange={setStep4Tab}
                onBack={() => setStep(1)}
                onRequestLawyer={() => setStep(5)}
                ArrowBack={ArrowBack}
                Arrow={Arrow}
                savedId={savedContractId}
              />
            )}

            {/* Step 5: Lawyer CTA (shared) */}
            {step === 5 && (mode === "review" || selectedType) && (
              <StepLawyerCTA mode={mode} onRestart={handleRestart} />
            )}

          </AnimatePresence>
        </div>
      </section>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
