"use client";

/**
 * EmailTestCard — «بريد المنصة: اختبار الإرسال» (batch l19, LIVE-18).
 *
 *   - the diagnostic (GET /api/v1/admin/email): which e-mail variables the
 *     server has — set or not, never a value — the provider the sender would
 *     use, what is missing, the mail server's host / port / TLS mode and the
 *     From address;
 *   - «أرسل بريدًا تجريبيًا إلى بريدي» (POST /api/v1/admin/email/test-send):
 *     one mail through the platform's one sender to the admin's own account
 *     address, showing the honest result and the error class / reply code.
 *
 * Fetch only: nothing here imports the sender (src/lib/email/*).
 * The sign-in and password-reset e-mails are sent by the sign-in service
 * itself (its own server settings) — this test does not cover them, and the
 * card says so.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, EnvelopeSimple, PaperPlaneTilt, SpinnerGap, WarningCircle, XCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

type Diagnostic = {
  provider: "smtp" | "resend" | null;
  set: Record<string, boolean>;
  smtpMissing: string[];
  host: string | null;
  port: number;
  security: "tls" | "starttls";
  senderAddress: string | null;
  senderName: string | null;
};

type TestAnswer = {
  result?: string;
  errorClass?: string;
  messageAr?: string;
  code?: string | null;
  originalCode?: string | null;
  responseCode?: number | null;
  httpStatus?: number | null;
  error?: string;
};

type Line = { ok: boolean; text: string; codes: string | null } | null;

const PROVIDER_AR: Record<string, string> = {
  smtp: "صندوق بريد المنصة (SMTP)",
  resend: "خدمة Resend",
};

export function EmailTestCard() {
  const { isDark } = useTheme();
  const [diag, setDiag] = useState<Diagnostic | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [testing, setTesting] = useState(false);
  const [line, setLine] = useState<Line>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/email", { cache: "no-store" });
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

  async function sendTest() {
    setTesting(true);
    setLine(null);
    try {
      const res = await fetch("/api/v1/admin/email/test-send", { method: "POST" });
      const body = (await res.json().catch(() => null)) as TestAnswer | null;
      if (!res.ok || !body?.result) {
        setLine({ ok: false, text: body?.error || "تعذّر الإرسال التجريبي الآن.", codes: null });
      } else {
        const codes = [body.code, body.originalCode, body.responseCode, body.httpStatus ? `HTTP ${body.httpStatus}` : null, body.errorClass]
          .filter((c) => c !== null && c !== undefined && c !== "")
          .join(" · ");
        setLine({ ok: body.result === "sent", text: body.messageAr || "—", codes: body.result === "sent" ? null : codes || null });
      }
    } catch {
      setLine({ ok: false, text: "تعذّر الإرسال التجريبي الآن.", codes: null });
    }
    setTesting(false);
  }

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const strong = isDark ? "text-zinc-100" : "text-slate-800";
  const okIcon = (ok: boolean) =>
    ok ? <CheckCircle size={14} weight="fill" className="text-emerald-500" /> : <XCircle size={14} weight="fill" className="text-rose-500" />;

  const rows: Array<[string, string]> = [
    ["SMTP_HOST", "عنوان خادم البريد"],
    ["SMTP_PORT", "المنفذ (اختياري، الافتراضي 587)"],
    ["SMTP_USER", "اسم مستخدم الصندوق"],
    ["SMTP_PASS", "كلمة مرور الصندوق"],
    ["EMAIL_FROM", "عنوان المرسل (أو SMTP_ADMIN_EMAIL)"],
    ["EMAIL_FROM_NAME", "اسم المرسل (أو SMTP_SENDER_NAME)"],
  ];

  return (
    <div className={`rounded-2xl border p-6 ${isDark ? "bg-zinc-900/60 border-white/[0.06]" : "bg-white border-slate-100 shadow-sm"}`} id="email-test">
      <div className="mb-4 flex items-start gap-3">
        <EnvelopeSimple size={22} weight="duotone" className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
        <div>
          <p className={`text-sm font-bold ${strong}`}>بريد المنصة: اختبار الإرسال</p>
          <p className={`mt-1 text-[11px] leading-relaxed ${muted}`}>
            يرسل التطبيق التنبيهات ورموز التحقق والفواتير من صندوق بريد المنصة. يبيّن هذا القسم أي الإعدادات موجودة على الخادم
            (دون إظهار قيمها)، ويرسل رسالة اختبار إلى بريد حسابك أنت. أما رسائل تسجيل الدخول واستعادة كلمة المرور فترسلها خدمة
            الدخول بإعداداتها الخاصة على الخادم، ولا يشملها هذا الاختبار.
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
          <p className={`mb-2 text-xs font-bold ${strong}`}>
            طريقة الإرسال الحالية: {diag.provider ? PROVIDER_AR[diag.provider] : "غير مضبوطة — لن يُرسل أي بريد"}
          </p>
          {diag.provider !== "smtp" && diag.smtpMissing.length > 0 && (
            <p className={`mb-2 text-[11px] ${isDark ? "text-amber-300" : "text-amber-700"}`}>
              ينقص صندوق البريد: <span dir="ltr" className="font-mono">{diag.smtpMissing.join(", ")}</span>
            </p>
          )}
          <ul className={`mb-3 grid gap-1 text-[11px] sm:grid-cols-2 ${muted}`}>
            {rows.map(([name, label]) => {
              const ok =
                name === "EMAIL_FROM"
                  ? Boolean(diag.set.EMAIL_FROM || diag.set.SMTP_ADMIN_EMAIL)
                  : name === "EMAIL_FROM_NAME"
                    ? Boolean(diag.set.EMAIL_FROM_NAME || diag.set.SMTP_SENDER_NAME)
                    : name === "SMTP_PORT"
                      ? true
                      : Boolean(diag.set[name]);
              return (
                <li key={name} className="flex items-center gap-1.5">
                  {okIcon(ok)} {label} <span dir="ltr" className="font-mono">{name}</span>
                </li>
              );
            })}
          </ul>
          <ul className={`mb-4 grid gap-1 text-[11px] ${muted}`}>
            <li>
              الخادم: <span dir="ltr" className="font-mono">{diag.host ?? "—"}</span> — المنفذ: <span dir="ltr" className="font-mono">{diag.port}</span> —
              التشفير: {diag.security === "tls" ? "مباشر من أول الاتصال" : "STARTTLS إلزامي"}
            </li>
            <li>
              المرسل: {diag.senderName ?? "—"} <span dir="ltr" className="font-mono">{diag.senderAddress ? `<${diag.senderAddress}>` : ""}</span>
            </li>
          </ul>

          <button
            type="button"
            disabled={testing}
            onClick={() => void sendTest()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-xs font-bold text-[#C8A762] disabled:opacity-60"
          >
            {testing ? <SpinnerGap size={14} className="animate-spin" /> : <PaperPlaneTilt size={14} />}
            أرسل بريدًا تجريبيًا إلى بريدي
          </button>
        </>
      )}

      {line && (
        <div className="mt-2">
          <p className={`text-xs font-bold ${line.ok ? (isDark ? "text-emerald-400" : "text-emerald-700") : isDark ? "text-rose-400" : "text-rose-700"}`}>
            {line.text}
          </p>
          {line.codes && (
            <p className={`mt-1 text-[11px] ${muted}`}>
              رمز الخطأ للفريق التقني: <span dir="ltr" className="font-mono">{line.codes}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
