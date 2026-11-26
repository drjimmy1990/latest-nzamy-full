"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  EnvelopeSimple,
  ArrowLeft,
  ArrowRight,
  Scales,
  LockKey,
  Warning,
  WhatsappLogo,
  Eye,
  EyeSlash,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { createClient } from "@/lib/supabase/client";
import { BACKEND_MODE } from "@/lib/runtimeMode";
import { canSubmitWithCaptcha, captchaMessage, captchaSubmitError } from "@/lib/auth/captcha";
import { useTurnstile } from "@/components/auth/useTurnstile";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { classifyRecoverError, isPlausibleEmail, recoveryRedirectTo, resetPasswordProblem } from "@/lib/auth/passwordRecovery";
import { classifyLoginInput, loginInputMessage, LOGIN_ID_LABEL_AR, LOGIN_ID_LABEL_EN, LOGIN_ID_PLACEHOLDER } from "@/lib/auth/loginIdentifierInput";
import {
  LOGIN_AFTER_RESET_PATH,
  LOGIN_PREFILL_EMAIL_KEY,
  PASSWORD_RESET_WHATSAPP_API,
  WHATSAPP_CODE_INVALID_AR,
  WHATSAPP_CODE_INVALID_EN,
  WHATSAPP_START_SENT_AR,
  WHATSAPP_START_SENT_EN,
  whatsappFromStatus,
} from "@/lib/passwordReset/passwordResetRules";

/**
 * «نسيت كلمة المرور» — the real flow (owner package 2026-11-02, slice A §1.5).
 *
 * This page used to walk through fake steps with local state only: nothing
 * was sent and no password changed. Its e-mail path asks GoTrue to email a
 * reset link (supabase.auth.resetPasswordForEmail). The link opens
 * /auth/callback, which sends the person to /reset-password to choose the new
 * password. The answer is the same neutral message whether or not the address
 * has an account (src/lib/auth/passwordRecovery.ts, classifyRecoverError).
 *
 * Batch l17: a second choice, «أرسل رمزًا إلى واتساب», shown only while
 * GET …/password-reset/whatsapp/status says { whatsapp: true } (WhatsApp
 * sending configured and the sign-up WhatsApp switch on). The person types
 * the e-mail only; a six-digit code goes to the mobile already confirmed on
 * the account, never typed here and never shown. Then the code and the new
 * password on this page; the server sets it, and the person signs in on
 * /login with the address prefilled (src/lib/passwordReset/).
 * While the status is unknown or off, the page is the e-mail page.
 *
 * Batch l18 (LIVE-06): while the WhatsApp choice is on, the same field also
 * takes the Saudi mobile confirmed on the account. The server finds the ONE
 * account that has it confirmed (a number shared by two accounts gets no
 * code) and answers with the same words as for an e-mail. The e-mail link
 * needs an e-mail; with a mobile typed, the page says so and points to the
 * WhatsApp button.
 */

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-royal focus:ring-2 focus:ring-royal/10 transition-all dark:border-white/10 dark:bg-dark-card dark:placeholder:text-gray-600 dark:focus:border-gold dark:focus:ring-gold/10";

