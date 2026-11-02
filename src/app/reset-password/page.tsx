"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Eye,
  EyeSlash,
  LockKey,
  Scales,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { createClient } from "@/lib/supabase/client";
import { BACKEND_MODE } from "@/lib/runtimeMode";
import { toArabicDigits } from "@/lib/services/arabicCount";
import {
  FORGOT_PASSWORD_PATH,
  MIN_RESET_PASSWORD_LENGTH,
  linkErrorInUrl,
  resetPasswordErrorMessage,
  resetPasswordProblem,
} from "@/lib/auth/passwordRecovery";

/**
 * Set a new password from a reset link (owner package 2026-11-02, slice A §1.5).
 *
 * Reached only through /auth/callback, which turns the emailed link into a
 * recovery session in this browser (src/lib/auth/passwordRecovery.ts). This
 * page needs that session: with none — an expired or used link, a link opened
 * in another browser, or `?error=` from the callback — it says so and links
 * back to /forgot-password; it never shows a form that could not save.
 *
 * Saving is the Settings pattern (SecurityTab.tsx: updateUser({ password })
 * with the same validateNewPassword rule). After a successful save every
 * session is signed out — the recovery one included — so the person signs in
 * with the new password, and /login does not bounce a still-live session
 * straight to a dashboard.
 *
 * signOut RETURNS its error (network, 5xx) rather than throwing, and on an
 * error it keeps the local session. So a failed global sign-out falls back to
 * a local one, and the success copy says which of the two actually happened
 * (or that neither did) instead of always claiming "every device".
 */

type SignOutOutcome = "global" | "local" | "none";

type Phase = "checking" | "ready" | "invalid" | "unavailable" | "demo" | "done";

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white py-3 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-royal focus:ring-2 focus:ring-royal/10 transition-all dark:border-white/10 dark:bg-dark-card dark:placeholder:text-gray-600 dark:focus:border-gold dark:focus:ring-gold/10";

const TEXT = {
  ar: {
    title: "تعيين كلمة مرور جديدة",
    intro: "اختر كلمة مرور جديدة لحسابك.",
    checking: "جارٍ التحقق من رابط الاستعادة…",
    newPass: "كلمة المرور الجديدة",
    confirm: "تأكيد كلمة المرور",
    placeholder: `${toArabicDigits(MIN_RESET_PASSWORD_LENGTH)} أحرف على الأقل`,
    confirmPlaceholder: "أعد إدخال كلمة المرور",
    save: "حفظ كلمة المرور",
    saving: "جارٍ الحفظ…",
    invalidTitle: "رابط الاستعادة غير صالح",
    invalidBody: "انتهت صلاحية الرابط أو سبق استخدامه، أو فُتح في متصفح غير الذي طُلب منه. اطلب رابطاً جديداً وافتحه في المتصفح نفسه.",
    requestNew: "طلب رابط جديد",
    unavailable: "تعذّر الاتصال بالخادم للتحقق من الرابط. تحقق من اتصالك ثم أعد تحميل الصفحة.",
    demo: "تعيين كلمة المرور يعمل مع الخادم الحقيقي فقط — غير متاح في وضع العرض (قريباً).",
    doneTitle: "تم تغيير كلمة المرور",
    doneBody: {
      global: "سُجّل خروجك من جميع الأجهزة. سجّل الدخول الآن بكلمة المرور الجديدة.",
      local: "سُجّل خروجك من هذا الجهاز. قد تبقى أجهزتك الأخرى مسجّلة الدخول حتى تنتهي جلساتها. سجّل الدخول الآن بكلمة المرور الجديدة.",
      none: "تعذّر تسجيل الخروج الآن، فما زلت مسجّل الدخول على هذا الجهاز. كلمة المرور الجديدة هي المعتمدة من الآن.",
    },
    signIn: "تسجيل الدخول",
    continue: "متابعة",
    show: "إظهار كلمة المرور",
  },
  en: {
    title: "Set a New Password",
    intro: "Choose a new password for your account.",
    checking: "Checking the reset link…",
    newPass: "New password",
    confirm: "Confirm password",
    placeholder: `At least ${MIN_RESET_PASSWORD_LENGTH} characters`,
    confirmPlaceholder: "Re-enter the password",
    save: "Save password",
    saving: "Saving…",
    invalidTitle: "This reset link is not valid",
    invalidBody: "The link has expired or was already used, or it was opened in a different browser from the one that requested it. Request a new link and open it in the same browser.",
    requestNew: "Request a new link",
    unavailable: "Could not reach the server to check the link. Check your connection, then reload the page.",
    demo: "Setting a password works with the real server only — not available in demo mode (coming soon).",
    doneTitle: "Password changed",
    doneBody: {
      global: "You have been signed out on every device. Sign in now with your new password.",
      local: "You have been signed out on this device. Your other devices may stay signed in until their sessions end. Sign in now with your new password.",
      none: "Signing out failed just now, so you are still signed in on this device. The new password is the one that counts from now on.",
    },
    signIn: "Sign in",
    continue: "Continue",
    show: "Show password",
  },
} as const;

