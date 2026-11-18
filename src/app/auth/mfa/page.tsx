"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Key, Copy, DownloadSimple, SignOut, ArrowLeft } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { safeLocalPath } from "@/lib/auth/safeLocalPath";

/**
 * /auth/mfa — two-step sign-in (TOTP) for admin/staff accounts (owner item
 * 18, batch l7). One page, four states, decided by GET /api/v1/auth/mfa/status:
 *
 *   challenge  an enrolled account on an aal1 session (just typed the
 *              password): the 6-digit code from the authenticator app, or a
 *              backup code if the phone is lost.
 *   enroll     no authenticator yet: QR code + the secret to type by hand,
 *              then a first code to confirm it, then 10 backup codes.
 *   manage     enrolled and on aal2: how many backup codes are left, and a
 *              new set on demand.
 *   other      signed out / not a staff account.
 *
 * Not PROTECTED and not under /dashboard/admin: src/proxy.ts sends an admin
 * here, so nothing may send it back (no loop). TOTP itself is GoTrue's
 * (supabase.auth.mfa.enroll / challenge / verify); the backup codes are ours
 * (src/lib/auth/staffBackupCodes.ts).
 */

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "signed_out" }
  | { kind: "not_staff" }
  | {
      kind: "staff";
      mode: "rollout" | "required";
      enrolled: boolean;
      aal: "aal1" | "aal2" | null;
      need: null | "challenge" | "enroll";
      backupCodesLeft: number | null;
      emailAlerts: boolean;
    };

type EnrollState = { factorId: string; qr: string; secret: string } | null;

const DEFAULT_NEXT = "/dashboard/admin";
const card = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900";
const input =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center font-mono text-lg tracking-widest text-slate-900 outline-none focus:border-emerald-600 dark:border-white/15 dark:bg-zinc-950 dark:text-white";
const primary =
  "rounded-xl bg-royal px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 dark:bg-emerald-600";
const secondary =
  "rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/5";

/** Arabic-Indic digits typed on a phone keyboard → Latin, digits only. */
function totpDigits(v: string): string {
  return v
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "")
    .slice(0, 6);
}

function nextFromUrl(): string {
  if (typeof window === "undefined") return DEFAULT_NEXT;
  return safeLocalPath(new URLSearchParams(window.location.search).get("next"), DEFAULT_NEXT);
}

