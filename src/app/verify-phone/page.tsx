"use client";

/**
 * /verify-phone — «تأكيد رقم الجوال» (batch l15, user decisions 2026-11-24).
 *
 * A new account (created after the admin turned the switch on) confirms its
 * mobile with a six-digit code sent over WhatsApp before it can use the
 * platform; src/proxy.ts sends every protected page here and refuses /api/v1
 * until then. Not a PROTECTED prefix, so the proxy never redirects it (no
 * loop). No dashboard shell: nothing on this page calls a held API.
 *
 * State from GET /api/v1/auth/phone-otp/status; «أرسل الرمز عبر واتساب» →
 * POST …/start (the security check before the first code and on a change of
 * number); the code → POST …/verify. If WhatsApp cannot send, it says so
 * («تعذّر إرسال الرمز الآن، حاول بعد قليل») and offers to try again — never a
 * fake success. After success: `?next=` when it is on the short allowed list
 * (the lawyer's licence step), else the account's home (the wizard if
 * unfinished, else its dashboard).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle, SignOut, SpinnerGap, WarningCircle, WhatsappLogo } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useTurnstile } from "@/components/auth/useTurnstile";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { canSubmitWithCaptcha, captchaSubmitError } from "@/lib/auth/captcha";
import { createClient } from "@/lib/supabase/client";
import { PHONE_SEND_FAILED_AR, safePhoneNext } from "@/lib/phoneOtp/phoneOtpRules";
import { sanitizePhoneDigits } from "@/lib/services/saudiMobile";

type Status = {
  required: boolean;
  verified: boolean;
  masked: string | null;
  hasPhone: boolean;
  available: boolean;
  sentBefore: boolean;
  lastSentAt: string | null;
  home: string;
};

type Load = { kind: "loading" } | { kind: "signin" } | { kind: "error"; message: string } | { kind: "ready"; status: Status };

const RESEND_FALLBACK_SEC = 60;

function toLatinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
}

export default function VerifyPhonePage() {
  const { lang, theme } = useTheme();
  const isAr = lang !== "en";
  const t = useCallback((ar: string, en: string) => (isAr ? ar : en), [isAr]);
  const captcha = useTurnstile({ isAr, theme, action: "phone_otp" });

  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [resendAt, setResendAt] = useState<number>(0);
  const [now, setNow] = useState<number>(() => Date.now());
  const [changing, setChanging] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [done, setDone] = useState(false);

  const next = useMemo(() => {
    if (typeof window === "undefined") return null;
    return safePhoneNext(new URLSearchParams(window.location.search).get("next"));
  }, []);

  const goOn = useCallback(
    (home: string) => {
      // A full load: the proxy reads the confirmed account afresh.
      window.location.assign(next ?? home ?? "/");
    },
    [next],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/auth/phone-otp/status", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401) return setLoad({ kind: "signin" });
      const body = (await res.json().catch(() => null)) as (Status & { error?: string }) | null;
      if (!res.ok || !body || typeof body.required !== "boolean") {
        return setLoad({ kind: "error", message: (body && body.error) || t("الخدمة غير متاحة مؤقتًا، حاول بعد قليل.", "The service is unavailable right now. Try again shortly.") });
      }
      setLoad({ kind: "ready", status: body });
      if (body.lastSentAt) {
        const at = Date.parse(body.lastSentAt) + RESEND_FALLBACK_SEC * 1000;
        if (at > Date.now()) {
          setResendAt(at);
          setSent(true);
        }
      }
    } catch {
      setLoad({ kind: "error", message: t("تعذّر الاتصال الآن. تحقّق من اتصالك ثم أعد تحميل الصفحة.", "Could not connect. Check your connection and reload.") });
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Nothing to confirm (an older account, staff, or already confirmed): move on.
  useEffect(() => {
    if (load.kind === "ready" && (load.status.verified || !load.status.required)) {
      const id = setTimeout(() => goOn(load.status.home), 1200);
      return () => clearTimeout(id);
    }
  }, [load, goOn]);

  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [resendAt]);

  const status = load.kind === "ready" ? load.status : null;
  // Typing a number: «تغيير الرقم», or an account with no valid mobile yet (a Google sign-up).
  const typing = !!status && (changing || !status.hasPhone);
  const needsCaptcha = !!status && (!status.sentBefore || typing);
  const waitSec = Math.max(0, Math.ceil((resendAt - now) / 1000));

  async function send() {
    if (!status) return;
    if (needsCaptcha && !canSubmitWithCaptcha(captcha.state)) {
      setMessage({ ok: false, text: captchaSubmitError(captcha.state, isAr) || t("أكمل التحقق الأمني أولًا.", "Complete the security check first.") });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/auth/phone-otp/start", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(typing ? { phone: newPhone } : {}),
          ...(needsCaptcha && captcha.token ? { turnstileToken: captcha.token } : {}),
        }),
      });
      if (needsCaptcha) captcha.spend();
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; resendAfterSec?: number; retryAfterSec?: number; reason?: string } | null;
      if (res.ok && body?.ok) {
        setSent(true);
        setChanging(false);
        setCode("");
        setResendAt(Date.now() + (body.resendAfterSec ?? RESEND_FALLBACK_SEC) * 1000);
        setNow(Date.now());
        setMessage({ ok: true, text: t("أرسلنا الرمز إلى واتساب على رقمك. صالح عشر دقائق.", "We sent the code to your WhatsApp. It is valid for ten minutes.") });
        await refresh();
        return;
      }
      if (res.status === 409 && body?.reason === "already") return void (await refresh());
      if (body?.retryAfterSec) {
        setResendAt(Date.now() + body.retryAfterSec * 1000);
        setNow(Date.now());
      }
      const fallback = isAr ? PHONE_SEND_FAILED_AR : "We could not send the code right now. Try again shortly.";
      setMessage({ ok: false, text: isAr ? body?.error || fallback : fallback });
    } catch {
      if (needsCaptcha) captcha.spend();
      setMessage({ ok: false, text: isAr ? PHONE_SEND_FAILED_AR : "We could not send the code right now. Try again shortly." });
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    const clean = toLatinDigits(code).replace(/\D/g, "");
    if (clean.length !== 6) {
      setMessage({ ok: false, text: t("أدخل الرمز المكوّن من ستة أرقام.", "Enter the six-digit code.") });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/auth/phone-otp/verify", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: clean }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; home?: string; error?: string } | null;
      if (res.ok && body?.ok) {
        setDone(true);
        setMessage({ ok: true, text: t("تمّ تأكيد رقم جوالك. جارٍ نقلك…", "Your mobile is confirmed. Taking you on…") });
        setTimeout(() => goOn(body.home ?? "/"), 900);
        return;
      }
      setMessage({ ok: false, text: isAr ? body?.error || "تعذّر التحقق الآن، حاول بعد قليل." : "That did not work. Check the code or request a new one." });
    } catch {
      setMessage({ ok: false, text: t("تعذّر الاتصال الآن، حاول بعد قليل.", "Could not connect. Try again shortly.") });
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    try {
      await createClient().auth.signOut();
    } finally {
      window.location.assign("/");
    }
  }

  const card = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900";
  const btn = "inline-flex items-center justify-center gap-2 rounded-xl bg-royal px-4 py-3 text-sm font-bold text-white disabled:opacity-50";

  return (
    <main dir={isAr ? "rtl" : "ltr"} className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-12">
      <div className={card}>
        <div className="mb-4 flex items-center gap-3">
          <WhatsappLogo size={30} weight="duotone" className="text-emerald-600 dark:text-emerald-400" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-zinc-100">{t("تأكيد رقم الجوال", "Confirm your mobile")}</h1>
        </div>

        {load.kind === "loading" && (
          <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-zinc-400">
            <SpinnerGap size={16} className="animate-spin" />
            {t("جارٍ التحقق من حالة حسابك…", "Checking your account…")}
          </p>
        )}

        {load.kind === "signin" && (
          <div className="space-y-3 text-sm text-slate-700 dark:text-zinc-300">
            <p>{t("سجّل دخولك أولًا لتأكيد رقم جوالك.", "Sign in first to confirm your mobile.")}</p>
            <Link href="/login?from=/verify-phone" className="font-semibold text-royal hover:underline dark:text-emerald-400">
              {t("تسجيل الدخول", "Sign in")}
            </Link>
          </div>
        )}

        {load.kind === "error" && (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300">
              <WarningCircle size={18} weight="fill" />
              {load.message}
            </p>
            <button type="button" className={btn} onClick={() => void refresh()}>
              {t("أعد المحاولة", "Try again")}
            </button>
          </div>
        )}

        {status && (status.verified || !status.required) && (
          <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle size={18} weight="fill" />
            {status.verified ? t("رقم جوالك مؤكَّد. جارٍ نقلك…", "Your mobile is confirmed. Taking you on…") : t("لا يلزم حسابك تأكيد. جارٍ نقلك…", "No confirmation is needed. Taking you on…")}
          </p>
        )}

        {status && status.required && !status.verified && (
          <div className="space-y-4 text-sm leading-7 text-slate-700 dark:text-zinc-300">
            <p>
              {t(
                "لإكمال تسجيلك أكّد رقم جوالك: نرسل إليك رمزًا من ستة أرقام عبر واتساب، ثم تكتبه هنا.",
                "To finish signing up, confirm your mobile: we send a six-digit code to your WhatsApp, then you type it here.",
              )}
            </p>

            {!changing && status.hasPhone && (
              <p className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5">
                {t("الرقم: ", "Number: ")}
                <span dir="ltr" className="font-mono font-bold">{status.masked}</span>
                <button type="button" className="ms-3 text-xs font-semibold text-royal hover:underline dark:text-emerald-400" onClick={() => { setChanging(true); setMessage(null); }}>
                  {t("تغيير الرقم", "Change number")}
                </button>
              </p>
            )}

            {typing && (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold">{t("رقم جوالك السعودي", "Your Saudi mobile number")}</span>
                <input
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="05XXXXXXXX"
                  value={newPhone}
                  onChange={(e) => setNewPhone(sanitizePhoneDigits(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-base outline-none dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                />
                {status.hasPhone && (
                  <button type="button" className="mt-1 text-xs text-slate-500 hover:underline dark:text-zinc-400" onClick={() => { setChanging(false); setNewPhone(""); }}>
                    {t("إلغاء", "Cancel")}
                  </button>
                )}
              </label>
            )}

            {!status.available && (
              <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                <WarningCircle size={15} weight="fill" />
                {isAr ? PHONE_SEND_FAILED_AR : "We cannot send codes right now. Try again shortly."}
              </p>
            )}

            {needsCaptcha && <TurnstileWidget control={captcha} isAr={isAr} />}

            <button
              type="button"
              className={`${btn} w-full`}
              disabled={busy || done || waitSec > 0 || (typing && newPhone.length < 10)}
              onClick={() => void send()}
            >
              {busy ? <SpinnerGap size={16} className="animate-spin" /> : <WhatsappLogo size={18} />}
              {waitSec > 0
                ? t(`أعد الإرسال بعد ${waitSec.toLocaleString("ar-SA")} ث`, `Resend in ${waitSec}s`)
                : sent
                  ? t("أعد إرسال الرمز عبر واتساب", "Resend the code on WhatsApp")
                  : t("أرسل الرمز عبر واتساب", "Send the code on WhatsApp")}
            </button>

            {sent && (
              <div className="space-y-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold">{t("الرمز المكوّن من ستة أرقام", "The six-digit code")}</span>
                  <input
                    dir="ltr"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={12}
                    value={code}
                    onChange={(e) => setCode(toLatinDigits(e.target.value).replace(/[^\d]/g, "").slice(0, 6))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void verify();
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-center font-mono text-2xl tracking-[0.5em] outline-none dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                  />
                </label>
                <button type="button" className={`${btn} w-full`} disabled={busy || done || code.length !== 6} onClick={() => void verify()}>
                  {t("تأكيد", "Confirm")}
                </button>
              </div>
            )}

            {message && (
              <p
                role="status"
                className={`flex items-center gap-2 text-xs font-semibold ${message.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-300"}`}
              >
                {message.ok ? <CheckCircle size={15} weight="fill" /> : <WarningCircle size={15} weight="fill" />}
                {message.text}
              </p>
            )}

            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {t("حتى تأكيد الرقم لا يمكن استخدام المنصة. يمكنك قراءة ", "Until the number is confirmed the platform cannot be used. You can read the ")}
              <Link href="/terms" className="underline">{t("الشروط", "terms")}</Link>
              {t(" و", " and ")}
              <Link href="/privacy" className="underline">{t("سياسة الخصوصية", "privacy policy")}</Link>
              {t(".", ".")}
            </p>
          </div>
        )}

        {load.kind !== "loading" && load.kind !== "signin" && (
          <button type="button" onClick={() => void signOut()} className="mt-6 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:underline dark:text-zinc-400">
            <SignOut size={14} />
            {t("تسجيل الخروج", "Sign out")}
          </button>
        )}
      </div>
    </main>
  );
}
