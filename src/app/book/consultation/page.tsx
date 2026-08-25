"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";

import { specialties, consultationTypes } from "@/components/consultation/constants";
import { useConsultationForm } from "@/hooks/useConsultationForm";
import { StepBar } from "@/components/consultation/StepBar";
import { StepSpecialty } from "@/components/consultation/steps/StepSpecialty";
import { StepDescription } from "@/components/consultation/steps/StepDescription";
import { StepScheduling } from "@/components/consultation/steps/StepScheduling";
import { StepConfirm } from "@/components/consultation/steps/StepConfirm";

export default function BookConsultationPage() {
  const { lang } = useTheme();
  const isAr = lang === "ar";
  const s = useConsultationForm();

  const specialtyList = isAr ? specialties.ar : specialties.en;
  const typeList = isAr ? consultationTypes.ar : consultationTypes.en;
  const selectedSpecialty = specialtyList.find(sp => sp.id === s.specialty);
  const selectedType = typeList.find(t => t.id === s.consultType);

  /**
   * The wizard holds machine ids; the order the نظامي team reads has to hold
   * the Arabic the client actually saw. Those labels live in the
   * language-resolved lists on this page, so the page — not the hook — is what
   * hands them to submitBooking(). The Arabic list is used deliberately even
   * when the UI is in English: this is what a Saudi legal team reads off the
   * admin queue, and the price string travels with it so the two can never
   * disagree about what was quoted as an estimate.
   */
  const handleSubmit = () => {
    const arSpecialty = specialties.ar.find(sp => sp.id === s.specialty);
    const arType = consultationTypes.ar.find(t => t.id === s.consultType);
    void s.submitBooking({
      specialtyLabel: arSpecialty?.label ?? selectedSpecialty?.label ?? "غير محدد",
      consultTypeLabel: arType?.label ?? selectedType?.label ?? "غير محدد",
      estimatedPrice: arType?.price ?? selectedType?.price ?? "",
    });
  };

  const slideVariants = {
    enter: (dir: number) => ({ opacity: 0, x: dir * (isAr ? -40 : 40) }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir * (isAr ? 40 : -40) }),
  };

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-surface pb-24 pt-28 dark:bg-dark-bg transition-colors duration-300 md:pt-32">
        <div className="mx-auto max-w-[720px] px-4">
          
          {/* Breadcrumb */}
          <div className="mb-6 flex items-center gap-2 text-xs text-ink-faint dark:text-gray-500">
            {/* This page is public (absent from PROTECTED in src/proxy.ts), so
                the crumb points somewhere a signed-out visitor can actually go —
                /dashboard/client is gated to `individual` accounts and bounced
                everyone else, including guests. */}
            <Link href="/" className="hover:text-royal dark:hover:text-gold transition-colors">{isAr ? "الرئيسية" : "Home"}</Link>
            <span>/</span>
            <span className="text-ink-muted dark:text-gray-400">{isAr ? "احجز استشارة" : "Book Consultation"}</span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="font-brand text-2xl font-extrabold text-royal dark:text-white md:text-3xl">
              {isAr ? "احجز استشارة قانونية" : "Book a Legal Consultation"}
            </h1>
            {/* «استجابة خلال ١٥–٢٠ دقيقة» was a service-level promise nothing in
                the app could keep: every request is fulfilled by hand by the
                نظامي team from the admin queue. What is true is that sending
                costs nothing and the quote comes afterwards. */}
            <p className="mt-1 text-sm text-ink-muted dark:text-gray-400">
              {isAr
                ? "أرسل طلبك مجاناً — يراجعه فريق نظامي ويعود إليك بالموعد وعرض السعر"
                : "Send your request free — the Nezamy team reviews it and returns with a time and a quote"}
            </p>
          </div>

          {/* Step bar */}
          <div className="mb-8">
            <StepBar step={s.step} isAr={isAr} />
          </div>

          {/* Card */}
          <div className="overflow-hidden rounded-[2rem] border border-slate-200/50 bg-white shadow-[0_8px_40px_-10px_rgba(0,0,0,0.08)] dark:border-white/10 dark:bg-dark-card">
            <AnimatePresence mode="wait" custom={s.dir}>
              <motion.div key={s.step} custom={s.dir} variants={slideVariants as any} initial="enter" animate="center" exit="exit" transition={{ type: "spring", stiffness: 300, damping: 30 }} className="p-6 md:p-8">
                
                {s.step === 1 && <StepSpecialty isAr={isAr} specialtyList={specialtyList} specialty={s.specialty} setSpecialty={s.setSpecialty} />}
                
                {s.step === 2 && <StepDescription isAr={isAr} selectedSpecialty={selectedSpecialty} description={s.description} setDescription={s.setDescription} files={s.files} addFiles={s.addFiles} removeFile={s.removeFile} fileError={s.fileError} />}

                {s.step === 3 && <StepScheduling isAr={isAr} typeList={typeList} consultType={s.consultType} setConsultType={s.setConsultType} scheduleMode={s.scheduleMode} setScheduleMode={s.setScheduleMode} calDay={s.calDay} setCalDay={s.setCalDay} calTime={s.calTime} setCalTime={s.setCalTime} asapDone={s.asapDone} setAsapDone={s.setAsapDone} instantConfirmed={s.instantConfirmed} setInstantConfirmed={s.setInstantConfirmed} />}

                {s.step === 4 && (
                  <StepConfirm
                    isAr={isAr}
                    confirmed={s.confirmed}
                    selectedSpecialty={selectedSpecialty}
                    description={s.description}
                    consultType={s.consultType}
                    selectedType={selectedType}
                    scheduleMode={s.scheduleMode}
                    calDay={s.calDay}
                    calTime={s.calTime}
                    fileCount={s.files.length}
                    onSubmit={handleSubmit}
                    submitting={s.submitting}
                    submitError={s.submitError}
                    referenceId={s.referenceId}
                    attachFailures={s.attachFailures}
                    skippedNames={s.skippedNames}
                    isLoggedIn={s.isLoggedIn}
                    sessionLoading={s.sessionLoading}
                    backendDisabled={s.backendDisabled}
                  />
                )}

              </motion.div>
            </AnimatePresence>

            {/* Navigation (hide on success state) */}
            {(!s.confirmed || s.step < 4) && (
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-6 py-4 dark:border-white/5 dark:bg-white/[0.02] md:px-8">
                {/* Locked while a submission is in flight. Otherwise the client
                    could step back mid-upload and then be thrown onto the
                    success screen from step 3 when the request resolves. */}
                <button
                  onClick={s.goPrev}
                  disabled={s.step === 1 || s.submitting}
                  className={`flex items-center gap-2 text-sm font-medium transition-colors ${s.step === 1 || s.submitting ? "cursor-not-allowed text-slate-300 dark:text-gray-600" : "text-ink-muted hover:text-royal dark:text-gray-400 dark:hover:text-gold"}`}
                >
                  <ArrowRight size={16} />
                  {isAr ? "السابق" : "Back"}
                </button>
                <div className="text-xs text-slate-400 dark:text-gray-500">
                  {s.step} / 4
                </div>
                {s.step < 4 && (
                  <button
                    onClick={s.goNext}
                    disabled={!s.canNext()}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                      s.canNext()
                        ? "bg-royal text-white hover:bg-royal/90 shadow-sm"
                        : "cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-gray-600"
                    }`}
                  >
                    {isAr ? "التالي" : "Next"}
                    <ArrowLeft size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
