"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  EnvelopeSimple,
  Phone,
  ArrowLeft,
  Scales,
  LockKey,
  ShieldCheck,
  CheckCircle,
  ArrowRight,
  Eye,
  EyeSlash,
  Timer,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

type Step = "method" | "otp" | "newpass" | "success";

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-royal focus:ring-2 focus:ring-royal/10 transition-all dark:border-white/10 dark:bg-dark-card dark:text-gray-200 dark:placeholder:text-gray-600 dark:focus:border-gold dark:focus:ring-gold/10";

function StepMethod({
  isAr,
  mode,
  setMode,
  value,
  setValue,
  onNext,
}: {
  isAr: boolean;
  mode: "email" | "phone";
  setMode: (m: "email" | "phone") => void;
  value: string;
  setValue: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <motion.div
      key="method"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-royal/8 dark:bg-royal/20">
        <LockKey size={28} weight="duotone" className="text-royal dark:text-gold" />
      </div>
      <h1 className="mt-5 font-brand text-2xl font-bold text-ink dark:text-gray-100">
        {isAr ? "استعادة كلمة المرور" : "Reset Your Password"}
      </h1>
      <p className="mt-2 text-sm text-ink-muted dark:text-gray-400">
        {isAr
          ? "أدخل بريدك الإلكتروني أو رقم جوالك وسنرسل لك رمز التحقق"
          : "Enter your email or phone and we'll send you a verification code"}
      </p>

      {/* Mode toggle */}
      <div className="mt-7 flex rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-dark-card p-1 mb-5">
        {(["email", "phone"] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setValue(""); }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all ${
              mode === m
                ? "bg-white dark:bg-dark-bg shadow-sm text-royal dark:text-gold border border-slate-200/50 dark:border-white/10"
                : "text-ink-muted dark:text-gray-500 hover:text-ink dark:hover:text-gray-300"
            }`}
          >
            {m === "email"
              ? <EnvelopeSimple size={16} weight={mode === m ? "fill" : "regular"} />
              : <Phone size={16} weight={mode === m ? "fill" : "regular"} />}
            <span>{m === "email" ? (isAr ? "البريد" : "Email") : (isAr ? "الجوال" : "Phone")}</span>
          </button>
        ))}
      </div>

      <div className="relative mb-6">
        <div className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`}>
          {mode === "email" ? <EnvelopeSimple size={18} weight="duotone" /> : <Phone size={18} weight="duotone" />}
        </div>
        <input
          type={mode === "email" ? "email" : "tel"}
          dir={mode === "phone" ? "ltr" : undefined}
          placeholder={mode === "email" ? "example@email.com" : "05XXXXXXXX"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`${inputCls} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"}`}
        />
      </div>

      <motion.button
        whileHover={{ scale: value.length > 5 ? 1.015 : 1 }}
        whileTap={{ scale: value.length > 5 ? 0.985 : 1 }}
        onClick={onNext}
        disabled={value.length < 6}
        className="w-full rounded-xl bg-royal py-3.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] hover:bg-royal-light transition-all disabled:opacity-40"
      >
        {isAr ? "إرسال رمز التحقق" : "Send Verification Code"}
      </motion.button>
    </motion.div>
  );
}

