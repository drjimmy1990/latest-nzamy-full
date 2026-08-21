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
import { createClient } from "@/lib/supabase/client";

const BACKEND_MODE = process.env.NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND ?? "demo";

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
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const handleChange = (k: string, v: string) => setFormData(d => ({ ...d, [k]: v }));

  // Google sign-up. Same provider and same `redirectTo` as /login and
  // /register/client — one OAuth entry point, one callback.
  //
  // Reachable from the button for all five roles now (see `googleSignUpWorks`
  // below). It does not read `providerType` at all: nothing about the selected
  // role travels to Google or into the callback. The role is chosen again,
  // after sign-in, on the authenticated onboarding page — which is also where
  // a موثّق / معقّب / محكّم names their specialty.
  //
  // Deliberately NO user_type in `redirectTo` and no type query parameter:
  // anything in a URL is user-editable, and `admin` is a real value of the
  // profiles.user_type CHECK constraint, so a type in the URL would be an
  // escalation surface. The account type is chosen after sign-in, on an
  // authenticated page. Do not "optimise" a type back into this URL.
  async function handleGoogleSignUp() {
    if (BACKEND_MODE !== "supabase") return;
    setGoogleError(null);
    setGoogleLoading(true);
    const failed = () => {
      setGoogleError(
        isAr
          ? "تعذّر بدء التسجيل عبر Google. حاول مرة أخرى أو أكمل التسجيل بالبريد الإلكتروني."
          : "Could not start Google sign-up. Try again, or continue with email registration."
      );
      setGoogleLoading(false);
    };
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      // signInWithOAuth builds the authorize URL in the browser and calls
      // window.location.assign on it; it does not call Supabase first, and it
      // returns `error: null` on that path (@supabase/auth-js
      // _handleProviderSignIn). So "provider is not enabled" — the state this
      // ships in until Google is configured — cannot be reported here: the
      // browser has already left. It surfaces only after the redirect, on
      // Supabase's side. This check is therefore defensive only.
      //
      // What IS reachable here is a purely local failure: createClient() throws
      // when NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are missing from the build,
      // and storing the PKCE verifier throws when storage is unavailable. Those
      // throw rather than return, so the catch below is what renders the error.
      if (error) failed();
      // On success the browser leaves for Google; keep the button disabled.
    } catch {
      failed();
    }
  }

  /**
   * The two sign-up routes this page offers, as two predicates, because they
   * are in two different states. One predicate standing for both — which is
   * what this file used to have — can no longer say anything true about either.
   *
   * ── googleSignUpWorks: all five roles ────────────────────────────────────
   * This screen offers five roles and only two of them — `lawyer` and `firm` —
   * are `profiles.user_type` values in their own right (see the `userType`
   * line in the submit handler below). `notary`, `tracker` and `arbitrator`
   * are the single user_type `provider`, separated by a `sub_role` of
   * 'notary' / 'bailiff' / 'arbitrator' (:375).
   *
   * That used to be why Google could not produce them: the onboarding picker
   * had no provider option, and the claim route provisioned the sector row
   * from the resolved user_type alone, so no discriminant survived the trip
   * and three options could only have been filed as one specialty.
   *
   * Both halves of that are now closed, in application code:
   *   - the onboarding picker offers موثّق, معقّب and محكّم as three separate
   *     options, using these same three ids (src/app/onboarding/page.tsx);
   *   - `POST /api/v1/onboarding/account-type` takes a `subRole` beside the
   *     `pickerId`, validates it against the `provider_profiles.sub_role`
   *     CHECK list AND against the option chosen, refuses rather than
   *     defaulting, and writes the row itself
   *     (src/app/api/v1/onboarding/account-type/route.ts;
   *     `AccountTypeGrant` and `sectorRowValuesFor` in
   *     src/lib/auth/accountTypeClaim.ts).
   *
   * None of that depends on the migration below: the claim creates the
   * `provider_profiles` row in TypeScript, not through the signup trigger.
   *
   * (Whether Google itself answers is a separate, deployment-time question —
   * see `handleGoogleSignUp`, where the "provider is not enabled" case can
   * only surface after the redirect, on Supabase's side.)
   *
   * ── emailSignUpWorks: lawyer and firm only, and why it stays that way ────
   * The email submit at step 4 goes through the signup trigger, and the LIVE
   * trigger's provider branch is, in full:
   *
   *   INSERT INTO public.provider_profiles (user_id)
   *   VALUES (new.id) ON CONFLICT (user_id) DO NOTHING;
   *
   * (supabase/migrations/20260716_security_hardening.sql:53-56 — the latest
   * CREATE OR REPLACE of `handle_new_user`, bound AFTER INSERT ON auth.users
   * at supabase/migrations/20260630_handle_new_user_sectors.sql:111-114.)
   * This page sends `sub_role` in `options.data` (:395) and that branch never
   * reads it. `sub_role` is NOT NULL with no default
   * (supabase/migrations/20260603_phase1_001_profiles.sql:159-160), and ON
   * CONFLICT resolves unique/PK conflicts only — it does not suppress a 23502
   * not_null_violation. The function has no EXCEPTION block, so the error
   * aborts the `auth.users` insert and `signUp` returns a database error,
   * which this page renders verbatim at :420-425.
   * supabase/migrations/20260614_auto_create_role_profiles.sql:122-125 had the
   * `COALESCE(new.raw_user_meta_data->>'sub_role', 'notary')` clamp that makes
   * it work; supabase/migrations/20260616_production_readiness_fixes.sql:139-142
   * dropped it, and 20260630 and 20260716 carried the bare insert forward.
   *
   * supabase/migrations/20260821_fix_provider_signup_sub_role.sql restores that
   * clamp — WRITTEN, NOT APPLIED. A migration file does not apply itself, so
   * until the owner runs it against the live database the paragraph above
   * still describes production.
   *
   * The `lawyer` and `firm` branches were checked the same way and are sound:
   * `lawyer_profiles` has no NOT NULL column without a default beyond its
   * `user_id` PK (…20260603_phase1_001_profiles.sql:92-93, plus
   * `is_accepting_clients BOOLEAN NOT NULL DEFAULT true` at
   * …20260616_production_readiness_fixes.sql:13), and `firm_profiles`'s only
   * such column is `name_ar`, which the trigger supplies
   * (…20260603_phase1_002_entities.sql:36-39, trigger at …20260716:59-64).
   *
   * ── Why "التالي" stays gated, now that Google is not gated ───────────────
   * The choice was between leaving the gate and lifting it early, and the
   * balance moved in favour of leaving it. Lifting it is correct only AFTER
   * the migration runs; if the code is deployed first — which is the normal
   * order — every موثّق, معقّب and محكّم who pressed "التالي" would fill in a
   * licence number, upload documents, choose a plan and receive a raw English
   * Postgres error at the last step. This project's rule is that no control
   * may remain on screen whose action cannot succeed, and that is the rule
   * exactly.
   *
   * What the gate costs is now much smaller than it was. It no longer denies
   * these three an ACCOUNT — the Google button above does that, for all five
   * roles. What it withholds is the professional file: the licence number and
   * the documents, which only this form collects. The note below offers
   * /contact for that, which is a real page whose form POSTs to
   * /api/v1/contact.
   *
   * ── Reversal condition — MET, 21 August 2026 ─────────────────────────────
   * 20260821 was reported run against the live database, which was the single
   * stated condition above, so `emailSignUpWorks` is now `providerType !== null`
   * and the amber note stops rendering by itself.
   *
   * The paragraphs above are kept deliberately rather than deleted. They are
   * the record of why the gate existed and of what has to stay true for it to
   * stay lifted: if 20260821 is rolled back, or a later CREATE OR REPLACE of
   * handle_new_user drops the sub_role clamp again — which is exactly how this
   * broke in the first place, at 20260616 — this line goes back to
   * `providerType === "lawyer" || providerType === "firm"` and the note
   * returns with it.
   */
  const googleSignUpWorks = providerType !== null;
  const emailSignUpWorks = providerType !== null;

  const canNext = () => {
    // Step 1 is gated on more than "a role is selected". For موثّق, معقّب and
    // محكّم the EMAIL submit at step 4 cannot succeed in Supabase mode (see
    // `emailSignUpWorks` above), so letting "التالي" through would walk the
    // user across a licence number, a password and a plan into a database
    // error in English. The project rule is that no control stays on screen
    // whose action cannot succeed; this is that rule applied to the Next
    // button. Their working route is the Google button, which is not gated.
    // Demo mode is exempt because it never calls Supabase — `setDemoSession`
    // completes locally for all five roles.
    if (step === 1) return providerType !== null && (BACKEND_MODE !== "supabase" || emailSignUpWorks);
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
                    onClick={async () => {
                      if (!canNext()) return;
                      if (step === 4) {
                        const userType: UserType = providerType === "firm" ? "firm" : providerType === "lawyer" ? "lawyer" : "provider";
                        const subRole = providerType === "notary" ? "notary" as const : providerType === "arbitrator" ? "arbitrator" as const : providerType === "tracker" ? "bailiff" as const : null;
                        const displayName = formData.firmName || `${formData.firstName || ""} ${formData.lastName || ""}`.trim() || "شريك نظامي";
                        const tier = selectedPlan === "pro" ? "pro" as const : selectedPlan === "lite" ? "free" as const : "ai" as const;

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
                                  tier,
                                  sub_role: subRole,
                                  country_code: formData.country || "SA",
                                  city: formData.city || null,
                                  credit_balance: 0,
                                  credits_max: 0,
                                  display_mode: "full",
                                  onboarding_completed: false,
                                  provider_type: providerType,
                                  provider_specialties: selectedSpecs,
                                  verification_docs: formData.verification_docs
                                    ? formData.verification_docs.split(", ")
                                    : [],
                                  license_number: formData.licenseNumber,
                                  experience_years: formData.experience,
                                  selected_plan: selectedPlan,
                                  ...(providerType === "arbitrator" && {
                                    arbitration_center: formData.arbitrationCenter,
                                  }),
                                  ...(providerType === "tracker" && {
                                    gov_entity: formData.govEntity,
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

                            setStep(5);
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
                          subRole,
                          name: displayName,
                          tier,
                          credits: 50,
                          creditsMax: 100,
                          dashboardMode: "full",
                          permissions: getPermissions(userType, tier),
                          country: formData.country || "SA",
                          providerSpecialties: selectedSpecs,
                        };
                        setDemoSession(session);
                        setStep(5);
                      } else {
                        setStep(s => (s + 1) as Step);
                      }
                    }}
                    disabled={!canNext() || authLoading}
                    className="flex-1 rounded-xl bg-royal py-3.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] transition-all disabled:opacity-40 hover:bg-royal-light hover:shadow-[0_8px_24px_-4px_rgba(11,61,46,0.5)]"
                  >
                    {authLoading
                      ? (isAr ? "جاري التسجيل..." : "Creating account...")
                      : step === 4
                        ? (isAr ? "أرسل الطلب" : "Submit Application")
                        : (isAr ? "التالي" : "Next")}
                  </motion.button>
                </div>
              )}

              {/* Auth error */}
              {authError && step === 4 && (
                <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
                  {authError}
                </div>
              )}

              {/* OR Google — step 1 only, before any professional data is typed,
                  so nothing the user entered is lost by switching route.
                  Rendered only in Supabase mode: in demo mode there is no auth
                  backend at all, and a button that cannot do anything must not
                  be on screen.

                  Shown for all five roles now: a Google sign-up can finish for
                  every one of them, including موثّق, معقّب and محكّم, because
                  the onboarding picker offers those three and the account-type
                  claim carries the specialty into `provider_profiles.sub_role`.
                  See `googleSignUpWorks` above. "التالي" is still disabled for
                  those three — that is the EMAIL route, and it is a separate
                  predicate for a separate reason. */}
              {step === 1 && BACKEND_MODE === "supabase" && googleSignUpWorks && (
                <div className="mt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
                    <span className="text-xs text-ink-faint dark:text-gray-600 uppercase">{isAr ? "أو" : "OR"}</span>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
                  </div>
                  <button
                    onClick={handleGoogleSignUp}
                    disabled={googleLoading}
                    className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-3.5 text-sm font-semibold text-ink transition-all disabled:opacity-40 hover:border-slate-300 dark:border-white/10 dark:bg-dark-card dark:text-gray-200"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    {googleLoading
                      ? (isAr ? "جاري التحويل إلى Google..." : "Redirecting to Google...")
                      : (isAr ? "المتابعة بحساب Google" : "Continue with Google")}
                  </button>

                  {googleError && (
                    <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
                      {googleError}
                    </div>
                  )}

                  {/* Every clause here is checked against what the code does:

                      - "لا يُرسل رقم الترخيص…" — the OAuth call carries no
                        `data` payload at all (see handleGoogleSignUp).
                      - the names in quotes are verbatim the onboarding
                        picker's own labels — «محامي / مستشار» and «شركة
                        محاماة» for lawyer and firm, «موثّق» / «معقّب» /
                        «محكّم» for the other three
                        (src/app/onboarding/page.tsx) — so the user is told the
                        words they will actually see on the next screen.
                      - "رقم جوالك" — onboarding will not advance without a
                        Saudi mobile; saying so here stops it being a surprise.
                      - "غير موثّق … لا يظهر في نتائج البحث" — the claim creates
                        lawyer_profiles / firm_profiles / provider_profiles, but
                        verification_status takes its column default of
                        'pending' in every one of them
                        (…20260603_phase1_001_profiles.sql:110 and :167,
                        …_002_entities.sql:56). The marketplace requires
                        'verified' (…20260815_marketplace_excludes_ai_workspace.sql:49),
                        and so does the public-read RLS policy on
                        lawyer_profiles itself (…_001_profiles.sql:133).
                        So the file is genuinely not listed, and this paragraph
                        must not imply it was submitted or is under review.

                      The last sentence differs by role, and it has to: for a
                      lawyer or a firm the email steps on this page are the way
                      to submit the full professional file, and for the other
                      three those steps are not available yet — the trigger
                      repair is written and unapplied (see `emailSignUpWorks`).
                      Saying "complete the email registration" to a موثّق would
                      point at a "التالي" that is deliberately disabled. */}
                  <p className="mt-3 text-xs leading-relaxed text-ink-muted dark:text-gray-400">
                    {isAr
                      ? (emailSignUpWorks
                          ? "يُنشئ Google حسابك فقط، ولا يُرسل رقم الترخيص أو التخصص أو الوثائق. بعد تسجيل الدخول تختار «محامي / مستشار» أو «شركة محاماة» وتُدخل رقم جوالك، فتصل إلى لوحة التحكم — ويبقى ملفك المهني غير موثّق ولا يظهر في نتائج البحث حتى تراجعه إدارة المنصّة. ولتقديم ملفك المهني كاملاً الآن، أكمل خطوات التسجيل بالبريد الإلكتروني في هذه الصفحة."
                          : "يُنشئ Google حسابك فقط، ولا يُرسل رقم الترخيص أو التخصص أو الوثائق. بعد تسجيل الدخول تختار «موثّق» أو «معقّب» أو «محكّم» وتُدخل رقم جوالك، فيُسجَّل تخصصك مع حسابك وتصل إلى لوحة التحكم — ويبقى ملفك المهني غير موثّق ولا يظهر في نتائج البحث حتى تراجعه إدارة المنصّة.")
                      : (emailSignUpWorks
                          ? "Google creates your account only — it does not send your licence number, specialty or documents. After signing in you choose “Lawyer / Consultant” or “Law Firm” and enter your mobile number, which brings you to your dashboard — your professional file stays unverified and does not appear in search results until the platform administrators review it. To submit your full professional application now, complete the email registration steps on this page."
                          : "Google creates your account only — it does not send your licence number, specialty or documents. After signing in you choose “Notary”, “Gov. Agent” or “Arbitrator” and enter your mobile number, which records your specialty with your account and brings you to your dashboard — your professional file stays unverified and does not appear in search results until the platform administrators review it.")}
                  </p>
                </div>
              )}

              {/* The other three roles: the Google button above IS shown to
                  them now, and "التالي" is still disabled. That combination is
                  the whole point of this note, and it is why the copy is
                  scoped so carefully.

                  What it must be true about, at the same time:
                    - the EMAIL form ON THIS PAGE cannot create these three
                      accounts until 20260821 is applied to the live database
                      (see `emailSignUpWorks`), so it must not point at
                      "التالي";
                    - and it must NOT say a service-provider account cannot be
                      created at all, which is what this block used to say
                      ("لا عبر Google ولا بالبريد الإلكتروني"). That sentence
                      became false the moment the onboarding picker gained the
                      three options and the claim route learned to carry a
                      sub_role.

                  So it names the route that exists and the route that does
                  not, and says which step is missing for the second — without
                  claiming anything about whether Google is configured, which
                  this page cannot know (see handleGoogleSignUp).

                  /contact stays: it is a real page whose form POSTs to
                  /api/v1/contact, and it is the only way to hand over a
                  licence number and documents while this form is gated.

                  Gated on Supabase mode because in demo mode there is no
                  trigger to fail: `setDemoSession` completes locally for all
                  five roles and `canNext` leaves "التالي" enabled there.

                  When the owner confirms 20260821 has run, `emailSignUpWorks`
                  becomes `providerType !== null` and this block stops
                  rendering by itself. */}
              {step === 1 && BACKEND_MODE === "supabase" && providerType !== null && !emailSignUpWorks && (
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
                  <p className="text-xs leading-relaxed text-ink-muted dark:text-gray-300">
                    {isAr
                      ? "لدور «موثّق» أو «معقّب» أو «محكّم»، إنشاء الحساب يمرّ عبر زر «المتابعة بحساب Google» أعلاه: تختار تخصصك بعد تسجيل الدخول فيُسجَّل مع حسابك. أما إكمال التسجيل بالبريد الإلكتروني من هذه الصفحة — وهو المسار الذي يُرسل معه رقم الترخيص والوثائق — فغير متاح لهذه الأدوار الثلاث بعد، بسبب خلل تقني في إنشاء حسابات هذا النوع بالبريد. أُعِدَّ إصلاح هذا الخلل ويحتاج تفعيله إلى خطوتين من فريق المنصّة: تطبيقه على قاعدة البيانات، ثم نشر تحديث لهذه الصفحة. ولذلك أوقفنا زر «التالي» لهذه الأدوار بدل أن تملأ بياناتك ووثائقك ثم يفشل الطلب في آخر خطوة."
                      : "For a notary, government-transactions agent or arbitrator, the account is created through the “Continue with Google” button above: you choose your specialty after signing in and it is recorded with your account. Completing registration by email on this page — the route that also submits your licence number and documents — is not available for these three roles yet, because of a technical fault in creating accounts of this type by email. A fix has been prepared and switching it on takes two steps by the platform team: applying it to the database, then deploying an update to this page. That is why we have disabled “Next” for these roles rather than let you fill in your details and documents and have the application fail at the last step."}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-ink-muted dark:text-gray-300">
                    {isAr ? (
                      <>
                        ولتقديم رقم ترخيصك ووثائقك الآن، أو إن تعذّر عليك التسجيل عبر Google، راسل إدارة المنصّة عبر{" "}
                        <a href="/contact" className="font-semibold text-royal underline hover:no-underline dark:text-gold">صفحة «اتصل بنا»</a>
                        {" "}واذكر تخصصك ورقم ترخيصك.
                      </>
                    ) : (
                      <>
                        To submit your licence number and documents now, or if you cannot register with Google, contact the platform team through the{" "}
                        <a href="/contact" className="font-semibold text-royal underline hover:no-underline dark:text-gold">contact page</a>
                        {" "}with your specialty and licence number.
                      </>
                    )}
                  </p>
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
