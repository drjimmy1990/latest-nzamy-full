"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise, Flask, Trash, EnvelopeSimple } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { blockerHintAr, onDeleteAr, purgeSummaryAr, validBatchId, type PurgeResult } from "@/lib/testBatches/testBatches";

/**
 * «دفعات الاختبار» (owner file 19 §1ج, batch l9-testinfra; SQL 20261129_90).
 * Every row a test account creates is tagged is_test + test_batch on the
 * server. Here the admin sees the test accounts and their batches, moves an
 * account to a new batch, runs «مسح دفعة الاختبار» (a dry-run first, then a
 * TOTP code and the batch id typed again), reads the append-only purge log
 * and the test mail sink (a test account never receives real e-mail; its
 * codes wait here). No account is ever deleted from this page.
 *   GET  /api/v1/admin/test-batches          requireStaff("read")
 *   POST /api/v1/admin/test-batches          requireStaff("settings.write")
 *   POST /api/v1/admin/test-batches/purge    requireStaff("users.delete") + fresh TOTP
 * The admin console is always dark (admin/layout.tsx).
 */

type Account = { user_id: string; email: string | null; batch: string; since: string };
type AuditRow = {
  id: number;
  created_at: string;
  kind: "dry_run" | "purge" | "files";
  status: string;
  test_batch: string;
  actor_email: string | null;
  ip: string | null;
  counts_before: Record<string, { delete?: number }>;
  files: { count?: number; removed?: number; failed?: unknown[] };
  error: string | null;
};
type MailRow = {
  id: number;
  created_at: string;
  to_masked: string;
  reason: string;
  subject: string;
  body_text: string | null;
  tag: string | null;
  test_batch: string | null;
};
type Reply =
  | { ready: false; message: string }
  | {
      ready: true;
      overview: { accounts: Account[]; rows_by_batch: Record<string, number>; tables: number } | null;
      audit: AuditRow[] | null;
      mail: MailRow[] | null;
    };
type DryRun = PurgeResult & {
  batch: string;
  accounts?: number;
  after?: Record<string, number>;
  files?: { count?: number; by_type?: Record<string, number> };
  message?: string;
};

const API = "/api/v1/admin/test-batches";

const REASON_AR: Record<string, string> = {
  test_recipient: "إلى حساب اختبار",
  test_account: "بسبب حساب اختبار",
  reserved_domain: "نطاق اختبار محجوز",
};
const KIND_AR: Record<string, string> = { dry_run: "تشغيل تجريبي", purge: "مسح", files: "حذف الملفات" };
const STATUS_AR: Record<string, string> = {
  dry_run: "بلا حذف",
  purged: "مُسحت",
  blocked: "ممنوع",
  failed: "فشل",
  removed: "حُذفت",
  partial: "حُذف بعضها",
};

const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

const when = (iso: string) => {
  try {
    return new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
      timeZone: "Asia/Riyadh",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
  } catch {
    return { ok: false, status: 0, body: { error: "تعذّر الاتصال بالخادم." } };
  }
}