function StepOTP({
  isAr,
  contact,
  onNext,
  onBack,
}: {
  isAr: boolean;
  contact: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // Simple timer (display-only)
  const full = otp.every((d) => d !== "");

  const handleChange = (index: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[index] = val;
    setOtp(next);
    if (val && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  return (
    <motion.div
      key="otp"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/10 dark:bg-gold/15">
        <ShieldCheck size={28} weight="duotone" className="text-gold-dark dark:text-gold" />
      </div>
      <h2 className="mt-5 font-brand text-2xl font-bold text-ink dark:text-gray-100">
        {isAr ? "أدخل رمز التحقق" : "Enter Verification Code"}
      </h2>
      <p className="mt-2 text-sm text-ink-muted dark:text-gray-400">
        {isAr ? `أرسلنا رمزاً مكوّناً من 6 أرقام إلى` : `We sent a 6-digit code to`}{" "}
        <span className="font-semibold text-ink dark:text-gray-200">{contact}</span>
      </p>

      {/* OTP boxes */}
      <div className={`mt-8 flex gap-2.5 ${isAr ? "flex-row-reverse" : "flex-row"}`} dir="ltr">
        {otp.map((digit, i) => (
          <input
            key={i}
            id={`otp-${i}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className={`h-13 w-full rounded-xl border text-center text-xl font-bold transition-all outline-none ${
              digit
                ? "border-royal bg-royal/5 text-royal dark:border-gold dark:bg-gold/10 dark:text-gold"
                : "border-slate-200 bg-white text-ink dark:border-white/10 dark:bg-dark-card dark:text-gray-200"
            } focus:border-royal focus:ring-2 focus:ring-royal/15 dark:focus:border-gold dark:focus:ring-gold/15`}
          />
        ))}
      </div>

      {/* Timer + resend */}
      <div className={`mt-4 flex items-center gap-2 text-sm text-ink-muted dark:text-gray-400 ${isAr ? "flex-row-reverse" : ""}`}>
        <Timer size={15} />
        <span>
          {isAr ? `أعد الإرسال بعد ${timer} ثانية` : `Resend in ${timer}s`}
        </span>
      </div>

      <motion.button
        whileHover={{ scale: full ? 1.015 : 1 }}
        whileTap={{ scale: full ? 0.985 : 1 }}
        onClick={onNext}
        disabled={!full}
        className="mt-6 w-full rounded-xl bg-royal py-3.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] hover:bg-royal-light transition-all disabled:opacity-40"
      >
        {isAr ? "تحقّق من الرمز" : "Verify Code"}
      </motion.button>

      <button
        onClick={onBack}
        className={`mt-4 flex items-center gap-2 text-sm text-ink-muted hover:text-royal dark:text-gray-400 dark:hover:text-gold transition-colors ${isAr ? "flex-row-reverse" : ""}`}
      >
        {isAr ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
        {isAr ? "تغيير طريقة الاسترداد" : "Change recovery method"}
      </button>
    </motion.div>
  );
}

function StepNewPass({
  isAr,
  onNext,
}: {
  isAr: boolean;
  onNext: () => void;
}) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const strength = (() => {
    let s = 0;
    if (pass.length >= 8) s++;
    if (/[A-Z]/.test(pass)) s++;
    if (/[0-9]/.test(pass)) s++;
    if (/[^A-Za-z0-9]/.test(pass)) s++;
    return s;
  })();

  const strengthLabel = isAr
    ? ["", "ضعيفة", "متوسطة", "جيدة", "قوية جداً"][strength]
    : ["", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthColor = ["", "bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-emerald-500"][strength];
  const mismatch = confirm.length > 0 && confirm !== pass;
  const canSubmit = pass.length >= 8 && pass === confirm;

  return (
    <motion.div
      key="newpass"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-900/20">
        <LockKey size={28} weight="duotone" className="text-emerald-600 dark:text-emerald-400" />
      </div>
      <h2 className="mt-5 font-brand text-2xl font-bold text-ink dark:text-gray-100">
        {isAr ? "كلمة مرور جديدة" : "Create New Password"}
      </h2>
      <p className="mt-2 text-sm text-ink-muted dark:text-gray-400">
        {isAr
          ? "اختر كلمة مرور قوية لحماية حسابك"
          : "Choose a strong password to protect your account"}
      </p>

      <div className="mt-7 space-y-4">
        {/* New password */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
            {isAr ? "كلمة المرور الجديدة" : "New Password"}
          </label>
          <div className="relative">
            <LockKey size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            <input
              type={showPass ? "text" : "password"}
              placeholder={isAr ? "8 أحرف على الأقل" : "At least 8 characters"}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className={`${inputCls} ${isAr ? "pr-10 pl-10" : "pl-10 pr-10"}`}
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className={`absolute top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-muted dark:text-gray-500 dark:hover:text-gray-300 ${isAr ? "left-3.5" : "right-3.5"}`}
            >
              {showPass ? <EyeSlash size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {pass.length > 0 && (
            <div className="mt-2">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= strength ? strengthColor : "bg-slate-200 dark:bg-white/10"}`} />
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-faint dark:text-gray-500">{strengthLabel}</p>
            </div>
          )}
        </div>

        {/* Confirm */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
            {isAr ? "تأكيد كلمة المرور" : "Confirm Password"}
          </label>
          <div className="relative">
            <LockKey size={18} className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`} />
            <input
              type={showConfirm ? "text" : "password"}
              placeholder={isAr ? "أعد إدخال كلمة المرور" : "Re-enter password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={`${inputCls} ${isAr ? "pr-10 pl-10" : "pl-10 pr-10"} ${mismatch ? "border-red-300 focus:border-red-400 focus:ring-red-100" : ""}`}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className={`absolute top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-muted dark:text-gray-500 dark:hover:text-gray-300 ${isAr ? "left-3.5" : "right-3.5"}`}
            >
              {showConfirm ? <EyeSlash size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {mismatch && (
            <p className="mt-1 text-xs text-red-500">{isAr ? "كلمات المرور غير متطابقة" : "Passwords don't match"}</p>
          )}
        </div>
      </div>

      <motion.button
        whileHover={{ scale: canSubmit ? 1.015 : 1 }}
        whileTap={{ scale: canSubmit ? 0.985 : 1 }}
        onClick={onNext}
        disabled={!canSubmit}
        className="mt-7 w-full rounded-xl bg-royal py-3.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] hover:bg-royal-light transition-all disabled:opacity-40"
      >
        {isAr ? "حفظ كلمة المرور الجديدة" : "Save New Password"}
      </motion.button>
    </motion.div>
  );
}

function StepSuccess({ isAr }: { isAr: boolean }) {
  return (
    <motion.div
      key="success"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 18 }}
      className="text-center"
    >
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 180, damping: 14, delay: 0.1 }}
        className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-royal shadow-[0_12px_32px_-8px_rgba(11,61,46,0.45)]"
      >
        <CheckCircle size={38} weight="bold" className="text-white" />
      </motion.div>
      <h2 className="font-brand text-2xl font-bold text-ink dark:text-gray-100">
        {isAr ? "تم تغيير كلمة المرور!" : "Password Changed Successfully!"}
      </h2>
      <p className="mt-3 text-sm text-ink-muted dark:text-gray-400 max-w-[300px] mx-auto">
        {isAr
          ? "كلمة مرورك الجديدة جاهزة. يمكنك الآن تسجيل الدخول بأمان."
          : "Your new password is set. You can now sign in securely."}
      </p>
      <motion.a
        href="/login"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-royal py-3.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] hover:bg-royal-light transition-all"
      >
        {isAr ? "تسجيل الدخول الآن" : "Sign In Now"}
        {isAr ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
      </motion.a>
    </motion.div>
  );
}

export default function ForgotPasswordPage() {
  const { lang, theme, toggleTheme, toggleLang } = useTheme();
  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";

  const [step, setStep] = useState<Step>("method");
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [contact, setContact] = useState("");

  const stepTitles: Record<Step, { ar: string; en: string }> = {
    method:   { ar: "اختر طريقة الاسترداد", en: "Choose Recovery Method" },
    otp:      { ar: "رمز التحقق", en: "Verify Code" },
    newpass:  { ar: "كلمة مرور جديدة", en: "New Password" },
    success:  { ar: "تم بنجاح", en: "Done" },
  };

  const stepOrder: Step[] = ["method", "otp", "newpass", "success"];
  const stepIndex = stepOrder.indexOf(step);

  return (
    <div dir={dir} className="min-h-screen bg-surface font-body dark:bg-dark-bg transition-colors duration-300">
      <div className="flex min-h-screen">

        {/* ── Brand panel ── */}
        <div className="hidden md:flex md:w-[42%] lg:w-[46%] relative overflow-hidden bg-royal flex-col justify-between p-10 lg:p-14">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(200,167,98,0.12),transparent_60%)]" />
            <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid-fp" width="48" height="48" patternUnits="userSpaceOnUse">
                  <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid-fp)" />
            </svg>
          </div>

          <div className="relative z-10">
            <a href="/" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 border border-white/20 text-white">
                <Scales weight="bold" size={22} />
              </div>
              <span className="font-brand text-2xl font-bold text-white">{isAr ? "نظامي" : "Nezamy"}</span>
            </a>
          </div>

          <div className="relative z-10">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 border border-white/15 text-gold"
            >
              <LockKey size={30} weight="duotone" />
            </motion.div>
            <h2 className="font-brand text-3xl font-bold text-white">
              {isAr ? "الأمان أولويتنا" : "Your Security First"}
            </h2>
            <p className="mt-3 text-white/60 text-sm leading-relaxed">
              {isAr
                ? "نحمي بياناتك القانونية بأعلى معايير التشفير والحماية."
                : "We protect your legal data with the highest encryption and security standards."}
            </p>

            {/* Steps sidebar */}
            <div className="mt-10 space-y-3">
              {stepOrder.map((s, i) => (
                <div key={s} className="flex items-center gap-3">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-all ${
                    i < stepIndex ? "bg-gold text-white" : i === stepIndex ? "bg-white text-royal" : "bg-white/10 text-white/30"
                  }`}>
                    {i < stepIndex ? "✓" : i + 1}
                  </div>
                  <span className={`text-sm transition-colors ${i === stepIndex ? "font-semibold text-white" : i < stepIndex ? "text-white/60" : "text-white/30"}`}>
                    {isAr ? stepTitles[s].ar : stepTitles[s].en}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 text-sm text-white/40">
            {isAr ? "تذكرت كلمة المرور؟" : "Remembered your password?"}{" "}
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
              {isAr ? "استعادة كلمة المرور" : "Password Recovery"}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={toggleLang} className="rounded-lg border border-slate-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-royal transition-colors dark:text-gray-400 dark:hover:text-gold">
                {isAr ? "EN" : "عربي"}
              </button>
              <button onClick={toggleTheme} className="rounded-lg border border-slate-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-royal transition-colors dark:text-gray-400">
                {theme === "light" ? "🌙" : "☀️"}
              </button>
            </div>
          </div>

          {/* Form content */}
          <div className="flex flex-1 items-start justify-center px-5 py-10 md:py-12 md:px-12">
            <div className="w-full max-w-[440px]">

              {/* Progress bar */}
              {step !== "success" && (
                <div className="mb-8">
                  <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-royal dark:bg-gold"
                      animate={{ width: `${((stepIndex + 1) / 3) * 100}%` }}
                      transition={{ type: "spring", stiffness: 120, damping: 20 }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-ink-faint dark:text-gray-500">
                    {isAr ? `خطوة ${stepIndex + 1} من ٣` : `Step ${stepIndex + 1} of 3`}
                  </p>
                </div>
              )}

              <AnimatePresence mode="wait">
                {step === "method" && (
                  <StepMethod
                    key="method"
                    isAr={isAr}
                    mode={mode}
                    setMode={setMode}
                    value={contact}
                    setValue={setContact}
                    onNext={() => setStep("otp")}
                  />
                )}
                {step === "otp" && (
                  <StepOTP
                    key="otp"
                    isAr={isAr}
                    contact={contact}
                    onNext={() => setStep("newpass")}
                    onBack={() => setStep("method")}
                  />
                )}
                {step === "newpass" && (
                  <StepNewPass
                    key="newpass"
                    isAr={isAr}
                    onNext={() => setStep("success")}
                  />
                )}
                {step === "success" && <StepSuccess key="success" isAr={isAr} />}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
