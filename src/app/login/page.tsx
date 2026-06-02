"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  EyeSlash,
  EnvelopeSimple,
  Phone,
  Lock,
  Scales,
  ShieldCheck,
  Brain,
  ArrowLeft,
  ArrowRight,
  CheckSquare,
  Square,
  Gavel,
  Star,
  Warning,
  CheckCircle,
  Info,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { authenticateTest, TEST_ACCOUNTS, TEST_PASSWORD } from "@/lib/test-credentials";
import { setDemoSession } from "@/hooks/useUser";
import { getDashboardRoute } from "@/constants/navigation";

const t = {
  ar: {
    title: "تسجيل الدخول",
    welcome: "مرحباً بعودتك",
    subtitle: "سجّل دخولك للوصول إلى خدماتك القانونية",
    emailLabel: "البريد الإلكتروني",
    emailPlaceholder: "example@email.com",
    phoneLabel: "رقم الجوال",
    phonePlaceholder: "05xxxxxxxx",
    passwordLabel: "كلمة المرور",
    passwordPlaceholder: "أدخل كلمة المرور",
    remember: "تذكرني",
    forgot: "نسيت كلمة المرور؟",
    signIn: "دخول",
    or: "أو",
    google: "تسجيل الدخول بـ Google",
    noAccount: "ليس لديك حساب؟",
    signUp: "سجّل مجاناً",
    switchToPhone: "استخدام رقم الجوال",
    switchToEmail: "استخدام البريد الإلكتروني",
    backHome: "العودة للرئيسية",
    brandSlogan: "شريكك القانوني الذكي",
    brandDesc: "المنصة القانونية الأولى في المملكة العربية السعودية",
    feat1: "ذكاء اصطناعي قانوني متقدم",
    feat2: "حماية وأمان تام لبياناتك",
    feat3: "محامون معتمدون ومختارون بعناية",
    stat1Label: "خدمة قانونية",
    stat1Value: "٣٧٠+",
    stat2Label: "دعم متواصل",
    stat2Value: "٢٤/٧",
    stat3Label: "آمن ومشفّر",
    stat3Value: "١٠٠٪",
    logo: "نظامي",
  },
  en: {
    title: "Sign In",
    welcome: "Welcome Back",
    subtitle: "Sign in to access your legal services",
    emailLabel: "Email Address",
    emailPlaceholder: "example@email.com",
    phoneLabel: "Phone Number",
    phonePlaceholder: "05xxxxxxxx",
    passwordLabel: "Password",
    passwordPlaceholder: "Enter your password",
    remember: "Remember me",
    forgot: "Forgot password?",
    signIn: "Sign In",
    or: "OR",
    google: "Continue with Google",
    noAccount: "Don't have an account?",
    signUp: "Sign up free",
    switchToPhone: "Use phone number",
    switchToEmail: "Use email address",
    backHome: "Back to Home",
    brandSlogan: "Your Smart Legal Partner",
    brandDesc: "Saudi Arabia's leading legal platform",
    feat1: "Advanced AI legal assistance",
    feat2: "Full data security & encryption",
    feat3: "Verified & vetted lawyers",
    stat1Label: "Legal Services",
    stat1Value: "370+",
    stat2Label: "Support",
    stat2Value: "24/7",
    stat3Label: "Secure",
    stat3Value: "100%",
    logo: "Nezamy",
  },
};

const features = [
  { icon: Brain, keyAr: "feat1", keyEn: "feat1" },
  { icon: ShieldCheck, keyAr: "feat2", keyEn: "feat2" },
  { icon: Gavel, keyAr: "feat3", keyEn: "feat3" },
];