export default function ResetPasswordPage() {
  const { lang, theme, toggleTheme, toggleLang } = useTheme();
  const isAr = lang === "ar";
  const t = isAr ? TEXT.ar : TEXT.en;

  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [signedOut, setSignedOut] = useState<SignOutOutcome>("none");

  // Client-only: the session lives in this browser's cookies, and the link's
  // own `#error…` fragment never reaches a server.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (BACKEND_MODE !== "supabase") {
        setPhase("demo");
        return;
      }
      if (linkErrorInUrl(window.location.search, window.location.hash)) {
        setPhase("invalid");
        return;
      }
      try {
        const supabase = createClient();
        // getUser, not getSession: GoTrue confirms the session is still live.
        const { data, error: userError } = await supabase.auth.getUser();
        if (cancelled) return;
        if (data.user) setPhase("ready");
        else if (userError?.name === "AuthRetryableFetchError") setPhase("unavailable");
        else setPhase("invalid");
      } catch {
        if (!cancelled) setPhase("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setError("");
    const problem = resetPasswordProblem(password, confirm, isAr);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(resetPasswordErrorMessage(updateError, isAr));
        return;
      }
      // End every session for this account, the recovery one included.
      // signOut returns (not throws) its error and then keeps the local
      // session, so check it and fall back to this device only. A failure
      // here does not undo the new password, so it is not an error.
      let outcome: SignOutOutcome = "none";
      try {
        const { error: globalError } = await supabase.auth.signOut({ scope: "global" });
        if (!globalError) outcome = "global";
      } catch {
        // fall through to the local attempt
      }
      if (outcome === "none") {
        try {
          const { error: localError } = await supabase.auth.signOut({ scope: "local" });
          if (!localError) outcome = "local";
        } catch {
          // still signed in; the copy says so
        }
      }
      setSignedOut(outcome);
      setPassword("");
      setConfirm("");
      setPhase("done");
    } catch (err) {
      setError(resetPasswordErrorMessage(err, isAr));
    } finally {
      setSaving(false);
    }
  }

  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="min-h-screen bg-surface font-body dark:bg-dark-bg transition-colors duration-300">
      {/* Top bar */}
      <div className="safe-top flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-dark-border md:px-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-royal text-white">
            <Scales weight="bold" size={18} />
          </div>
          <span className="font-brand text-xl font-bold text-royal dark:text-gold">{isAr ? "نظامي" : "Nezamy"}</span>
        </Link>
        <div className="flex items-center gap-2">
          <button onClick={toggleLang} className="rounded-lg border border-slate-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-royal transition-colors dark:text-gray-400 dark:hover:text-gold">
            {isAr ? "EN" : "عربي"}
          </button>
          <button onClick={toggleTheme} className="rounded-lg border border-slate-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-royal transition-colors dark:text-gray-400">
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </div>
      </div>

      <div className="flex justify-center px-5 py-12 md:py-16">
        <div className="w-full max-w-[440px]">
          {phase === "checking" && (
            <p className="text-center text-sm text-ink-muted dark:text-gray-400" aria-live="polite">{t.checking}</p>
          )}

          {(phase === "invalid" || phase === "unavailable" || phase === "demo") && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center" role="alert">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-900/20">
                <WarningCircle size={32} weight="duotone" className="text-amber-600 dark:text-amber-400" />
              </div>
              {phase === "invalid" && (
                <>
                  <h1 className="font-brand text-2xl font-bold text-ink">{t.invalidTitle}</h1>
                  <p className="mt-3 text-sm text-ink-muted dark:text-gray-400">{t.invalidBody}</p>
                </>
              )}
              {phase === "unavailable" && <p className="text-sm text-ink dark:text-gray-300">{t.unavailable}</p>}
              {phase === "demo" && <p className="text-sm text-ink dark:text-gray-300">{t.demo}</p>}
              {phase !== "demo" && (
                <Link
                  href={FORGOT_PASSWORD_PATH}
                  className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-royal py-3.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] hover:bg-royal-light transition-all"
                >
                  {t.requestNew}
                  {isAr ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
                </Link>
              )}
            </motion.div>
          )}

          {phase === "done" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 18 }}
              className="text-center"
              role="status"
            >
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-royal shadow-[0_12px_32px_-8px_rgba(11,61,46,0.45)]">
                <CheckCircle size={38} weight="bold" className="text-white" />
              </div>
              <h1 className="font-brand text-2xl font-bold text-ink">{t.doneTitle}</h1>
              <p className="mt-3 text-sm text-ink-muted dark:text-gray-400">{t.doneBody[signedOut]}</p>
              {/* A full page load, not <Link>: the browser's auth state starts fresh after the sign-out. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/login"
                className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-royal py-3.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] hover:bg-royal-light transition-all"
              >
                {signedOut === "none" ? t.continue : t.signIn}
                {isAr ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
              </a>
            </motion.div>
          )}

          {phase === "ready" && (
            <motion.form
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={(e) => { e.preventDefault(); if (!saving) void handleSave(); }}
              noValidate
            >
              <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-royal/8 dark:bg-royal/20">
                <LockKey size={28} weight="duotone" className="text-royal dark:text-gold" />
              </div>
              <h1 className="mt-5 font-brand text-2xl font-bold text-ink">{t.title}</h1>
              <p className="mt-2 text-sm text-ink-muted dark:text-gray-400">{t.intro}</p>

              <div className="mt-7 space-y-4">
                <div>
                  <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{t.newPass}</label>
                  <div className="relative">
                    <input
                      id="new-password"
                      type={showPass ? "text" : "password"}
                      autoComplete="new-password"
                      minLength={MIN_RESET_PASSWORD_LENGTH}
                      placeholder={t.placeholder}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`${inputCls} px-4 ${isAr ? "pl-10" : "pr-10"}`}
                    />
                    <button
                      type="button"
                      aria-label={t.show}
                      onClick={() => setShowPass((v) => !v)}
                      className={`absolute top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-muted dark:text-gray-500 dark:hover:text-gray-300 ${isAr ? "left-3.5" : "right-3.5"}`}
                    >
                      {showPass ? <EyeSlash size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-ink dark:text-gray-300">{t.confirm}</label>
                  <input
                    id="confirm-password"
                    type={showPass ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder={t.confirmPlaceholder}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={`${inputCls} px-4 ${mismatch ? "border-red-300 focus:border-red-400 focus:ring-red-100" : ""}`}
                  />
                </div>
              </div>

              {error && (
                <div role="alert" className="mt-5 flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-[13px] font-medium text-red-600 dark:text-red-400">
                  <Warning size={16} weight="fill" className="flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="mt-7 w-full rounded-xl bg-royal py-3.5 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] hover:bg-royal-light transition-all disabled:opacity-40"
              >
                {saving ? t.saving : t.save}
              </button>
            </motion.form>
          )}
        </div>
      </div>
    </div>
  );
}
