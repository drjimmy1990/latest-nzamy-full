"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import {
  User,
  Buildings,
  Bank,
  Handshake,
  ArrowLeft,
  ArrowRight,
  Check,
  EnvelopeSimple,
  Phone,
  Lock,
  Eye,
  EyeSlash,
  Scales,
  Shield,
  Star,
  IdentificationCard,
  MapPin,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

import { ClientType, Step } from "./types";
import { StepIndicator, Step1, Step2, Step3, Step4 } from "./components/Steps";
import { setDemoSession, getPermissions } from "@/hooks/useUser";
import type { UserSession, UserType } from "@/hooks/useUser";
import { createClient } from "@/lib/supabase/client";

const BACKEND_MODE = process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND ?? "demo";

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RegisterClientPage() {
  const { lang, theme, toggleTheme, toggleLang } = useTheme();
  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";

  const [step, setStep] = useState<Step>(1);
  const [clientType, setClientType] = useState<ClientType>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Pre-select type from URL query param (e.g. ?type=individual)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type") as ClientType;
    if (type && ["individual", "company", "government", "ngo"].includes(type)) {
      setClientType(type);
      setStep(2);
    }
  }, []);
  const [formData, setFormData] = useState<Record<string, string>>({});

  const handleChange = (key: string, val: string) => setFormData((d) => ({ ...d, [key]: val }));

  const canNext = () => {
    if (step === 1) return clientType !== null;
    if (step === 2) return !!(formData.email && formData.phone);
    if (step === 3) return !!(formData.password && formData.password === formData.confirmPassword && formData.password.length >= 8);
    return true;
  };

  const stepLabels = isAr
    ? ["نوع الحساب", "بياناتك", "كلمة المرور", "مكتمل"]
    : ["Account Type", "Your Info", "Password", "Done"];

  return (
    <div dir={dir} className="min-h-screen bg-surface font-body dark:bg-dark-bg transition-colors duration-300">
      <div className="flex min-h-screen">

        {/* ── Brand panel ── */}
        <div className="hidden md:flex md:w-[42%] lg:w-[46%] relative overflow-hidden bg-royal flex-col justify-between p-10 lg:p-14">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(200,167,98,0.12),transparent_60%)]" />
            <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
                  <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
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

          {/* Center content */}
          <div className="relative z-10">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 border border-white/15 text-gold">
              <Scales size={32} weight="duotone" />
            </div>
            <h2 className="font-brand text-3xl font-bold text-white">
              {isAr ? "أهلاً بك في نظامي" : "Welcome to Nezamy"}
            </h2>
            <p className="mt-3 text-white/60 text-sm leading-relaxed">
              {isAr
                ? "أنشئ حسابك كطالب خدمة والوصول إلى أفضل المحامين والخدمات القانونية في المملكة."
                : "Create your service-seeker account and access the best lawyers and legal services in Saudi Arabia."}
            </p>

            {/* Step tracker */}
            <div className="mt-10 space-y-3">
              {stepLabels.map((label, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
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
            {isAr ? "مسجّل بالفعل؟" : "Already registered?"}{" "}
            <a href="/login" className="text-gold hover:underline">{isAr ? "سجّل دخولك" : "Sign in"}</a>
          </div>
        </div>

        {/* ── Form panel ── */}
        <div className="flex flex-1 flex-col">
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-dark-border md:px-8">
            <a href="/" className="flex items-center gap-2 md:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-royal text-white">
                <Scales weight="bold" size={18} />
              </div>
              <span className="font-brand text-xl font-bold text-royal">{isAr ? "نظامي" : "Nezamy"}</span>
            </a>
            <div className="hidden md:flex items-center gap-2 text-sm text-ink-muted dark:text-gray-400">
              {isAr ? "تسجيل طالب خدمة" : "Service Seeker Registration"}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleLang}
                className="rounded-lg border border-slate-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-royal transition-colors dark:text-gray-400 dark:hover:text-gold"
              >
                {isAr ? "EN" : "عربي"}
              </button>
              <button
                onClick={toggleTheme}
                className="rounded-lg border border-slate-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-royal transition-colors dark:text-gray-400"
              >
                {theme === "light" ? "🌙" : "☀️"}
              </button>
            </div>
          </div>

          <div className="flex flex-1 items-start justify-center px-5 py-10 md:py-12 md:px-12">
            <div className="w-full max-w-[480px]">
              {/* Progress */}
              {step < 4 && (
                <div className="mb-8">
                  <div className="mb-4 flex items-center justify-between">
                    <StepIndicator step={step} total={3} />
                    <span className="text-xs text-ink-faint dark:text-gray-500">
                      {isAr ? `خطوة ${step} من ٣` : `Step ${step} of 3`}
                    </span>
                  </div>
                </div>
              )}

              {/* Step content */}
              <AnimatePresence mode="wait">
                {step === 1 && (
                  <Step1 key="s1" isAr={isAr} selected={clientType} onSelect={setClientType} />
                )}
                {step === 2 && (
                  <Step2 key="s2" isAr={isAr} clientType={clientType} data={formData} onChange={handleChange} />
                )}
                {step === 3 && (
                  <Step3 key="s3" isAr={isAr} data={formData} onChange={handleChange} />
                )}
                {step === 4 && (
                  <Step4 key="s4" isAr={isAr} clientType={clientType} />
                )}
              </AnimatePresence>

              {/* Navigation */}
              {step < 4 && (
                <div className="mt-8 flex items-center justify-between gap-3">
                  {step > 1 ? (
                    <button
                      onClick={() => setStep((s) => (s - 1) as Step)}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-ink-muted transition-all hover:border-royal/20 hover:text-royal dark:border-white/10 dark:bg-dark-card dark:text-gray-400 dark:hover:text-gold"
                    >
                      {isAr ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
                      {isAr ? "السابق" : "Back"}
                    </button>
                  ) : (
                    <a
                      href="/register"
                      className="flex items-center gap-2 text-sm text-ink-muted hover:text-royal transition-colors dark:text-gray-400 dark:hover:text-gold"
                    >
                      {isAr ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
                      {isAr ? "تغيير نوع المستخدم" : "Change user type"}
                    </a>
                  )}
                  <motion.button
                    whileHover={{ scale: canNext() ? 1.02 : 1 }}
                    whileTap={{ scale: canNext() ? 0.98 : 1 }}
                    onClick={async () => {
                      if (!canNext()) return;
                      if (step === 3) {
                        const userType: UserType = clientType === "individual" ? "individual" : clientType === "company" ? "corporate" : clientType === "micro" ? "micro" : clientType === "government" ? "government" : clientType === "ngo" ? "ngo" : "individual";
                        const displayName = formData.companyName || formData.entityName || formData.ngoName || `${formData.firstName || ""} ${formData.lastName || ""}`.trim() || "عميل نظامي";

                        // ── Supabase Mode ──
                        if (BACKEND_MODE === "supabase") {
                          setAuthLoading(true);
                          setAuthError(null);
                          try {
                            const supabase = createClient();
                            const { error } = await supabase.auth.signUp({
                              email: formData.email,
                              password: formData.password,
                              phone: formData.phone ? `+${formData.countryCode || "966"}${formData.phone}` : undefined,
                              options: {
                                data: {
                                  user_type: userType,
                                  display_name: displayName,
                                  full_name: displayName,
                                  tier: "free",
                                  sub_role: null,
                                  country_code: formData.country || "SA",
                                  city: formData.city || null,
                                  credit_balance: 0,
                                  credits_max: 0,
                                  display_mode: "full",
                                  onboarding_completed: true,
                                  // Type-specific metadata
                                  ...(clientType === "individual" && {
                                    id_number: formData.idNumber,
                                  }),
                                  ...(clientType === "company" && {
                                    business_type: "corporate",
                                    cr_number: formData.crNumber,
                                  }),
                                  ...(clientType === "micro" && {
                                    business_type: "micro",
                                    cr_number: formData.crNumber,
                                  }),
                                  ...(clientType === "government" && {
                                    government_role: formData.governmentRole || "gov_counsel",
                                    officer_specialty: formData.officerSpecialty || null,
                                  }),
                                  ...(clientType === "ngo" && {
                                    ngo_reg_number: formData.ngoRegNumber,
                                  }),
                                },
                              },
                            });

                            if (error) {
                              setAuthError(
                                error.message === "User already registered"
                                  ? (isAr ? "البريد الإلكتروني مسجل بالفعل" : "This email is already registered")
                                  : error.message
                              );
                              setAuthLoading(false);
                              return;
                            }

                            setStep(4);
                          } catch {
                            setAuthError(isAr ? "حدث خطأ، حاول مرة أخرى" : "An error occurred, please try again");
                          } finally {
                            setAuthLoading(false);
                          }
                          return;
                        }

                        // ── Demo Mode ──
                        const session: UserSession = {
                          isLoggedIn: true,
                          userType,
                          subRole: null,
                          name: displayName,
                          tier: "pro",
                          credits: 100,
                          creditsMax: 100,
                          dashboardMode: "full",
                          permissions: getPermissions(userType, "pro"),
                          country: formData.country || "SA",
                          businessRole: userType === "corporate" ? "owner" : undefined,
                        };
                        setDemoSession(session);
                        setStep(4);
                      } else {
                        setStep((s) => (s + 1) as Step);
                      }
                    }}
                    disabled={!canNext() || authLoading}
                    className="flex-1 rounded-xl bg-royal py-3.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] transition-all disabled:opacity-40 hover:bg-royal-light hover:shadow-[0_8px_24px_-4px_rgba(11,61,46,0.5)]"
                  >
                    {authLoading
                      ? (isAr ? "جاري التسجيل..." : "Creating account...")
                      : step === 3
                        ? (isAr ? "إنشاء الحساب" : "Create Account")
                        : (isAr ? "التالي" : "Next")}
                  </motion.button>
                </div>
              )}

              {/* Auth error */}
              {authError && step === 3 && (
                <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
                  {authError}
                </div>
              )}

              {/* OR Google */}
              {step === 1 && (
                <div className="mt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
                    <span className="text-xs text-ink-faint dark:text-gray-600 uppercase">{isAr ? "أو" : "OR"}</span>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
                  </div>
                  <button
                    onClick={async () => {
                      if (BACKEND_MODE === "supabase") {
                        const supabase = createClient();
                        await supabase.auth.signInWithOAuth({
                          provider: "google",
                          options: { redirectTo: `${window.location.origin}/auth/callback` },
                        });
                      }
                    }}
                    className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-3.5 text-sm font-semibold text-ink transition-all hover:border-slate-300 dark:border-white/10 dark:bg-dark-card dark:text-gray-200"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    {isAr ? "التسجيل بحساب Google" : "Sign up with Google"}
                  </button>
                  <p className="mt-4 text-center text-xs text-ink-muted dark:text-gray-400">
                    {isAr ? "لديك حساب؟" : "Already have an account?"}{" "}
                    <a href="/login" className="font-semibold text-royal hover:underline dark:text-gold">{isAr ? "سجّل دخولك" : "Sign in"}</a>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