const TEXT = {
  ar: {
    title: "استعادة كلمة المرور",
    intro: "أدخل بريدك الإلكتروني المسجّل وسنرسل إليه رابطاً لتعيين كلمة مرور جديدة.",
    emailLabel: "البريد الإلكتروني",
    submit: "إرسال رابط الاستعادة",
    sending: "جارٍ الإرسال…",
    sentTitle: "تحقق من بريدك",
    sent: "إن كان البريد مسجلاً فستصلك رسالة فيها رابط لتعيين كلمة مرور جديدة.",
    sentHint: "افتح الرابط في هذا المتصفح نفسه. إن لم تصلك الرسالة خلال دقائق فتفقّد مجلد الرسائل غير المرغوب فيها، أو أعد الطلب بعد دقيقة.",
    again: "إرسال الطلب مرة أخرى",
    invalidEmail: "أدخل بريداً إلكترونياً صحيحاً.",
    network: "تعذّر الاتصال بالخادم. تحقق من اتصالك وحاول مرة أخرى.",
    server: "تعذّر إرسال الرسالة الآن. حاول مرة أخرى بعد قليل.",
    demo: "استعادة كلمة المرور تعمل مع الخادم الحقيقي فقط — غير متاحة في وضع العرض (قريباً).",
    remembered: "تذكرت كلمة المرور؟",
    signIn: "سجّل دخولك",
    backToLogin: "العودة إلى تسجيل الدخول",
    brandTitle: "الأمان أولويتنا",
    brandBody: "رابط الاستعادة يصل إلى بريدك المسجّل وحده، ويصلح لمرة واحدة ولمدة محدودة.",
    recovery: "استعادة كلمة المرور",
    introChoice: "أدخل بريدك الإلكتروني المسجّل أو رقم جوالك المؤكَّد في حسابك، ثم اختر طريقة الاستعادة.",
    idLabel: LOGIN_ID_LABEL_AR,
    linkNeedsEmail: "رابط الاستعادة يُرسل إلى البريد الإلكتروني فقط. لاستعمال رقم الجوال اضغط «أرسل رمزًا إلى واتساب».",
    submitEmail: "أرسل رابطًا إلى بريدي",
    submitWhatsApp: "أرسل رمزًا إلى واتساب",
    waOr: "أو",
    waTitle: "أدخل الرمز وكلمة المرور الجديدة",
    waSent: WHATSAPP_START_SENT_AR,
    waFor: "الحساب:",
    waCodeLabel: "الرمز المرسل عبر واتساب",
    waCodeHint: "ستة أرقام، صالحة عشر دقائق.",
    waNewPass: "كلمة المرور الجديدة",
    waConfirm: "تأكيد كلمة المرور",
    waConfirmPlaceholder: "أعد كتابة كلمة المرور",
    waSave: "حفظ كلمة المرور",
    waSaving: "جارٍ الحفظ…",
    waBack: "رجوع وطلب رمز جديد",
    waCodeMissing: "اكتب الرمز المكوّن من ستة أرقام كما وصلك.",
    waInvalid: WHATSAPP_CODE_INVALID_AR,
    waUnavailable: "تعذّر إرسال الرمز الآن. حاول بعد قليل، أو استعمل رابط البريد.",
    waTooMany: "محاولات كثيرة — حاول بعد قليل.",
    waNotSaved: "تعذّر حفظ كلمة المرور الآن. حاول مرة أخرى بعد قليل.",
    show: "إظهار كلمة المرور",
    hide: "إخفاء كلمة المرور",
  },
  en: {
    title: "Reset Your Password",
    intro: "Enter your registered email and we will send it a link to set a new password.",
    emailLabel: "Email",
    submit: "Send reset link",
    sending: "Sending…",
    sentTitle: "Check your email",
    sent: "If this email is registered, you will receive a message with a link to set a new password.",
    sentHint: "Open the link in this same browser. If nothing arrives within a few minutes, check your spam folder or request again after a minute.",
    again: "Send the request again",
    invalidEmail: "Enter a valid email address.",
    network: "Could not reach the server. Check your connection and try again.",
    server: "The message could not be sent right now. Please try again shortly.",
    demo: "Password reset works with the real server only — not available in demo mode (coming soon).",
    remembered: "Remembered your password?",
    signIn: "Sign in",
    backToLogin: "Back to sign in",
    brandTitle: "Your Security First",
    brandBody: "The reset link goes to your registered email only, and works once for a limited time.",
    recovery: "Password Recovery",
    introChoice: "Enter your registered email or the mobile confirmed on your account, then choose how to reset your password.",
    idLabel: LOGIN_ID_LABEL_EN,
    linkNeedsEmail: "The reset link is sent to an email address only. To use your mobile, press «Send a code to WhatsApp».",
    submitEmail: "Send a link to my email",
    submitWhatsApp: "Send a code to WhatsApp",
    waOr: "or",
    waTitle: "Enter the code and your new password",
    waSent: WHATSAPP_START_SENT_EN,
    waFor: "Account:",
    waCodeLabel: "The code sent on WhatsApp",
    waCodeHint: "Six digits, valid for ten minutes.",
    waNewPass: "New password",
    waConfirm: "Confirm password",
    waConfirmPlaceholder: "Re-enter the password",
    waSave: "Save password",
    waSaving: "Saving…",
    waBack: "Back to request a new code",
    waCodeMissing: "Type the six-digit code as you received it.",
    waInvalid: WHATSAPP_CODE_INVALID_EN,
    waUnavailable: "The code could not be sent right now. Try again shortly, or use the email link.",
    waTooMany: "Too many attempts — try again shortly.",
    waNotSaved: "The password could not be saved right now. Please try again shortly.",
    show: "Show password",
    hide: "Hide password",
  },
} as const;