export default function StaffMfaPage() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [enroll, setEnroll] = useState<EnrollState>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/auth/mfa/status", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401) return setStatus({ kind: "signed_out" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) {
        return setStatus({ kind: "error", message: body?.error ?? "تعذّر التحقق من حالة الحساب. أعد تحميل الصفحة." });
      }
      if (!body.isStaff) return setStatus({ kind: "not_staff" });
      setStatus({
        kind: "staff",
        mode: body.mode,
        enrolled: !!body.enrolled,
        aal: body.aal ?? null,
        need: body.need ?? null,
        backupCodesLeft: typeof body.backupCodesLeft === "number" ? body.backupCodesLeft : null,
        emailAlerts: body.emailAlerts === true,
      });
    } catch {
      setStatus({ kind: "error", message: "تعذّر الاتصال بالخادم. تحقق من الاتصال ثم أعد تحميل الصفحة." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const goNext = () => {
    // A full load, so src/proxy.ts sees the new aal2 cookies.
    window.location.assign(nextFromUrl());
  };

  const signOut = async () => {
    try {
      await createClient().auth.signOut();
    } catch {
      // cleared locally either way
    }
    window.location.href = "/login";
  };

  // ── challenge: the 6-digit code of an enrolled account ──────────────────
  const verifyChallenge = async () => {
    setError("");
    if (code.length !== 6) return setError("أدخل الرمز المكوّن من ٦ أرقام من تطبيق المصادقة.");
    setBusy(true);
    try {
      const supabase = createClient();
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp?.[0];
      if (listError || !factor) {
        setError("تعذّر العثور على تطبيق المصادقة المرتبط بالحساب. أعد تسجيل الدخول.");
        return;
      }
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (verifyError) {
        setError(
          verifyError.status === 429
            ? "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة."
            : "الرمز غير صحيح أو انتهت صلاحيته. أدخل الرمز الظاهر الآن في التطبيق.",
        );
        setCode("");
        return;
      }
      goNext();
    } catch {
      setError("تعذّر الاتصال بالخادم. أعد المحاولة.");
    } finally {
      setBusy(false);
    }
  };

  // ── recovery: one backup code removes the lost authenticator ────────────
  const recover = async () => {
    setError("");
    if (backupCode.trim() === "") return setError("أدخل أحد رموز الاحتياط.");
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/mfa/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ code: backupCode }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "تعذّر قبول رمز الاحتياط.");
        return;
      }
      // The old factor is gone; the session must learn it before enrolling.
      await createClient().auth.refreshSession().catch(() => null);
      setUseBackup(false);
      setBackupCode("");
      await load();
    } catch {
      setError("تعذّر الاتصال بالخادم. أعد المحاولة.");
    } finally {
      setBusy(false);
    }
  };

  // ── enrolment: QR + secret, then a first code ───────────────────────────
  const startEnroll = async () => {
    setError("");
    setBusy(true);
    try {
      const supabase = createClient();
      // An earlier attempt left behind is removed first (GoTrue keeps it as
      // "unverified" and limits how many a user may hold).
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => null);
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Nezamy",
        friendlyName: `nezamy-admin-${Date.now()}`,
      });
      if (enrollError || !data || data.type !== "totp") {
        setError(
          "تعذّر بدء الربط. قد يكون التحقق بخطوتين غير مفعّل في خادم المصادقة؛ أبلغ مسؤول الخادم (GOTRUE_MFA_TOTP_ENROLL_ENABLED).",
        );
        return;
      }
      setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch {
      setError("تعذّر الاتصال بالخادم. أعد المحاولة.");
    } finally {
      setBusy(false);
    }
  };

  const generateCodes = async (): Promise<boolean> => {
    const res = await fetch("/api/v1/auth/mfa/backup-codes", { method: "POST", credentials: "same-origin" });
    const body = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(body?.codes)) {
      setError(body?.error ?? "تعذّر إنشاء رموز الاحتياط. يمكنك إنشاؤها لاحقاً من هذه الصفحة.");
      return false;
    }
    setCodes(body.codes as string[]);
    return true;
  };

  const confirmEnroll = async () => {
    setError("");
    if (!enroll) return;
    if (code.length !== 6) return setError("أدخل الرمز المكوّن من ٦ أرقام الظاهر في التطبيق.");
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.factorId, code });
      if (verifyError) {
        setError("الرمز غير صحيح. تأكد أن وقت الجوال مضبوط تلقائياً ثم أدخل الرمز الظاهر الآن.");
        setCode("");
        return;
      }
      setEnroll(null);
      setCode("");
      // The session is aal2 now: the backup codes can be made.
      await generateCodes();
      await load();
    } catch {
      setError("تعذّر الاتصال بالخادم. أعد المحاولة.");
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    setError("");
    if (!window.confirm("ستتوقف رموز الاحتياط الحالية عن العمل فوراً. هل تريد إنشاء مجموعة جديدة؟")) return;
    setBusy(true);
    try {
      await generateCodes();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const copyCodes = async () => {
    if (!codes) return;
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const downloadCodes = () => {
    if (!codes) return;
    const blob = new Blob(
      [`رموز احتياط التحقق بخطوتين — نظامي\nكل رمز يُستخدم مرة واحدة.\n\n${codes.join("\n")}\n`],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nezamy-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── render ───────────────────────────────────────────────────────────────
  let body: React.ReactNode;
  if (status.kind === "loading") {
    body = <p className="text-sm text-slate-500 dark:text-zinc-400">جارٍ التحقق من حالة الحساب…</p>;
  } else if (status.kind === "error") {
    body = <p className="text-sm text-rose-700 dark:text-rose-400">{status.message}</p>;
  } else if (status.kind === "signed_out") {
    body = (
      <div className="space-y-3 text-sm">
        <p>سجّل الدخول أولاً بالبريد وكلمة المرور.</p>
        <Link href={`/login?next=${encodeURIComponent("/auth/mfa")}`} className={primary}>
          تسجيل الدخول
        </Link>
      </div>
    );
  } else if (status.kind === "not_staff") {
    body = (
      <div className="space-y-3 text-sm">
        <p>التحقق بخطوتين في هذه الصفحة خاص بحسابات الإدارة.</p>
        <Link href="/" className={secondary}>
          الصفحة الرئيسية
        </Link>
      </div>
    );
  } else if (codes) {
    body = (
      <div className="space-y-4 text-sm leading-7">
        <h2 className="text-base font-bold">رموز الاحتياط</h2>
        <p>
          احفظ هذه الرموز العشرة في مكان آمن خارج الجوال (مدير كلمات مرور أو ورقة مطبوعة). كل رمز يُستخدم مرة واحدة
          إذا فقدت تطبيق المصادقة. لن تظهر مرة أخرى.
        </p>
        <ul dir="ltr" className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-4 font-mono text-sm dark:bg-zinc-950">
          {codes.map((c) => (
            <li key={c} className="text-slate-900 dark:text-white">
              {c}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copyCodes} className={`${secondary} flex items-center gap-1.5`}>
            <Copy size={16} /> {copied ? "نُسخت" : "نسخ"}
          </button>
          <button type="button" onClick={downloadCodes} className={`${secondary} flex items-center gap-1.5`}>
            <DownloadSimple size={16} /> تنزيل ملف نصي
          </button>
        </div>
        <button type="button" onClick={() => { setCodes(null); goNext(); }} className={primary}>
          حفظتها — متابعة
        </button>
      </div>
    );
  } else if (status.need === "challenge") {
    body = useBackup ? (
      <div className="space-y-4 text-sm leading-7">
        <h2 className="text-base font-bold">استخدام رمز احتياط</h2>
        <p>
          أدخل أحد رموز الاحتياط العشرة. سيُلغى تطبيق المصادقة القديم، ثم تربط تطبيقاً جديداً مباشرة وتحصل على رموز
          احتياط جديدة.{status.emailAlerts ? " يُرسل إليك بريد بهذا الإجراء." : ""}
        </p>
        <input
          dir="ltr"
          autoComplete="off"
          value={backupCode}
          onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          className={input}
          aria-label="رمز الاحتياط"
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={recover} disabled={busy} className={primary}>
            تأكيد رمز الاحتياط
          </button>
          <button type="button" onClick={() => { setUseBackup(false); setError(""); }} className={secondary}>
            رجوع إلى رمز التطبيق
          </button>
        </div>
      </div>
    ) : (
      <div className="space-y-4 text-sm leading-7">
        <h2 className="text-base font-bold">أدخل رمز التحقق</h2>
        <p>افتح تطبيق المصادقة (Google Authenticator أو Microsoft Authenticator أو غيرهما) وأدخل الرمز الظاهر لحساب «نظامي».</p>
        <input
          dir="ltr"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(totpDigits(e.target.value))}
          onKeyDown={(e) => { if (e.key === "Enter") void verifyChallenge(); }}
          placeholder="123456"
          className={input}
          aria-label="رمز التحقق"
          autoFocus
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={verifyChallenge} disabled={busy} className={primary}>
            تحقق
          </button>
          <button type="button" onClick={() => { setUseBackup(true); setError(""); }} className={secondary}>
            فقدت الجوال؟ استخدم رمز احتياط
          </button>
        </div>
      </div>
    );
  } else if (!status.enrolled) {
    body = enroll ? (
      <div className="space-y-4 text-sm leading-7">
        <h2 className="text-base font-bold">امسح الرمز بتطبيق المصادقة</h2>
        <ol className="list-decimal space-y-1 pe-5">
          <li>ثبّت تطبيق مصادقة على جوالك (Google Authenticator أو Microsoft Authenticator).</li>
          <li>اختر «إضافة حساب» ثم امسح الرمز التالي.</li>
          <li>أدخل الرمز المكوّن من ٦ أرقام الظاهر في التطبيق.</li>
        </ol>
        {/* White in both themes on purpose: a QR code needs a light quiet zone to scan. */}
        <div className="flex justify-center rounded-2xl p-4" style={{ background: "#ffffff" }}>
          {/* GoTrue returns an SVG data URI; rendered as an image, never as markup. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt="رمز QR لربط تطبيق المصادقة" width={200} height={200} />
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-zinc-400">لا تستطيع المسح؟ أدخل هذا المفتاح يدوياً في التطبيق:</p>
          <p dir="ltr" className="mt-1 select-all break-all rounded-xl bg-slate-50 p-3 font-mono text-sm text-slate-900 dark:bg-zinc-950 dark:text-white">
            {enroll.secret}
          </p>
        </div>
        <input
          dir="ltr"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(totpDigits(e.target.value))}
          onKeyDown={(e) => { if (e.key === "Enter") void confirmEnroll(); }}
          placeholder="123456"
          className={input}
          aria-label="رمز التحقق"
        />
        <button type="button" onClick={confirmEnroll} disabled={busy} className={primary}>
          تأكيد الربط
        </button>
      </div>
    ) : (
      <div className="space-y-4 text-sm leading-7">
        <h2 className="text-base font-bold">تفعيل التحقق بخطوتين</h2>
        {status.mode === "required" ? (
          <p>حسابات الإدارة لا تفتح لوحة الإدارة قبل تفعيل التحقق بخطوتين. يستغرق الأمر دقيقة.</p>
        ) : (
          <p>
            اربط تطبيق مصادقة بحسابك الإداري ليُطلب رمز منه مع كلمة المرور عند كل دخول. بعد التفعيل لن تُفتح لوحة الإدارة
            بكلمة المرور وحدها.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={startEnroll} disabled={busy} className={`${primary} flex items-center gap-1.5`}>
            <Key size={16} /> ابدأ الربط
          </button>
          {status.mode !== "required" && (
            <button type="button" onClick={goNext} className={`${secondary} flex items-center gap-1.5`}>
              لاحقاً <ArrowLeft size={14} />
            </button>
          )}
        </div>
      </div>
    );
  } else {
    body = (
      <div className="space-y-4 text-sm leading-7">
        <h2 className="text-base font-bold">التحقق بخطوتين مفعّل</h2>
        <p>
          {status.backupCodesLeft === null
            ? "تعذّر قراءة عدد رموز الاحتياط المتبقية."
            : status.backupCodesLeft === 0
              ? "لم يبقَ لديك أي رمز احتياط صالح. أنشئ مجموعة جديدة الآن."
              : `رموز الاحتياط المتبقية: ${status.backupCodesLeft} من ١٠.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={regenerate} disabled={busy} className={secondary}>
            إنشاء رموز احتياط جديدة
          </button>
          <button type="button" onClick={goNext} className={primary}>
            متابعة
          </button>
        </div>
      </div>
    );
  }

  return (
    <main dir="rtl" className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-4 py-12">
      <div className={card}>
        <div className="mb-5 flex items-center gap-3 text-slate-800 dark:text-zinc-100">
          <ShieldCheck size={28} className="text-emerald-700 dark:text-emerald-400" />
          <h1 className="text-lg font-bold">التحقق بخطوتين — حساب الإدارة</h1>
        </div>
        <div className="text-slate-700 dark:text-zinc-300">{body}</div>
        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        )}
        {status.kind === "staff" && (
          <button
            type="button"
            onClick={signOut}
            className="mt-6 flex items-center gap-1.5 text-xs text-slate-500 hover:underline dark:text-zinc-400"
          >
            <SignOut size={14} /> تسجيل الخروج
          </button>
        )}
      </div>
    </main>
  );
}