const stats = [
  { valueKey: "stat1Value", labelKey: "stat1Label" },
  { valueKey: "stat2Value", labelKey: "stat2Label" },
  { valueKey: "stat3Value", labelKey: "stat3Label" },
];

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { lang, theme, toggleLang, toggleTheme } = useTheme();
  const isAr = lang === "ar";
  const txt = isAr ? t.ar : t.en;
  const dir = isAr ? "rtl" : "ltr";

  const router = useRouter();
  const [inputMode, setInputMode] = useState<"email" | "phone">("email");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);


  async function handleLogin() {
    setError("");
    if (!identifier.trim() || !password.trim()) {
      setError(isAr ? "يرجى ملء جميع الحقول" : "Please fill all fields");
      return;
    }
    setLoading(true);
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 600));
    const session = authenticateTest(identifier, password);
    if (!session) {
      setError(isAr ? "بيانات الدخول غير صحيحة" : "Invalid credentials");
      setLoading(false);
      return;
    }
    setDemoSession(session);
    const dest = getDashboardRoute(session.userType);
    router.push(dest);
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring" as const, stiffness: 300, damping: 25 },
    },
  };

  const floatingVariants = {
    animate: (i: number) => ({
      y: [0, -8, 0],
      transition: {
        duration: 3 + i * 0.5,
        repeat: Infinity,
        ease: "easeInOut" as const,
        delay: i * 0.4,
      },
    }),
  };

  return (
    <div
      dir={dir}
      className="min-h-screen bg-surface font-body dark:bg-dark-bg transition-colors duration-300"
    >
      {/* ── Layout: two columns on md+, single column on mobile ── */}
      <div className="flex min-h-screen">
        {/* ── LEFT BRAND PANEL (hidden on mobile) ── */}
        <div className="hidden md:flex md:w-[48%] lg:w-[52%] relative overflow-hidden bg-royal flex-col justify-between p-10 lg:p-14">
          {/* Background texture */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(200,167,98,0.12),transparent_60%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_80%,rgba(255,255,255,0.05),transparent_60%)]" />
            {/* Grid lines */}
            <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
                  <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>

          {/* Top: Logo + back */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 flex items-center justify-between"
          >
            <a href="/" className="flex items-center gap-3 group">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white backdrop-blur-sm border border-white/20 group-hover:bg-white/20 transition-colors">
                <Scales weight="bold" size={22} />
              </div>
              <span className="font-brand text-2xl font-bold tracking-tight text-white">
                {txt.logo}
              </span>
            </a>
            <a
              href="/"
              className="flex items-center gap-2 text-white/70 hover:text-white text-sm font-medium transition-colors group"
            >
              {isAr ? (
                <>
                  {txt.backHome}
                  <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                </>
              ) : (
                <>
                  <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                  {txt.backHome}
                </>
              )}
            </a>
          </motion.div>

          {/* Center: Brand message */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative z-10"
          >
            {/* Floating scales icon */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 border border-white/20 text-gold"
            >
              <Scales weight="duotone" size={36} />
            </motion.div>

            <h1 className="font-brand text-4xl lg:text-5xl font-bold text-white leading-tight mb-4">
              {txt.brandSlogan}
            </h1>
            <p className="text-white/60 text-lg font-medium mb-10">
              {txt.brandDesc}
            </p>

            {/* Feature list */}
            <div className="space-y-4">
              {features.map((feat, i) => {
                const Icon = feat.icon;
                const label = isAr
                  ? t.ar[feat.keyAr as keyof typeof t.ar]
                  : t.en[feat.keyEn as keyof typeof t.en];
                return (
                  <motion.div
                    key={i}
                    custom={i}
                    variants={floatingVariants}
                    animate="animate"
                    className="flex items-center gap-4"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 border border-white/15 text-gold">
                      <Icon weight="duotone" size={20} />
                    </div>
                    <span className="text-white/85 font-medium">{label}</span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* Bottom: Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="relative z-10 grid grid-cols-3 gap-4"
          >
            {stats.map((stat, i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-sm p-4 text-center"
              >
                <div className="font-brand text-2xl font-bold text-gold mb-1">
                  {txt[stat.valueKey as keyof typeof txt]}
                </div>
                <div className="text-white/60 text-xs font-medium">
                  {txt[stat.labelKey as keyof typeof txt]}
                </div>
              </div>
            ))}
          </motion.div>

          {/* Decorative floating circles */}
          <div className="absolute top-1/2 -right-24 h-64 w-64 rounded-full bg-gold/5 blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/4 -left-16 h-48 w-48 rounded-full bg-white/5 blur-2xl pointer-events-none" />
        </div>

        {/* ── RIGHT FORM PANEL ── */}
        <div className="flex flex-1 flex-col min-h-screen">
          {/* Mobile header */}
          <div className="flex items-center justify-between px-5 py-4 md:hidden border-b border-slate-200 dark:border-dark-border">
            <a href="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-royal text-white">
                <Scales weight="bold" size={18} />
              </div>
              <span className="font-brand text-xl font-bold text-royal">{txt.logo}</span>
            </a>
            <a href="/" className="text-sm text-ink-muted hover:text-royal transition-colors flex items-center gap-1.5">
              {isAr ? (
                <>
                  {txt.backHome}
                  <ArrowLeft size={14} />
                </>
              ) : (
                <>
                  <ArrowLeft size={14} />
                  {txt.backHome}
                </>
              )}
            </a>
          </div>

          {/* Desktop top bar: lang + theme toggles */}
          <div className="hidden md:flex items-center justify-end gap-2 px-8 pt-6">
            <button
              onClick={toggleLang}
              className="rounded-lg border border-slate-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-royal hover:border-royal transition-colors dark:text-gray-400 dark:hover:text-gold"
            >
              {isAr ? "EN" : "عربي"}
            </button>
            <button
              onClick={toggleTheme}
              className="rounded-lg border border-slate-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-royal transition-colors dark:text-gray-400 dark:hover:text-gold"
            >
              {theme === "light" ? "🌙" : "☀️"}
            </button>
          </div>

          {/* Centered form */}
          <div className="flex flex-1 items-center justify-center px-5 py-10 md:py-8">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="w-full max-w-[420px]"
            >
              {/* Heading */}
              <motion.div variants={itemVariants} className="mb-8">
                <h2 className="font-heading text-3xl font-bold text-ink dark:text-gray-100 mb-2">
                  {txt.welcome}
                </h2>
                <p className="text-ink-muted dark:text-gray-400 text-sm">
                  {txt.subtitle}
                </p>
              </motion.div>

              {/* Input mode toggle */}
              <motion.div variants={itemVariants} className="mb-6">
                <div className="flex rounded-xl border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-card p-1">
                  {(["email", "phone"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setInputMode(mode);
                        setIdentifier("");
                      }}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all duration-200 ${
                        inputMode === mode
                          ? "bg-white dark:bg-dark-bg shadow-sm text-royal dark:text-gold border border-slate-200/50 dark:border-dark-border"
                          : "text-ink-muted dark:text-gray-500 hover:text-ink dark:hover:text-gray-300"
                      }`}
                    >
                      {mode === "email" ? (
                        <EnvelopeSimple size={16} weight={inputMode === mode ? "fill" : "regular"} />
                      ) : (
                        <Phone size={16} weight={inputMode === mode ? "fill" : "regular"} />
                      )}
                      <span>
                        {mode === "email"
                          ? isAr ? "البريد" : "Email"
                          : isAr ? "الجوال" : "Phone"}
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>

              {/* Identifier field */}
              <motion.div variants={itemVariants} className="mb-4">
                <label className="block text-sm font-medium text-ink dark:text-gray-300 mb-1.5">
                  {inputMode === "email" ? txt.emailLabel : txt.phoneLabel}
                </label>
                <div className="relative">
                  <div className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`}>
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={inputMode}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.15 }}
                      >
                        {inputMode === "email" ? (
                          <EnvelopeSimple size={18} weight="duotone" />
                        ) : (
                          <Phone size={18} weight="duotone" />
                        )}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                  <input
                    type={inputMode === "email" ? "email" : "tel"}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={inputMode === "email" ? txt.emailPlaceholder : txt.phonePlaceholder}
                    dir={inputMode === "phone" ? "ltr" : dir}
                    className={`w-full rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card py-3 text-sm text-ink dark:text-gray-200 placeholder:text-ink-faint dark:placeholder:text-gray-600 outline-none focus:border-royal dark:focus:border-gold focus:ring-2 focus:ring-royal/10 dark:focus:ring-gold/10 transition-all ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"}`}
                  />
                </div>
              </motion.div>

              {/* Password field */}
              <motion.div variants={itemVariants} className="mb-5">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-ink dark:text-gray-300">
                    {txt.passwordLabel}
                  </label>
                  <a
                    href="/forgot-password"
                    className="text-xs text-royal dark:text-gold hover:underline font-medium transition-colors"
                  >
                    {txt.forgot}
                  </a>
                </div>
                <div className="relative">
                  <div className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`}>
                    <Lock size={18} weight="duotone" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={txt.passwordPlaceholder}
                    className={`w-full rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card py-3 text-sm text-ink dark:text-gray-200 placeholder:text-ink-faint dark:placeholder:text-gray-600 outline-none focus:border-royal dark:focus:border-gold focus:ring-2 focus:ring-royal/10 dark:focus:ring-gold/10 transition-all ${isAr ? "pr-10 pl-10" : "pl-10 pr-10"}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className={`absolute top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-muted dark:text-gray-500 dark:hover:text-gray-300 transition-colors ${isAr ? "left-3.5" : "right-3.5"}`}
                  >
                    {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </motion.div>

              {/* Remember me */}
              <motion.div variants={itemVariants} className="mb-6">
                <button
                  type="button"
                  onClick={() => setRemember(!remember)}
                  className="flex items-center gap-2.5 group"
                >
                  <motion.span
                    animate={{ scale: remember ? [1, 1.2, 1] : 1 }}
                    transition={{ duration: 0.2 }}
                    className={`text-lg transition-colors ${remember ? "text-royal dark:text-gold" : "text-ink-faint dark:text-gray-600"}`}
                  >
                    {remember ? <CheckSquare weight="fill" size={20} /> : <Square size={20} />}
                  </motion.span>
                  <span className="text-sm text-ink-muted dark:text-gray-400 group-hover:text-ink dark:group-hover:text-gray-300 transition-colors select-none">
                    {txt.remember}
                  </span>
                </button>
              </motion.div>

              {/* Error message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-[13px] font-medium text-red-600 dark:text-red-400"
                >
                  <Warning size={16} weight="fill" className="flex-shrink-0" />
                  {error}
                </motion.div>
              )}

              {/* Sign in button */}
              <motion.div variants={itemVariants} className="mb-4">
                <motion.button
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  type="button"
                  onClick={handleLogin}
                  disabled={loading}
                  className={`w-full rounded-xl bg-royal py-3.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] hover:bg-royal-light hover:shadow-[0_8px_24px_-4px_rgba(11,61,46,0.5)] transition-all duration-200 ${loading ? "opacity-70 cursor-wait" : ""}`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                        className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white"
                      />
                      {isAr ? "جارٍ الدخول..." : "Signing in..."}
                    </span>
                  ) : (
                    txt.signIn
                  )}
                </motion.button>
              </motion.div>

              {/* OR divider */}
              <motion.div variants={itemVariants} className="mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-200 dark:bg-dark-border" />
                  <span className="text-xs font-medium text-ink-faint dark:text-gray-600 uppercase tracking-wider">
                    {txt.or}
                  </span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-dark-border" />
                </div>
              </motion.div>

              {/* Google button */}
              <motion.div variants={itemVariants} className="mb-6">
                <motion.button
                  whileHover={{ scale: 1.015, boxShadow: "0 4px 20px -4px rgba(0,0,0,0.12)" }}
                  whileTap={{ scale: 0.985 }}
                  type="button"
                  className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card py-3.5 text-sm font-semibold text-ink dark:text-gray-200 shadow-sm hover:border-slate-300 dark:hover:border-gray-600 transition-all duration-200"
                >
                  <GoogleIcon />
                  <span>{txt.google}</span>
                </motion.button>
              </motion.div>

              {/* Register link */}
              <motion.div variants={itemVariants} className="text-center">
                <span className="text-sm text-ink-muted dark:text-gray-400">
                  {txt.noAccount}{" "}
                </span>
                <a
                  href="/register"
                  className="text-sm font-semibold text-royal dark:text-gold hover:underline transition-colors"
                >
                  {txt.signUp}
                </a>
              </motion.div>

              {/* ── Dev: link to full demo-login page ── */}
              <motion.div variants={itemVariants} className="mt-6 text-center">
                <a
                  href="/demo-login"
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                >
                  <Info size={13} weight="fill" />
                  {isAr ? "حسابات تجريبية للاختبار" : "Test Accounts (Dev)"}
                  <ArrowRight size={11} />
                </a>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