export default function TestBatchesPage() {
  const [data, setData] = useState<Reply | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const [dry, setDry] = useState<DryRun | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [code, setCode] = useState("");
  const [moveTo, setMoveTo] = useState<Record<string, string>>({});
  const [openMail, setOpenMail] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(API, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as Reply | { error?: string } | null;
      if (!res.ok || !body || !("ready" in body)) {
        setLoadError(String((body as { error?: string } | null)?.error ?? "تعذّر تحميل دفعات الاختبار."));
        return;
      }
      setData(body);
    } catch {
      setLoadError("تعذّر الاتصال بالخادم.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runDry(batch: string) {
    setBusy(true);
    setNotice(null);
    setDry(null);
    setConfirmText("");
    setCode("");
    const r = await post(`${API}/purge`, { batch, dryRun: true });
    setBusy(false);
    if (r.body && typeof r.body.status === "string") {
      setDry(r.body as unknown as DryRun);
      void load();
    } else {
      setNotice({ ok: false, msg: String(r.body?.error ?? "تعذّر التشغيل التجريبي.") });
    }
  }

  async function purge() {
    if (!dry) return;
    const totp = toLatinDigits(code).replace(/\D/g, "");
    if (confirmText !== dry.batch) return setNotice({ ok: false, msg: "اكتب معرّف الدفعة نفسه لتأكيد المسح." });
    if (totp.length !== 6) return setNotice({ ok: false, msg: "أدخل الرمز المكوّن من ٦ أرقام من تطبيق المصادقة." });
    setBusy(true);
    setNotice(null);
    try {
      const supabase = createClient();
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp?.[0];
      if (listError || !factor) {
        setNotice({ ok: false, msg: "لا يوجد تطبيق مصادقة مرتبط بحسابك. فعّل التحقق بخطوتين من صفحة الأمان أولاً." });
        return;
      }
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp });
      if (verifyError) {
        setNotice({
          ok: false,
          msg: verifyError.status === 429 ? "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة." : "رمز التحقق غير صحيح أو انتهت صلاحيته.",
        });
        setCode("");
        return;
      }
      const r = await post(`${API}/purge`, { batch: dry.batch, dryRun: false, confirm: dry.batch });
      setNotice({ ok: r.ok, msg: String(r.body?.message ?? r.body?.error ?? (r.ok ? "تم." : "تعذّر المسح.")) });
      setDry(null);
      setConfirmText("");
      setCode("");
      void load();
    } catch {
      setNotice({ ok: false, msg: "تعذّر الاتصال بالخادم." });
    } finally {
      setBusy(false);
    }
  }

  async function move(acc: Account) {
    const batch = (moveTo[acc.user_id] ?? "").trim();
    if (!validBatchId(batch)) {
      return setNotice({ ok: false, msg: "معرّف الدفعة: أحرف إنجليزية صغيرة وأرقام وشرطات، من ٣ إلى ٦٤ حرفاً (مثل qa-2026-11-20-a)." });
    }
    setBusy(true);
    setNotice(null);
    const r = await post(API, { userId: acc.user_id, batch });
    setBusy(false);
    setNotice({
      ok: r.ok,
      msg: r.ok
        ? r.body?.result === "unchanged"
          ? "الحساب في هذه الدفعة أصلاً."
          : `نُقل الحساب إلى ${batch}: ما ينشئه من الآن يُوسم بها، وما سبق يبقى في دفعته.`
        : String(r.body?.error ?? "تعذّر النقل."),
    });
    if (r.ok) void load();
  }

  const accounts = data && data.ready ? (data.overview?.accounts ?? []) : [];
  const rowsByBatch = data && data.ready ? (data.overview?.rows_by_batch ?? {}) : {};
  const batches = [...new Set([...Object.keys(rowsByBatch), ...accounts.map((a) => a.batch)])].sort();

  return (
    <div className="space-y-6 p-4 sm:p-6" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-bold text-white">
            <Flask size={22} weight="duotone" /> دفعات الاختبار
          </h1>
          <p className="mt-1 max-w-3xl text-[13px] leading-6 text-zinc-400">
            كل ما ينشئه حساب اختبار يُوسم على الخادم بأنه اختبار وبمعرّف دفعته، ولا يستطيع أحد إزالة الوسم. «مسح دفعة الاختبار»
            يحذف صفوف الدفعة وملفاتها فقط، ولا يمسّ أي صف بلا الوسمين، ولا يحذف أي حساب. حسابات الاختبار لا يصلها بريد حقيقي:
            رسائلها تُحفظ في صندوق بريد الاختبار أدناه.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-zinc-300 disabled:opacity-40"
        >
          <ArrowClockwise size={14} /> تحديث
        </button>
      </header>

      {loadError ? <p className="text-[13px] text-red-300">{loadError}</p> : null}
      {data && !data.ready ? <p className="rounded-xl bg-amber-500/10 p-4 text-[13px] text-amber-200">{data.message}</p> : null}
      {notice ? (
        <p role="status" className={`text-[13px] ${notice.ok ? "text-emerald-300" : "text-red-300"}`}>
          {notice.msg}
        </p>
      ) : null}

      {data && data.ready ? (
        <>
          <section className="rounded-2xl border border-white/[0.06] bg-zinc-900/60 p-5">
            <h2 className="mb-3 text-[15px] font-bold text-white">الدفعات</h2>
            {batches.length === 0 ? (
              <p className="text-[13px] text-zinc-400">لا توجد حسابات اختبار ولا صفوف موسومة.</p>
            ) : (
              <ul className="space-y-2">
                {batches.map((b) => (
                  <li key={b} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
                    <span className="font-mono text-[13px] text-white" dir="ltr">
                      {b}
                    </span>
                    <span className="text-[12px] text-zinc-400">
                      {accounts.filter((a) => a.batch === b).length} حساب · {rowsByBatch[b] ?? 0} صف موسوم
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runDry(b)}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] font-bold text-zinc-200 disabled:opacity-40"
                    >
                      تشغيل تجريبي للمسح
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {dry ? (
            <section className="rounded-2xl border border-amber-400/20 bg-zinc-900/80 p-5">
              <h2 className="mb-1 text-[15px] font-bold text-white">
                نتيجة التشغيل التجريبي: <span className="font-mono" dir="ltr">{dry.batch}</span>
              </h2>
              <p className="mb-3 text-[13px] text-zinc-300">{dry.message ?? purgeSummaryAr(dry)}</p>
              {Object.keys(dry.tables ?? {}).length > 0 ? (
                <table className="mb-3 w-full text-[12px] text-zinc-300">
                  <thead>
                    <tr className="text-zinc-500">
                      <th className="py-1 text-right font-normal">الجدول</th>
                      <th className="py-1 text-right font-normal">سيُحذف</th>
                      <th className="py-1 text-right font-normal">يبقى (حساب حقيقي أو سجل يُحفظ)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(dry.tables ?? {}).map(([t, c]) => (
                      <tr key={t} className="border-t border-white/[0.05]">
                        <td className="py-1 font-mono" dir="ltr">{t}</td>
                        <td className="py-1">{c.delete ?? 0}</td>
                        <td className="py-1">{c.kept ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {dry.files && (dry.files.count ?? 0) > 0 ? (
                <p className="mb-3 text-[12px] text-zinc-400">
                  الملفات ({dry.files.count}):{" "}
                  {Object.entries(dry.files.by_type ?? {})
                    .map(([k, n]) => `${k}: ${n}`)
                    .join(" · ")}
                </p>
              ) : null}
              {(dry.blockers ?? []).length > 0 ? (
                <div className="mb-3 rounded-xl bg-red-500/10 p-3 text-[12px] text-red-200">
                  <p className="mb-1 font-bold">المسح ممنوع: صفوف حقيقية مرتبطة بصفوف هذه الدفعة</p>
                  <ul className="list-inside list-disc space-y-0.5">
                    {(dry.blockers ?? []).map((b, i) => (
                      <li key={i}>
                        {b.rows} صف في <span className="font-mono" dir="ltr">{b.table}</span> يشير إلى{" "}
                        <span className="font-mono" dir="ltr">{b.references}</span> — {onDeleteAr((b as { on_delete?: string }).on_delete)}
                        {blockerHintAr(b.table) ? <span className="block text-amber-200">{blockerHintAr(b.table)}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {dry.would_purge ? (
                <div className="space-y-2 rounded-xl bg-white/[0.03] p-3">
                  <p className="text-[12px] text-zinc-300">
                    للتأكيد: اكتب معرّف الدفعة، ثم الرمز الظاهر الآن في تطبيق المصادقة. الحذف نهائي ويُسجَّل في سجل لا يُعدَّل.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value.trim())}
                      placeholder={dry.batch}
                      dir="ltr"
                      aria-label="معرّف الدفعة للتأكيد"
                      className="w-56 rounded-lg border border-white/10 bg-zinc-950 px-3 py-1.5 font-mono text-[13px] text-white"
                    />
                    <input
                      value={code}
                      onChange={(e) => setCode(toLatinDigits(e.target.value).replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="رمز من ٦ أرقام"
                      dir="ltr"
                      aria-label="رمز التحقق من تطبيق المصادقة"
                      className="w-40 rounded-lg border border-white/10 bg-zinc-950 px-3 py-1.5 font-mono text-[13px] text-white"
                    />
                    <button
                      type="button"
                      disabled={busy || confirmText !== dry.batch || code.length !== 6}
                      onClick={() => void purge()}
                      className="flex items-center gap-1 rounded-lg bg-red-500/20 px-3 py-1.5 text-[12px] font-bold text-red-200 disabled:opacity-40"
                    >
                      <Trash size={14} /> مسح دفعة الاختبار
                    </button>
                    <button type="button" disabled={busy} onClick={() => setDry(null)} className="px-3 py-1.5 text-[12px] text-zinc-400">
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-2xl border border-white/[0.06] bg-zinc-900/60 p-5">
            <h2 className="mb-1 text-[15px] font-bold text-white">حسابات الاختبار</h2>
            <p className="mb-3 text-[12px] text-zinc-400">
              نقل حساب إلى دفعة جديدة يجعل ما ينشئه بعد الآن في الدفعة الجديدة، ويبقى ما أنشأه قبلها في دفعته القديمة.
            </p>
            {accounts.length === 0 ? (
              <p className="text-[13px] text-zinc-400">لا توجد حسابات اختبار.</p>
            ) : (
              <ul className="space-y-2">
                {accounts.map((a) => (
                  <li key={a.user_id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-[12px]">
                    <span className="min-w-[12rem] text-zinc-200" dir="ltr">
                      {a.email ?? a.user_id}
                    </span>
                    <span className="font-mono text-zinc-400" dir="ltr">
                      {a.batch}
                    </span>
                    <input
                      value={moveTo[a.user_id] ?? ""}
                      onChange={(e) => setMoveTo((m) => ({ ...m, [a.user_id]: e.target.value.trim().toLowerCase() }))}
                      placeholder="qa-2026-11-20-a"
                      dir="ltr"
                      aria-label="الدفعة الجديدة"
                      className="w-44 rounded-lg border border-white/10 bg-zinc-950 px-2 py-1 font-mono text-[12px] text-white"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void move(a)}
                      className="rounded-lg border border-white/10 px-2 py-1 text-[12px] text-zinc-200 disabled:opacity-40"
                    >
                      نقل
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-zinc-900/60 p-5">
            <h2 className="mb-3 text-[15px] font-bold text-white">سجل المسح (لا يُعدَّل ولا يُحذف)</h2>
            {data.audit === null ? (
              <p className="text-[13px] text-red-300">تعذّرت قراءة السجل.</p>
            ) : data.audit.length === 0 ? (
              <p className="text-[13px] text-zinc-400">لم يُشغَّل مسح بعد.</p>
            ) : (
              <ul className="space-y-1 text-[12px] text-zinc-300">
                {data.audit.map((r) => (
                  <li key={r.id} className="flex flex-wrap gap-x-3 border-t border-white/[0.05] py-1">
                    <span className="text-zinc-500">{when(r.created_at)}</span>
                    <span>{KIND_AR[r.kind] ?? r.kind}</span>
                    <span className="font-mono" dir="ltr">{r.test_batch}</span>
                    <span>{STATUS_AR[r.status] ?? r.status}</span>
                    {r.kind !== "files" ? (
                      <span>
                        {Object.values(r.counts_before ?? {}).reduce((n, c) => n + (Number(c?.delete) || 0), 0)} صف ·{" "}
                        {r.files?.count ?? 0} ملف
                      </span>
                    ) : (
                      <span>
                        حُذف {r.files?.removed ?? 0} ملفاً{Array.isArray(r.files?.failed) && r.files.failed.length ? ` · تعذّر ${r.files.failed.length}` : ""}
                      </span>
                    )}
                    <span className="text-zinc-500" dir="ltr">
                      {r.actor_email ?? "—"} · {r.ip ?? "—"}
                    </span>
                    {r.error ? <span className="text-red-300">{r.error}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-zinc-900/60 p-5">
            <h2 className="mb-1 flex items-center gap-2 text-[15px] font-bold text-white">
              <EnvelopeSimple size={18} /> صندوق بريد الاختبار
            </h2>
            <p className="mb-3 text-[12px] text-zinc-400">
              رسائل لم تُرسل لأنها إلى حساب اختبار أو بسببه أو إلى نطاق اختبار. رموز التحقق لحسابات الاختبار تظهر هنا. آخر ٣٠ رسالة.
            </p>
            {data.mail === null ? (
              <p className="text-[13px] text-red-300">تعذّرت قراءة الصندوق.</p>
            ) : data.mail.length === 0 ? (
              <p className="text-[13px] text-zinc-400">لا رسائل.</p>
            ) : (
              <ul className="space-y-1 text-[12px] text-zinc-300">
                {data.mail.map((m) => (
                  <li key={m.id} className="border-t border-white/[0.05] py-1">
                    <button
                      type="button"
                      onClick={() => setOpenMail(openMail === m.id ? null : m.id)}
                      className="flex w-full flex-wrap gap-x-3 text-right"
                      aria-expanded={openMail === m.id}
                    >
                      <span className="text-zinc-500">{when(m.created_at)}</span>
                      <span className="text-white">{m.subject}</span>
                      <span dir="ltr">{m.to_masked}</span>
                      <span className="text-zinc-400">{REASON_AR[m.reason] ?? m.reason}</span>
                      {m.test_batch ? <span className="font-mono text-zinc-500" dir="ltr">{m.test_batch}</span> : null}
                    </button>
                    {openMail === m.id ? (
                      <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-zinc-950 p-2 text-[12px] leading-6 text-zinc-300">{m.body_text ?? ""}</pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