export default function ForgotPasswordPage() {
  const { lang, theme, toggleTheme, toggleLang } = useTheme();
  const isAr = lang === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const t = isAr ? TEXT.ar : TEXT.en;

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  // One Turnstile token per request. GoTrue checks it on /recover once
  // GOTRUE_SECURITY_CAPTCHA_* is on (src/lib/auth/captcha.ts).
  const captcha = useTurnstile({ isAr, theme, action: "password_reset" });
  const realBackend = BACKEND_MODE === "supabase";
  const router = useRouter();

  // Batch l17: the WhatsApp choice. Off until the server says otherwise, so
  // the page never flickers a button it cannot honour.
  const [waOn, setWaOn] = useState(false);
  const [waStage, setWaStage] = useState<"request" | "code">("request");
  const [waSending, setWaSending] = useState(false);
  const [waSaving, setWaSaving] = useState(false);
  const [waCode, setWaCode] = useState("");
  const [waPassword, setWaPassword] = useState("");
  const [waConfirm, setWaConfirm] = useState("");
  const [waShowPass, setWaShowPass] = useState(false);
  const [waError, setWaError] = useState("");
  // Batch l18: what «start» was asked for — the e-mail or the mobile (E.164);
  // verify sends the very same identifier.
  const [waTarget, setWaTarget] = useState<{ email: string } | { phone: string } | null>(null);

  useEffect(() => {
    if (!realBackend) return;
    let cancelled = false;
    fetch(`${PASSWORD_RESET_WHATSAPP_API}/status`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled) setWaOn(whatsappFromStatus(body));
      })
      .catch(() => {
        if (!cancelled) setWaOn(false);
      });
    return () => {
      cancelled = true;
    };
  }, [realBackend]);

  async function handleSubmit() {
    setError("");
    if (!realBackend) {
      setError(t.demo);
      return;
    }
    if (!isPlausibleEmail(email)) {
      // Batch l18: a mobile typed while the WhatsApp choice is on — the link needs an e-mail.
      const typed = classifyLoginInput(email);
      setError(waOn && typed.ok && typed.kind === "phone" ? t.linkNeedsEmail : t.invalidEmail);
      return;
    }
    if (!canSubmitWithCaptcha(captcha.state)) {
      setError(captchaSubmitError(captcha.state, isAr));
      return;
    }
    setSending(true);
    try {
      const supabase = createClient();
      const captchaToken = captcha.token;
      let result: Awaited<ReturnType<typeof supabase.auth.resetPasswordForEmail>>;
      try {
        result = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: recoveryRedirectTo(window.location.origin),
          ...(captchaToken ? { captchaToken } : {}),
        });
      } finally {
        // The token reached GoTrue (or may have): spent either way.
        captcha.spend();
      }
      const outcome = classifyRecoverError(result.error);
      if (outcome === "captcha") {
        setError(captchaMessage("captchaRejected", isAr));
        return;
      }
      if (outcome === "network") {
        setError(t.network);
        return;
      }
      if (outcome === "server") {
        setError(t.server);
        return;
      }
      if (outcome === "invalid_email") {
        setError(t.invalidEmail);
        return;
      }
      setSent(true);
    } catch {
      setError(t.network);
    } finally {
      setSending(false);
    }
  }

  /** «أرسل رمزًا إلى واتساب»: the server answers the same for every address. */
  async function handleWhatsAppStart() {
    setError("");
    setWaError("");
    if (!realBackend || !waOn) return;
    // Batch l18 (LIVE-06): the e-mail or the Saudi mobile, in the same field.
    const typed = classifyLoginInput(email);
    if (!typed.ok) {
      setError(loginInputMessage(typed, isAr));
      return;
    }
    const target = typed.kind === "email" ? { email: typed.value } : { phone: typed.value };
    if (!canSubmitWithCaptcha(captcha.state)) {
      setError(captchaSubmitError(captcha.state, isAr));
      return;
    }
    setWaSending(true);
    try {
      let res: Response;
      try {
        res = await fetch(`${PASSWORD_RESET_WHATSAPP_API}/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...target, turnstileToken: captcha.token ?? null }),
        });
      } finally {
        captcha.spend();
      }
      const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
      if (res.ok) {
        setWaTarget(target);
        setWaCode("");
        setWaPassword("");
        setWaConfirm("");
        setWaStage("code");
        return;
      }
      const code = body?.code;
      if (code === "captcha") setError(captchaMessage("captchaRejected", isAr));
      else if (code === "invalid_email") setError(t.invalidEmail);
      else if (code === "invalid_phone") setError(loginInputMessage({ ok: false, reason: "not_saudi_mobile" }, isAr));
      else if (res.status === 429) setError(t.waTooMany);
      else setError(t.waUnavailable);
    } catch {
      setError(t.network);
    } finally {
      setWaSending(false);
    }
  }

  /** The code and the new password: the server sets it; the person signs in on /login. */
  async function handleWhatsAppVerify() {
    setWaError("");
    if (!waTarget) {
      setWaStage("request");
      return;
    }
    if (!/^[\s0-9٠-٩۰-۹-]{6,9}$/.test(waCode.trim())) {
      setWaError(t.waCodeMissing);
      return;
    }
    const problem = resetPasswordProblem(waPassword, waConfirm, isAr);
    if (problem) {
      setWaError(problem);
      return;
    }
    setWaSaving(true);
    try {
      const res = await fetch(`${PASSWORD_RESET_WHATSAPP_API}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...waTarget, code: waCode, password: waPassword, confirm: waConfirm }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: unknown; code?: unknown; error?: unknown } | null;
      if (res.ok && body?.ok === true) {
        try {
          window.sessionStorage.setItem(LOGIN_PREFILL_EMAIL_KEY, email.trim());
        } catch { /* storage blocked: /login just starts empty */ }
        setWaPassword("");
        setWaConfirm("");
        router.replace(LOGIN_AFTER_RESET_PATH);
        return;
      }
      const code = body?.code;
      if (code === "invalid_code") setWaError(t.waInvalid);
      else if (code === "weak_password") setWaError(isAr && typeof body?.error === "string" ? body.error : (resetPasswordProblem(waPassword, waConfirm, false) ?? t.waNotSaved));
      else if (code === "password_not_set" && isAr && typeof body?.error === "string") setWaError(body.error);
      else if (res.status === 429) setWaError(t.waTooMany);
      else setWaError(t.waNotSaved);
    } catch {
      setWaError(t.network);
    } finally {
      setWaSaving(false);
    }
  }

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
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 border border-white/20 text-white">
                <Scales weight="bold" size={22} />
              </div>
              <span className="font-brand text-2xl font-bold text-white">{isAr ? "نظامي" : "Nezamy"}</span>
            </Link>
          </div>

          <div className="relative z-10">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 border border-white/15 text-gold"
            >
              <LockKey size={30} weight="duotone" />
            </motion.div>
            <h2 className="font-brand text-3xl font-bold text-white">{t.brandTitle}</h2>
            <p className="mt-3 text-white/60 text-sm leading-relaxed">{t.brandBody}</p>
          </div>

          <div className="relative z-10 text-sm text-white/40">
            {t.remembered}{" "}
            <Link href="/login" className="text-gold hover:underline">{t.signIn}</Link>
          </div>
        </div>

        {/* ── Form panel ── */}
        <div className="flex flex-1 flex-col">
          {/* Top bar */}
          <div className="safe-top flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-dark-border md:px-8">
            <Link href="/" className="flex items-center gap-2 md:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-royal text-white">
                <Scales weight="bold" size={18} />
              </div>
              <span className="font-brand text-xl font-bold text-royal">{isAr ? "نظامي" : "Nezamy"}</span>
            </Link>
            <div className="hidden md:flex items-center gap-2 text-sm text-ink-muted dark:text-gray-400">
              {t.recovery}
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
              {sent ? (
                <motion.div
                  key="sent"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 18 }}
                  className="text-center"
                >
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-royal shadow-[0_12px_32px_-8px_rgba(11,61,46,0.45)]">
                    <EnvelopeSimple size={38} weight="duotone" className="text-white" />
                  </div>
                  <h1 className="font-brand text-2xl font-bold text-ink">{t.sentTitle}</h1>
                  <p className="mt-3 text-sm text-ink dark:text-gray-300" role="status">{t.sent}</p>
                  <p className="mt-2 text-xs text-ink-muted dark:text-gray-400">{t.sentHint}</p>
                  <Link
                    href="/login"
                    className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-royal py-3.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] hover:bg-royal-light transition-all"
                  >
                    {t.backToLogin}
                    {isAr ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setSent(false); setError(""); }}
                    className="mt-4 text-sm text-ink-muted hover:text-royal dark:text-gray-400 dark:hover:text-gold transition-colors"
                  >
                    {t.again}
                  </button>
                </motion.div>
              ) : waStage === "code" ? (
                <motion.form
                  key="whatsapp-code"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 28 }}
                  onSubmit={(e) => { e.preventDefault(); if (!waSaving) void handleWhatsAppVerify(); }}
                  noValidate
                >
                  <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-royal/8 dark:bg-royal/20">
                    <WhatsappLogo size={28} weight="duotone" className="text-royal dark:text-gold" />
                  </div>
                  <h1 className="mt-5 font-brand text-2xl font-bold text-ink">{t.waTitle}</h1>
                  <p className="mt-2 text-sm text-ink dark:text-gray-300" role="status">{t.waSent}</p>
                  <p className="mt-2 text-xs text-ink-muted dark:text-gray-400">
                    {t.waFor} <span dir="ltr" className="font-medium">{email.trim()}</span>
                  </p>

                  <label htmlFor="reset-code" className="mt-7 mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
                    {t.waCodeLabel}
                  </label>
                  <input
                    id="reset-code"
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    autoComplete="one-time-code"
                    maxLength={9}
                    placeholder="••••••"
                    value={waCode}
                    onChange={(e) => setWaCode(e.target.value)}
                    className={`${inputCls} text-center tracking-[0.4em]`}
                  />
                  <p className="mt-1.5 mb-5 text-xs text-ink-muted dark:text-gray-400">{t.waCodeHint}</p>

                  <label htmlFor="reset-new-password" className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
                    {t.waNewPass}
                  </label>
                  <div className="relative mb-5">
                    <input
                      id="reset-new-password"
                      type={waShowPass ? "text" : "password"}
                      autoComplete="new-password"
                      dir="ltr"
                      value={waPassword}
                      onChange={(e) => setWaPassword(e.target.value)}
                      className={`${inputCls} ${isAr ? "pl-11" : "pr-11"}`}
                    />
                    <button
                      type="button"
                      onClick={() => setWaShowPass((v) => !v)}
                      aria-label={waShowPass ? t.hide : t.show}
                      className={`absolute top-1/2 -translate-y-1/2 text-ink-faint hover:text-royal dark:text-gray-500 dark:hover:text-gold ${isAr ? "left-3.5" : "right-3.5"}`}
                    >
                      {waShowPass ? <EyeSlash size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  <label htmlFor="reset-confirm-password" className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
                    {t.waConfirm}
                  </label>
                  <input
                    id="reset-confirm-password"
                    type={waShowPass ? "text" : "password"}
                    autoComplete="new-password"
                    dir="ltr"
                    placeholder={t.waConfirmPlaceholder}
                    value={waConfirm}
                    onChange={(e) => setWaConfirm(e.target.value)}
                    className={`${inputCls} mb-5`}
                  />

                  {waError && (
                    <div
                      role="alert"
                      className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-[13px] font-medium text-red-600 dark:text-red-400"
                    >
                      <Warning size={16} weight="fill" className="flex-shrink-0" />
                      {waError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={waSaving}
                    className="w-full rounded-xl bg-royal py-3.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] hover:bg-royal-light transition-all disabled:opacity-40"
                  >
                    {waSaving ? t.waSaving : t.waSave}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setWaStage("request"); setWaError(""); setError(""); }}
                    className="mt-4 text-sm text-ink-muted hover:text-royal dark:text-gray-400 dark:hover:text-gold transition-colors"
                  >
                    {t.waBack}
                  </button>

                  <Link
                    href="/login"
                    className="mt-5 flex items-center gap-2 text-sm text-ink-muted hover:text-royal dark:text-gray-400 dark:hover:text-gold transition-colors"
                  >
                    {isAr ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
                    {t.backToLogin}
                  </Link>
                </motion.form>
              ) : (
                <motion.form
                  key="request"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 28 }}
                  onSubmit={(e) => { e.preventDefault(); if (!sending) void handleSubmit(); }}
                  noValidate
                >
                  <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-royal/8 dark:bg-royal/20">
                    <LockKey size={28} weight="duotone" className="text-royal dark:text-gold" />
                  </div>
                  <h1 className="mt-5 font-brand text-2xl font-bold text-ink">{t.title}</h1>
                  <p className="mt-2 text-sm text-ink-muted dark:text-gray-400">{waOn ? t.introChoice : t.intro}</p>

                  <label htmlFor="reset-email" className="mt-7 mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">
                    {waOn ? t.idLabel : t.emailLabel}
                  </label>
                  <div className="relative mb-5">
                    <div className={`absolute top-1/2 -translate-y-1/2 text-ink-faint dark:text-gray-500 pointer-events-none ${isAr ? "right-3.5" : "left-3.5"}`}>
                      <EnvelopeSimple size={18} weight="duotone" />
                    </div>
                    <input
                      id="reset-email"
                      type={waOn ? "text" : "email"}
                      inputMode="email"
                      dir="ltr"
                      autoComplete={waOn ? "username" : "email"}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder={waOn ? LOGIN_ID_PLACEHOLDER : "example@email.com"}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`${inputCls} ${isAr ? "pr-10 pl-4" : "pl-10 pr-4"}`}
                    />
                  </div>

                  {/* Security check (Turnstile) — real backend only, as on /login. */}
                  {realBackend && <TurnstileWidget control={captcha} isAr={isAr} />}

                  {!realBackend && (
                    <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
                      {t.demo}
                    </p>
                  )}

                  {error && (
                    <div
                      role="alert"
                      className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-[13px] font-medium text-red-600 dark:text-red-400"
                    >
                      <Warning size={16} weight="fill" className="flex-shrink-0" />
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={sending || waSending || !realBackend}
                    className="w-full rounded-xl bg-royal py-3.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] hover:bg-royal-light transition-all disabled:opacity-40"
                  >
                    {sending ? t.sending : waOn ? t.submitEmail : t.submit}
                  </button>

                  {/* Batch l17: the WhatsApp code — only while the server offers it. */}
                  {waOn && (
                    <>
                      <div className="my-3 flex items-center gap-3 text-xs text-ink-faint dark:text-gray-500">
                        <span className="h-px flex-1 bg-slate-200 dark:bg-dark-border" />
                        {t.waOr}
                        <span className="h-px flex-1 bg-slate-200 dark:bg-dark-border" />
                      </div>
                      <button
                        type="button"
                        onClick={() => { if (!waSending && !sending) void handleWhatsAppStart(); }}
                        disabled={sending || waSending || !realBackend}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-royal/30 bg-white py-3.5 text-sm font-semibold text-royal hover:bg-royal/5 transition-all disabled:opacity-40 dark:border-gold/40 dark:bg-dark-card dark:text-gold dark:hover:bg-gold/10"
                      >
                        <WhatsappLogo size={18} weight="duotone" />
                        {waSending ? t.sending : t.submitWhatsApp}
                      </button>
                    </>
                  )}

                  <Link
                    href="/login"
                    className="mt-5 flex items-center gap-2 text-sm text-ink-muted hover:text-royal dark:text-gray-400 dark:hover:text-gold transition-colors"
                  >
                    {isAr ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
                    {t.backToLogin}
                  </Link>
                </motion.form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
