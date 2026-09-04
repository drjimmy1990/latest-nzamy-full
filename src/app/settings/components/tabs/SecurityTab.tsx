"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  WarningCircle,
  CheckCircle,
  Eye,
  EyeSlash,
  ClockCountdown,
  ListChecks,
  Headset,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useUser } from "@/hooks/useUser";
import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { createClient } from "@/lib/supabase/client";
import { EmptyPanel, SectionTitle, LocalActionStatus } from "./_shared";
import {
  validateNewPassword,
  arabicAuthError,
  SESSION_TIMEOUT_OPTIONS_MINUTES,
  sessionTimeoutLabel,
  normalizeSessionTimeout,
} from "./_securityFields";

// ── Persistence ───────────────────────────────────────────────────────
//
// The 200 body of GET/PUT /api/v1/settings, in the one field this tab reads
// and writes. two_factor_enabled is deliberately absent here: it used to
// start ON for every account in useState(true) with no TOTP enrolment behind
// it — no QR code, no verified device, nothing an OTP could ever be checked
// against. That control was removed rather than wired, because there is
// nothing real to wire it to yet.
type SecuritySettingsEnvelope = {
  settings: {
    session_timeout_minutes?: number | null;
  } | null;
};

const GENERIC_SETTINGS_ERROR = "تعذّر حفظ الإعداد. تحقق من اتصالك وحاول مرة أخرى.";

function arabicSettingsError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  if (raw) console.warn("[Nzamy] security settings request failed:", raw);
  return /[؀-ۿ]/.test(raw) ? raw : GENERIC_SETTINGS_ERROR;
}

