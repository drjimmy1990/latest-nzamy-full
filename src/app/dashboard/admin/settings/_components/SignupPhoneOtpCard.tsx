"use client";

/**
 * SignupPhoneOtpCard — «رمز التحقق عبر واتساب عند التسجيل» (batch l15, user
 * decisions 2026-11-24).
 *
 *   - the switch: platform_settings signup_phone_otp = {"enabled": bool},
 *     through PATCH /api/v1/admin/settings (validated + audited there). The
 *     database stamps enabled_at the FIRST time it is stored on and never
 *     moves it: only accounts created at/after that moment must confirm
 *     their mobile; older accounts, staff and test accounts never do;
 *   - the diagnostic (GET /api/v1/admin/phone-otp): which server variables
 *     are set — never their values — and the template's name and language;
 *   - «أرسل رمزًا تجريبيًا إلى جوالي» (POST /api/v1/admin/phone-otp/test):
 *     one code to the admin's own profile mobile, showing only «أُرسل» or
 *     Zernio's HTTP status. The operator's live check before switching on.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, PaperPlaneTilt, SpinnerGap, WarningCircle, WhatsappLogo, XCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { SIGNUP_PHONE_OTP_KEY } from "@/lib/phoneOtp/phoneOtpRules";

type Diagnostic = {
  apiKeySet: boolean;
  accountIdSet: boolean;
  pepperSet: boolean;
  template: string;
  language: string;
  ready: boolean;
  settingRead: boolean;
  enabled: boolean;
  enabledAt: string | null;
};

type Line = { ok: boolean; text: string } | null;

function riyadh(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function SignupPhoneOtpCard() {
  const { isDark } = useTheme();
  const [diag, setDiag] = useState<Diagnostic | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveLine, setSaveLine] = useState<Line>(null);
  const [testLine, setTestLine] = useState<Line>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/phone-otp", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setDiag((await res.json()) as Diagnostic);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(next: boolean) {
    if (next && !confirm("بعد التشغيل يجب على كل حساب جديد تأكيد جواله برمز واتساب قبل استعمال المنصة. هل أرسلت رمزًا تجريبيًا ووصلك؟")) return;
    setSaving(true);
    setSaveLine(null);
    try {
      const res = await fetch("/api/v1/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: SIGNUP_PHONE_OTP_KEY, value: { enabled: next } }),
      });
      if (res.ok) {
        setSaveLine({ ok: true, text: next ? "شُغّل. يسري على الحسابات الجديدة خلال دقيقة." : "أُوقف. لا يُطلب الرمز من أحد." });
        await load();
      } else {
        const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
        setSaveLine({ ok: false, text: typeof body?.error === "string" && body.error ? body.error : "تعذّر الحفظ، حاول مرة أخرى." });
      }
    } catch {
      setSaveLine({ ok: false, text: "تعذّر الحفظ، حاول مرة أخرى." });
    }
    setSaving(false);
  }

  async function sendTest() {
    setTesting(true);
    setTestLine(null);
    try {
      const res = await fetch("/api/v1/admin/phone-otp/test", { method: "POST" });
      const body = (await res.json().catch(() => null)) as { result?: string; httpStatus?: number | null; error?: string } | null;
      if (!res.ok) {
        setTestLine({ ok: false, text: body?.error || "تعذّر الإرسال التجريبي الآن." });
      } else if (body?.result === "sent") {
        setTestLine({ ok: true, text: `أُرسل (HTTP ${body.httpStatus ?? "—"}). تحقّق من واتساب على جوالك.` });
      } else if (body?.result === "no_phone") {
        setTestLine({ ok: false, text: "لا يوجد رقم جوال سعودي صالح في ملفك الشخصي." });
      } else if (body?.result === "unavailable") {
        setTestLine({ ok: false, text: "لم يُرسل: مفتاح Zernio أو معرّف حساب واتساب غير مضبوط على الخادم." });
      } else {
        setTestLine({ ok: false, text: `لم يُرسل${body?.httpStatus ? ` — ردّ Zernio: HTTP ${body.httpStatus}` : " — تعذّر الوصول إلى Zernio"}.` });
      }
    } catch {
      setTestLine({ ok: false, text: "تعذّر الإرسال التجريبي الآن." });
    }
    setTesting(false);
  }

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const strong = isDark ? "text-zinc-100" : "text-slate-800";
  const okIcon = (ok: boolean) =>
    ok ? <CheckCircle size={14} weight="fill" className="text-emerald-500" /> : <XCircle size={14} weight="fill" className="text-rose-500" />;

  return (
    <div className={`rounded-2xl border p-6 ${isDark ? "bg-zinc-900/60 border-white/[0.06]" : "bg-white border-slate-100 shadow-sm"}`} id="signup-phone-otp">
      <div className="mb-4 flex items-start gap-3">
        <WhatsappLogo size={22} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
        <div>
          <p className={`text-sm font-bold ${strong}`}>رمز التحقق عبر واتساب عند التسجيل</p>
          <p className={`mt-1 text-[11px] leading-relaxed ${muted}`}>
            عند التشغيل يؤكّد كل حساب جديد رقم جواله برمز من ستة أرقام يصله عبر واتساب، ولا يستعمل المنصة قبل ذلك. الحسابات
            المنشأة قبل لحظة التشغيل الأولى، وحسابات الإدارة، وحسابات الاختبار لا يُطلب منها شيء. إن تعذّر الإرسال يرى
            المستخدم «تعذّر إرسال الرمز الآن، حاول بعد قليل».
          </p>
        </div>
      </div>

      {loadError && (
        <p className="mb-3 flex items-center gap-2 text-xs font-bold text-rose-600">
          <WarningCircle size={14} weight="fill" /> تعذّر قراءة الحالة. أعد تحميل الصفحة.
        </p>
      )}

      {diag && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={diag.enabled}
              disabled={saving}
              onClick={() => void toggle(!diag.enabled)}
              className={`inline-flex h-7 w-12 items-center rounded-full px-1 transition-colors disabled:opacity-60 ${diag.enabled ? "justify-end bg-[#0B3D2E]" : `justify-start ${isDark ? "bg-zinc-700" : "bg-slate-300"}`}`}
            >
              <span className="inline-block h-5 w-5 rounded-full bg-white" />
            </button>
            <span className={`text-xs font-bold ${strong}`}>{diag.enabled ? "مُشغّل" : "مُوقف"}</span>
            {saving && <SpinnerGap size={14} className="animate-spin" />}
            <span className={`text-[11px] ${muted}`}>أول تشغيل: {riyadh(diag.enabledAt)}</span>
          </div>
          {!diag.settingRead && (
            <p className={`mb-3 text-[11px] ${muted}`}>صف الإعداد غير موجود بعد — شغّل ملف الترحيل 20261205_10 أولًا.</p>
          )}

          <ul className={`mb-4 grid gap-1 text-[11px] sm:grid-cols-2 ${muted}`}>
            <li className="flex items-center gap-1.5">{okIcon(diag.apiKeySet)} مفتاح Zernio (ZERNIO_API_KEY)</li>
            <li className="flex items-center gap-1.5">{okIcon(diag.accountIdSet)} معرّف حساب واتساب (ZERNIO_WHATSAPP_ACCOUNT_ID)</li>
            <li className="flex items-center gap-1.5">{okIcon(diag.pepperSet)} مفتاح تجزئة الرموز (LAWYER_OTP_PEPPER)</li>
            <li className="flex items-center gap-1.5">
              القالب: <span dir="ltr" className="font-mono">{diag.template}</span> — اللغة: <span dir="ltr" className="font-mono">{diag.language}</span>
            </li>
          </ul>

          <button
            type="button"
            disabled={testing}
            onClick={() => void sendTest()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-xs font-bold text-[#C8A762] disabled:opacity-60"
          >
            {testing ? <SpinnerGap size={14} className="animate-spin" /> : <PaperPlaneTilt size={14} />}
            أرسل رمزًا تجريبيًا إلى جوالي
          </button>
        </>
      )}

      {[saveLine, testLine].map(
        (line, i) =>
          line && (
            <p key={i} className={`mt-2 text-xs font-bold ${line.ok ? (isDark ? "text-emerald-400" : "text-emerald-700") : isDark ? "text-rose-400" : "text-rose-700"}`}>
              {line.text}
            </p>
          ),
      )}
    </div>
  );
}
