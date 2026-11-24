"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Warning } from "@phosphor-icons/react";

/**
 * «التحقق بخطوتين» — the signed-in staff member's own two-step state (owner
 * item 18, batch l7), read from GET /api/v1/auth/mfa/status. Enrolment, the
 * backup codes and their renewal happen on /auth/mfa (outside the console, so
 * the gate never blocks the page that clears it).
 */
type MfaStatus = {
  mode: "rollout" | "required";
  enrolled: boolean;
  aal: "aal1" | "aal2" | null;
  backupCodesLeft: number | null;
  emailAlerts: boolean;
};

const MFA_PAGE = `/auth/mfa?next=${encodeURIComponent("/dashboard/admin/security?tab=two_factor")}`;

export default function TwoFactorPanel({ isDark, card }: { isDark: boolean; card: string }) {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/auth/mfa/status", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        if (!alive) return;
        if (!b?.isStaff) return setFailed(true);
        setStatus({ mode: b.mode, enrolled: !!b.enrolled, aal: b.aal ?? null, backupCodesLeft: b.backupCodesLeft ?? null, emailAlerts: b.emailAlerts === true });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const strong = isDark ? "text-zinc-100" : "text-slate-800";
  const button = "inline-block rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-white hover:opacity-90 dark:bg-emerald-600";

  return (
    <div className={`${card} space-y-4 p-6`} dir="rtl">
      {failed && <p className={`text-[13px] ${muted}`}>تعذّر قراءة حالة التحقق بخطوتين. أعد تحميل الصفحة.</p>}
      {!failed && !status && <p className={`text-[13px] ${muted}`}>جارٍ التحميل…</p>}
      {status && (
        <>
          <div className="flex items-center gap-2">
            {status.enrolled ? (
              <ShieldCheck size={22} className="text-emerald-500" />
            ) : (
              <Warning size={22} className="text-amber-500" />
            )}
            <p className={`text-[14px] font-bold ${strong}`}>
              {status.enrolled ? "التحقق بخطوتين مفعّل لحسابك" : "التحقق بخطوتين غير مفعّل لحسابك"}
            </p>
          </div>
          {/* l14: the OFF state is an amber block, never a muted line */}
          {status.mode === "required" ? (
            <p className={`text-[12px] leading-6 ${muted}`}>الإلزام مفعّل: لا يدخل أي حساب إدارة إلى اللوحة دون تطبيق مصادقة.</p>
          ) : (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] font-bold leading-6 text-amber-300">
              الإلزام متوقف: حساب الإدارة الذي لم يربط تطبيق مصادقة يدخل بكلمة المرور وحدها. بعد أن تفعّله لحسابك يُشغَّل الإلزام من إعداد الخادم ADMIN_MFA_ENFORCE=required.
            </p>
          )}
          {status.enrolled && (
            <p className={`text-[12px] ${muted}`}>
              {status.backupCodesLeft === null
                ? "عدد رموز الاحتياط المتبقية غير متاح."
                : `رموز الاحتياط المتبقية: ${status.backupCodesLeft} من ١٠.`}
            </p>
          )}
          <p className={`text-[12px] ${muted}`}>
            {status.emailAlerts
              ? "تنبيه البريد عند كل دخول جديد إلى حساب إدارة: مفعّل."
              : "تنبيه البريد عند الدخول الجديد متوقف: لم تُضبط خدمة البريد في الخادم."}
          </p>
          <Link href={MFA_PAGE} className={button}>
            {status.enrolled ? "إدارة رموز الاحتياط" : "تفعيل التحقق بخطوتين"}
          </Link>
        </>
      )}
    </div>
  );
}