// ── Component ─────────────────────────────────────────────────────────
export function SecurityTab() {
  const { loading } = useUser();

  // Session timeout — the one real setting on this tab.
  const [timeoutMinutes, setTimeoutMinutes] = useState(60);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [savingTimeout, setSavingTimeout] = useState(false);
  const [timeoutSaved, setTimeoutSaved] = useState(false);
  const [timeoutError, setTimeoutError] = useState<string | null>(null);

  // Password change — real, via supabase.auth.updateUser. There is no
  // "current password" field: updateUser does not check it, and a field
  // nobody verifies is exactly the decorative control this tab was fixed to
  // remove. See _securityFields.ts.
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdSaved, setPwdSaved] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!isSupabaseMode) {
      setReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<SecuritySettingsEnvelope>("/api/v1/settings");
        if (cancelled) return;
        setTimeoutMinutes(normalizeSessionTimeout(res.settings?.session_timeout_minutes));
      } catch (err) {
        if (cancelled) return;
        // A failed load must block saving, not just default the display —
        // otherwise a save from here would write 60 over whatever was
        // actually stored. The 60 shown below is a placeholder, not a
        // confirmed value, until this error is disclosed — a silent
        // console.warn would leave the select showing a fabricated number
        // with nothing on screen saying so.
        setLoadError(true);
        setTimeoutError(arabicSettingsError(err));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading]);

  const handleSaveTimeout = async () => {
    if (savingTimeout) return;
    setTimeoutError(null);

    if (!isSupabaseMode) {
      setTimeoutSaved(true);
      setTimeout(() => setTimeoutSaved(false), 2500);
      return;
    }
    if (loadError) {
      setTimeoutError("تعذّر تحميل الإعداد الحالي — أعد تحميل الصفحة قبل الحفظ.");
      return;
    }

    setSavingTimeout(true);
    try {
      await apiMutate<SecuritySettingsEnvelope>("/api/v1/settings", "PUT", {
        session_timeout_minutes: timeoutMinutes,
      });
      setTimeoutSaved(true);
      setTimeout(() => setTimeoutSaved(false), 2500);
    } catch (err) {
      setTimeoutError(arabicSettingsError(err));
    } finally {
      setSavingTimeout(false);
    }
  };

  const handleChangePassword = async () => {
    setPwdError(null);
    const validation = validateNewPassword(newPassword, confirmPassword);
    if (validation) {
      setPwdError(validation);
      return;
    }

    // Demo mode has no real Supabase auth session (see src/instrumentation.ts) —
    // supabase.auth.updateUser would hit the real GoTrue endpoint and fail with
    // a session-missing error, mistranslated into "your session expired" for a
    // user who was never logged in via Supabase at all. Take the same
    // local-only success path as handleSaveTimeout / PrivacyTab's handleSave.
    if (!isSupabaseMode) {
      setNewPassword("");
      setConfirmPassword("");
      setPwdSaved(true);
      setTimeout(() => setPwdSaved(false), 3000);
      return;
    }

    setPwdSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      setPwdSaved(true);
      setTimeout(() => setPwdSaved(false), 3000);
    } catch (err) {
      setPwdError(arabicAuthError(err));
    } finally {
      setPwdSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Password */}
      <div>
        <SectionTitle>تغيير كلمة المرور</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] p-5 space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              كلمة المرور الجديدة
            </label>
            <div className="relative">
              <input
                type={showNewPwd ? "text" : "password"}
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2.5 pe-10 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-dark-bg text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-royal/30 focus:border-royal transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowNewPwd((v) => !v)}
                className="absolute inset-y-0 end-3 flex items-center text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                {showNewPwd ? <EyeSlash size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              تأكيد كلمة المرور الجديدة
            </label>
            <input
              type={showNewPwd ? "text" : "password"}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-dark-bg text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-royal/30 focus:border-royal transition-colors"
            />
          </div>

          {pwdError && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              <WarningCircle size={15} weight="fill" />
              {pwdError}
            </div>
          )}
          <LocalActionStatus
            show={pwdSaved && !isSupabaseMode}
            message="تم تغيير كلمة المرور في هذا المتصفح فقط — لا يوجد حساب محفوظ في وضع العرض."
          />

          <motion.button
            whileTap={{ scale: 0.98, y: 1 }}
            onClick={handleChangePassword}
            disabled={pwdSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-royal text-white rounded-xl text-sm font-semibold hover:bg-royal/90 transition-colors shadow-[0_4px_14px_-4px_rgba(11,61,46,0.3)] disabled:opacity-70"
          >
            {pwdSaving ? (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : pwdSaved ? (
              <CheckCircle size={16} weight="fill" />
            ) : null}
            {pwdSaving ? "جاري التحديث..." : pwdSaved ? "تم التحديث" : "تحديث كلمة المرور"}
          </motion.button>
        </div>
      </div>

      {/* Session timeout — the only real control in "التحقق والحماية". The
          2FA, biometric and login-alert switches that used to sit here were
          removed: none had a TOTP enrolment, a WebAuthn credential or an
          alert-delivery path behind it. */}
      <div>
        <SectionTitle>مهلة الجلسة</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] p-5">
          <div className="flex items-start gap-3 mb-4">
            <ClockCountdown size={20} className="text-zinc-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                مهلة الجلسة المفضّلة لديك
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                يُحفظ هذا الاختيار في حسابك كتفضيل — لا يُنهي المنصّة جلستك تلقائياً بعد.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={timeoutMinutes}
              disabled={!ready}
              onChange={(e) => setTimeoutMinutes(Number(e.target.value))}
              className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-dark-bg text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-royal/30 focus:border-royal transition-colors disabled:opacity-60"
            >
              {SESSION_TIMEOUT_OPTIONS_MINUTES.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {sessionTimeoutLabel(minutes)}
                </option>
              ))}
            </select>
            <motion.button
              whileTap={{ scale: 0.98, y: 1 }}
              onClick={handleSaveTimeout}
              disabled={savingTimeout || !ready}
              className="flex items-center gap-2 px-5 py-2.5 bg-royal hover:bg-royal/90 text-white rounded-xl text-sm font-semibold transition-colors shadow-[0_4px_14px_-4px_rgba(11,61,46,0.3)] disabled:opacity-70"
            >
              {savingTimeout ? (
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : timeoutSaved ? (
                <CheckCircle size={16} weight="fill" />
              ) : null}
              {savingTimeout ? "جاري الحفظ..." : timeoutSaved ? "تم الحفظ" : "حفظ"}
            </motion.button>
          </div>

          {timeoutError && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 mt-4">
              <WarningCircle size={15} weight="fill" />
              {timeoutError}
            </div>
          )}
          <LocalActionStatus
            show={timeoutSaved && !isSupabaseMode}
            message="تم تطبيق الإعداد في هذا المتصفح فقط — لا يوجد حساب محفوظ في وضع العرض."
          />
        </div>
      </div>

      {/* Sessions & login history — no source on the platform yet */}
      <div>
        <SectionTitle>الجلسات وسجل الدخول</SectionTitle>
        <EmptyPanel
          icon={<ListChecks size={28} />}
          title="سجل الجلسات وسجل الدخول غير متاحين على المنصّة بعد"
          description="لا يمكن عرض الأجهزة المسجّلة أو محاولات الدخول من هذه الصفحة حالياً."
        />
      </div>

      {/* Danger zone — account deletion needs a human, not a form on this
          page: there is no self-service deletion endpoint. */}
      <div>
        <SectionTitle>منطقة الخطر</SectionTitle>
        <EmptyPanel
          icon={<ShieldCheck size={28} />}
          title="حذف الحساب يحتاج إلى تواصل مع الدعم"
          description={
            "لا يوجد حذف ذاتي للحساب من هذه الصفحة حالياً. لطلب حذف حسابك تواصل مع فريق الدعم."
          }
        />
        <Link
          href="/contact"
          className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-royal dark:text-emerald-400 hover:underline"
        >
          <Headset size={14} />
          التواصل مع الدعم
        </Link>
      </div>
    </div>
  );
}
