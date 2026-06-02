"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ArrowRight, ArrowLeft } from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import SmartSchedulingPicker from "@/components/SmartSchedulingPicker";
import { useTheme } from "@/components/ThemeProvider";
import {
  type FormData,
  BUDGET_MAP,
  DOCS_MAP,
  stepVariants,
} from "@/constants/newCaseData";
import {
  Step1,
  Step2,
  Step3,
  Step4,
  SuccessState,
} from "@/components/cases/NewCaseSteps";

type Step = 1 | 2 | 3 | 4 | 5;

export default function NewCasePage() {
  const { isRTL, isDark } = useTheme();
  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<FormData>({
    caseType: null,
    description: "",
    court: "",
    city: "",
    sessionDate: "",
    urgent: false,
    documents: [],
    agreed: false,
    scheduling: null,
  });

  const canNext = useCallback((): boolean => {
    if (step === 1) return form.caseType !== null;
    if (step === 2)
      return (
        form.description.length >= 50 &&
        form.court !== "" &&
        form.city !== ""
      );
    if (step === 3) return form.scheduling !== null;
    if (step === 4) return true;
    if (step === 5) return form.agreed;
    return false;
  }, [step, form]);

  const goNext = () => {
    if (!canNext()) return;
    setDirection(1);
    setStep((prev) => Math.min(prev + 1, 5) as Step);
  };

  const goPrev = () => {
    setDirection(-1);
    setStep((prev) => Math.max(prev - 1, 1) as Step);
  };

  const addMockDoc = () => {
    const mocks = [
      "عقد العمل.pdf",
      "الهوية الوطنية.jpg",
      "قرار المحكمة.pdf",
      "شهادة الخدمة.docx",
      "كشف الراتب.pdf",
    ];
    const next = mocks[form.documents.length % mocks.length];
    setForm((f) => ({ ...f, documents: [...f.documents, next] }));
  };

  const handleSubmit = () => {
    if (!form.agreed) return;
    setSubmitted(true);
  };

  const recDocs = form.caseType
    ? DOCS_MAP[form.caseType] ?? DOCS_MAP.default
    : DOCS_MAP.default;

  const stepLabels = isRTL
    ? ["نوع القضية", "تفاصيل القضية", "موعد الجلسة", "رفع المستندات", "مراجعة وإرسال"]
    : ["Case Type", "Case Details", "Study Session", "Documents", "Review & Submit"];

  return (
    <div
      className={`min-h-screen flex flex-col ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <Navbar />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-12">
        {/* Page title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="text-3xl font-bold text-[#0B3D2E] dark:text-[#C8A762]">
            {isRTL ? "رفع قضية جديدة" : "Submit New Case"}
          </h1>
          <p className={`mt-2 text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            {isRTL
              ? "أكمل الخطوات التالية لتقديم قضيتك"
              : "Complete the following steps to submit your case"}
          </p>
        </motion.div>

        {/* Step indicator */}
        <div className="flex items-center justify-center mb-10 gap-0">
          {[1, 2, 3, 4, 5].map((s, idx) => (
            <div key={s} className="flex items-center">
              <motion.div
                animate={{
                  backgroundColor:
                    s < step
                      ? "#0B3D2E"
                      : s === step
                        ? "#C8A762"
                        : isDark
                          ? "#2d3748"
                          : "#e2e8f0",
                  color: s <= step ? "#fff" : isDark ? "#9ca3af" : "#6b7280",
                }}
                transition={{ duration: 0.3 }}
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs relative z-10 border-2"
                style={{
                  borderColor:
                    s === step
                      ? "#C8A762"
                      : s < step
                        ? "#0B3D2E"
                        : isDark
                          ? "#374151"
                          : "#d1d5db",
                }}
              >
                {s < step ? <Check size={13} weight="bold" /> : s}
              </motion.div>
              {idx < 4 && (
                <div
                  className="h-1 w-8 sm:w-14"
                  style={{
                    backgroundColor:
                      s < step ? "#0B3D2E" : isDark ? "#2d3748" : "#e2e8f0",
                    transition: "background-color 0.3s",
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step label */}
        <p className="text-center text-sm font-semibold text-[#C8A762] mb-8">
          {isRTL ? `الخطوة ${step} من 5` : `Step ${step} of 5`} —{" "}
          {stepLabels[step - 1]}
        </p>

        {/* Step content */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: "easeInOut" }}
          >
            {submitted ? (
              <SuccessState isRTL={isRTL} isDark={isDark} caseType={form.caseType} />
            ) : (
              <>
                {step === 1 && (
                  <Step1
                    isRTL={isRTL}
                    isDark={isDark}
                    selected={form.caseType}
                    onSelect={(t) => setForm((f) => ({ ...f, caseType: t }))}
                  />
                )}
                {step === 2 && (
                  <Step2
                    isRTL={isRTL}
                    isDark={isDark}
                    form={form}
                    setForm={setForm}
                  />
                )}
                {step === 3 && (
                  <SmartSchedulingPicker
                    mode="case"
                    selected={form.scheduling}
                    onSelect={(c) => setForm((f) => ({ ...f, scheduling: c }))}
                    isRTL={isRTL}
                    isDark={isDark}
                  />
                )}
                {step === 4 && (
                  <Step3
                    isRTL={isRTL}
                    isDark={isDark}
                    docs={form.documents}
                    recDocs={recDocs}
                    onAdd={addMockDoc}
                    onRemove={(i) =>
                      setForm((f) => ({
                        ...f,
                        documents: f.documents.filter((_, idx) => idx !== i),
                      }))
                    }
                  />
                )}
                {step === 5 && (
                  <Step4
                    isRTL={isRTL}
                    isDark={isDark}
                    form={form}
                    setForm={setForm}
                    budget={form.caseType ? BUDGET_MAP[form.caseType] : "—"}
                    onSubmit={handleSubmit}
                  />
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation buttons */}
        {!submitted && (
          <div className={`flex mt-8 gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
            {step > 1 && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={goPrev}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl border font-medium text-sm transition-colors ${
                  isDark
                    ? "border-gray-600 text-gray-300 hover:bg-[#161b22]"
                    : "border-gray-300 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {isRTL ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
                {isRTL ? "السابق" : "Back"}
              </motion.button>
            )}
            {step < 5 && (
              <motion.button
                whileHover={{ scale: canNext() ? 1.02 : 1 }}
                whileTap={{ scale: canNext() ? 0.98 : 1 }}
                onClick={goNext}
                disabled={!canNext()}
                className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
                  canNext()
                    ? "bg-[#0B3D2E] text-white hover:bg-[#0a3328] cursor-pointer"
                    : isDark
                      ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                {isRTL ? "التالي" : "Next"}
                {isRTL ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
              </motion.button>
            )}
          </div>
        )}
      </main>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
