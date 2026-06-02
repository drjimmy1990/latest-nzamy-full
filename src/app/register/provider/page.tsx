"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Gavel,
  Buildings,
  Stamp,
  Shield,
  Scales,
  ArrowLeft,
  ArrowRight,
  Check,
  EnvelopeSimple,
  Phone,
  Lock,
  Eye,
  EyeSlash,
  User,
  IdentificationCard,
  MapPin,
  UploadSimple,
  Star,
  Brain,
  CurrencyDollar,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

import { ProviderType, Step } from "./types";
import { StepIndicator, Step1, Step2, Step3, Step4, Step5 } from "./components/Steps";
import { setDemoSession, getPermissions } from "@/hooks/useUser";
import type { UserSession, UserType } from "@/hooks/useUser";

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RegisterProviderPage() {
  const { lang, theme, toggleTheme, toggleLang } = useTheme();
  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";

  const [step, setStep] = useState<Step>(1);
  const [providerType, setProviderType] = useState<ProviderType>(null);
  const [selectedPlan, setSelectedPlan] = useState("ai"); // default AI plan
  const [selectedSpecs, setSelectedSpecs] = useState<string[]>([]); // lifted state
  const [formData, setFormData] = useState<Record<string, string>>({});
  const handleChange = (k: string, v: string) => setFormData(d => ({ ...d, [k]: v }));

  const canNext = () => {
    if (step === 1) return providerType !== null;
    if (step === 2) return !!(formData.licenseNumber && formData.experience && formData.city);
    if (step === 3) return !!(formData.email && formData.phone && formData.password && formData.password.length >= 8);
    if (step === 4) return !!selectedPlan;
    return true;
  };

  const stepLabels = isAr
    ? ["نوع الحساب", "بياناتك المهنية", "الحساب والوثائق", "الباقة", "مكتمل"]
    : ["Account Type", "Professional Info", "Account & Docs", "Plan", "Done"];

  const totalSteps = 4;

  return (
    <div dir={dir} className="min-h-screen bg-surface font-body dark:bg-dark-bg transition-colors duration-300">
      <div className="flex min-h-screen">

        {/* ── Brand panel ── */}
        <div className="hidden md:flex md:w-[42%] lg:w-[46%] relative overflow-hidden bg-royal flex-col justify-between p-10 lg:p-14">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_80%,rgba(200,167,98,0.15),transparent_60%)]" />
            <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
              <defs><pattern id="grid2" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.5" /></pattern></defs>
              <rect width="100%" height="100%" fill="url(#grid2)" />
            </svg>
          </div>

          {/* Logo */}
          <div className="relative z-10">
            <a href="/" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white border border-white/20">
                <Scales weight="bold" size={22} />
              </div>
              <span className="font-brand text-2xl font-bold text-white">{isAr ? "نظامي" : "Nezamy"}</span>
            </a>
          </div>

          {/* Center */}
          <div className="relative z-10">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 border border-white/15 text-gold">
              <Gavel size={32} weight="duotone" />
            </div>
            <h2 className="font-brand text-3xl font-bold text-white">
              {isAr ? "انضم كمقدم خدمة" : "Join as Service Provider"}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              {isAr
                ? "انضم لآلاف المحامين والمتخصصين القانونيين الذين يثقون بنظامي لإدارة مكاتبهم وتطوير أعمالهم."
                : "Join thousands of lawyers and legal professionals who trust Nezamy to manage their offices and grow their practice."}
            </p>

            {/* Benefits */}
            <div className="mt-8 space-y-4">
              {[
                { icon: Brain, labelAr: "AI قانوني متقدم لمكتبك", labelEn: "Advanced legal AI for your firm" },
                { icon: CurrencyDollar, labelAr: "نظام Escrow لحماية أتعابك", labelEn: "Escrow system protects your fees" },
                { icon: Star, labelAr: "وصول لآلاف العملاء المحتملين", labelEn: "Access thousands of potential clients" },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-gold">
                      <Icon size={18} weight="duotone" />
                    </span>
                    <span className="text-sm text-white/80">{isAr ? item.labelAr : item.labelEn}</span>
                  </div>
                );
              })}
            </div>

            {/* Step tracker */}
            <div className="mt-10 space-y-2.5">
              {stepLabels.map((label, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    i + 1 < step ? "bg-gold text-white" : i + 1 === step ? "bg-white text-royal" : "bg-white/10 text-white/40"
                  }`}>
                    {i + 1 < step ? <Check size={12} weight="bold" /> : i + 1}
                  </div>
                  <span className={`text-sm transition-colors ${i + 1 === step ? "font-semibold text-white" : i + 1 < step ? "text-white/70" : "text-white/30"}`}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom */}
          <div className="relative z-10 text-sm text-white/40">
            {isAr ? "طالب خدمة؟" : "Looking for services?"}{" "}
            <a href="/register/client" className="text-gold hover:underline">{isAr ? "سجّل كعميل" : "Register as client"}</a>
          </div>
        </div>

        {/* ── Form panel ── */}
        <div className="flex flex-1 flex-col">
          {/* Top bar */}
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-dark-border md:px-8">
            <a href="/" className="flex items-center gap-2 md:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-royal text-white">
                <Scales weight="bold" size={18} />
              </div>
              <span className="font-brand text-xl font-bold text-royal">{isAr ? "نظامي" : "Nezamy"}</span>
            </a>
            <div className="hidden text-sm text-ink-muted dark:text-gray-400 md:flex">
              {isAr ? "تسجيل مقدم خدمة" : "Service Provider Registration"}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={toggleLang} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-royal dark:border-dark-border dark:text-gray-400 dark:hover:text-gold">
                {isAr ? "EN" : "عربي"}
              </button>
              <button onClick={toggleTheme} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-ink-muted dark:border-dark-border dark:text-gray-400">
                {theme === "light" ? "🌙" : "☀️"}
              </button>
            </div>
          </div>

          <div className="flex flex-1 items-start justify-center px-5 py-10 md:px-12 md:py-12">
            <div className="w-full max-w-[520px]">
              {/* Progress */}
              {step < 5 && (
                <div className="mb-8 flex items-center justify-between">
                  <StepIndicator step={step} total={totalSteps} />
                  <span className="text-xs text-ink-faint dark:text-gray-500">
                    {isAr ? `خطوة ${step} من ٤` : `Step ${step} of 4`}
                  </span>
                </div>
              )}

              {/* Step content */}
              <AnimatePresence mode="wait">
                {step === 1 && <Step1 key="s1" isAr={isAr} selected={providerType} onSelect={setProviderType} />}
                {step === 2 && <Step2 key="s2" isAr={isAr} providerType={providerType} data={formData} onChange={handleChange} selectedSpecs={selectedSpecs} setSelectedSpecs={setSelectedSpecs} />}
                {step === 3 && <Step3 key="s3" isAr={isAr} data={formData} onChange={handleChange} />}
                {step === 4 && <Step4 key="s4" isAr={isAr} selectedPlan={selectedPlan} onSelect={setSelectedPlan} />}
                {step === 5 && <Step5 key="s5" isAr={isAr} providerType={providerType} selectedPlan={selectedPlan} />}
              </AnimatePresence>

              {/* Navigation */}
              {step < 5 && (
                <div className="mt-8 flex items-center justify-between gap-3">
                  {step > 1 ? (
                    <button
                      onClick={() => setStep(s => (s - 1) as Step)}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-ink-muted transition-all hover:border-royal/20 hover:text-royal dark:border-white/10 dark:bg-dark-card dark:text-gray-400 dark:hover:text-gold"
                    >
                      {isAr ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
                      {isAr ? "السابق" : "Back"}
                    </button>
                  ) : (
                    <a href="/register" className="flex items-center gap-2 text-sm text-ink-muted hover:text-royal transition-colors dark:text-gray-400 dark:hover:text-gold">
                      {isAr ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
                      {isAr ? "تغيير نوع المستخدم" : "Change user type"}
                    </a>
                  )}
                  <motion.button
                    whileHover={{ scale: canNext() ? 1.02 : 1 }}
                    whileTap={{ scale: canNext() ? 0.98 : 1 }}
                    onClick={() => {
                      if (!canNext()) return;
                      if (step === 4) {
                        const userType: UserType = providerType === "firm" ? "firm" : providerType === "lawyer" ? "lawyer" : "provider";
                        const session: UserSession = {
                          isLoggedIn: true,
                          userType,
                          subRole: providerType === "notary" ? "notary" : providerType === "arbitrator" ? "arbitrator" : providerType === "tracker" ? "bailiff" : null,
                          name: formData.firmName || `${formData.firstName || ""} ${formData.lastName || ""}`.trim() || "شريك نظامي",
                          tier: selectedPlan === "pro" ? "pro" : selectedPlan === "lite" ? "free" : "ai",
                          credits: 50,
                          creditsMax: 100,
                          dashboardMode: "full",
                          permissions: getPermissions(userType, selectedPlan === "pro" ? "pro" : selectedPlan === "lite" ? "free" : "ai"),
                          country: formData.country || "SA",
                          providerSpecialties: selectedSpecs,
                        };
                        setDemoSession(session);
                        setStep(5);
                      } else {
                        setStep(s => (s + 1) as Step);
                      }
                    }}
                    disabled={!canNext()}
                    className="flex-1 rounded-xl bg-royal py-3.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] transition-all disabled:opacity-40 hover:bg-royal-light hover:shadow-[0_8px_24px_-4px_rgba(11,61,46,0.5)]"
                  >
                    {step === 4
                      ? (isAr ? "أرسل الطلب" : "Submit Application")
                      : (isAr ? "التالي" : "Next")}
                  </motion.button>
                </div>
              )}

              {step === 1 && (
                <p className="mt-5 text-center text-xs text-ink-muted dark:text-gray-400">
                  {isAr ? "لديك حساب بالفعل؟" : "Already have an account?"}{" "}
                  <a href="/login" className="font-semibold text-royal hover:underline dark:text-gold">{isAr ? "سجّل دخولك" : "Sign in"}</a>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
