"use client";

/**
 * /dashboard/admin/journal — «المجلة التشريعية» for the admins (owner
 * Q190–Q195, batch l13).
 *
 *   الأخبار  — manual entry (Q195), edit, approve / return to draft, delete.
 *              «محامي المنصة» (Q194) is not named yet: the admins approve.
 *   الأعداد  — build the month's issue from the approved entries (the cron
 *              does it on the 1st), preview it, approve it, send it by e-mail
 *              in batches to the accounts with «النشرة» on.
 *
 * Says plainly what is not ready: the journal switch (مفاتيح الميزات), e-mail
 * on the server, and the PDF component (CHROMIUM_PATH) — without it the
 * e-mail carries the issue page link instead of a PDF.
 * Plain design: the owner's design file has not arrived (Q196).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Newspaper, WarningCircle, CheckCircle } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  ENTRY_LIMITS,
  ISSUE_STATUS_AR,
  JOURNAL_BADGES,
  dateAr,
  periodLabelAr,
  type JournalBadge,
  type JournalIssueStatus,
} from "@/lib/journal/journal";

interface EntryRow {
  id: string;
  title: string;
  published_on: string;
  issuing_body: string | null;
  source_url: string | null;
  impact_lines: string[] | null;
  badge: JournalBadge | null;
  effective_on: string | null;
  status: "draft" | "approved";
  issue_id: string | null;
}

interface IssueRow {
  id: string;
  period_month: string;
  title: string;
  status: JournalIssueStatus;
  entries: number;
  sends: { sent: number; sunk: number; failed: number; sending: number };
  paths: { page: string; pdf: string };
}

interface Status {
  enabled: boolean;
  emailReady: boolean;
  pdfReady: boolean;
  optedIn: number | null;
  nextPeriod: string;
}

const EMPTY_FORM = {
  title: "",
  published_on: "",
  issuing_body: "",
  source_url: "",
  impact_lines: "",
  badge: "" as "" | JournalBadge,
  effective_on: "",
};

type Notice = { ok: boolean; text: string } | null;

async function call(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null }> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: { error: "تعذّر الاتصال — تحقّق من الشبكة وحاول مجدداً." } };
  }
}

const errText = (r: { body: Record<string, unknown> | null }, fallback: string) =>
  typeof r.body?.error === "string" ? (r.body.error as string) : fallback;

export default function AdminJournalPage() {
  const { isDark } = useTheme();
  const [entries, setEntries] = useState<EntryRow[] | null>(null);
  const [issues, setIssues] = useState<IssueRow[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [month, setMonth] = useState("");

  const issueStatusById = useMemo(() => new Map((issues ?? []).map((i) => [i.id, i.status])), [issues]);

  const load = useCallback(async () => {
    setLoadError(null);
    const [e, i] = await Promise.all([call("/api/v1/admin/journal/entries"), call("/api/v1/admin/journal/issues")]);
    if (i.body?.status) setStatus(i.body.status as Status);
    if (!e.ok || !i.ok) {
      setLoadError(errText(e.ok ? i : e, "تعذّر تحميل المجلة الآن — حاول بعد قليل."));
      return;
    }
    setEntries((e.body?.data as EntryRow[]) ?? []);
    setIssues((i.body?.data as IssueRow[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (status && !month) setMonth(status.nextPeriod.slice(0, 7));
  }, [status, month]);

  function startEdit(row: EntryRow) {
    setEditing(row.id);
    setForm({
      title: row.title,
      published_on: row.published_on,
      issuing_body: row.issuing_body ?? "",
      source_url: row.source_url ?? "",
      impact_lines: (row.impact_lines ?? []).join("\n"),
      badge: row.badge ?? "",
      effective_on: row.effective_on ?? "",
    });
    setNotice(null);
  }

  function resetForm() {
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  async function saveEntry(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const payload = { ...form, badge: form.badge || null, effective_on: form.effective_on || null };
    const r = editing
      ? await call(`/api/v1/admin/journal/entries/${editing}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await call("/api/v1/admin/journal/entries", { method: "POST", body: JSON.stringify(payload) });
    setBusy(false);
    if (!r.ok) {
      setNotice({ ok: false, text: errText(r, "لم يُحفظ الخبر — حاول مجدداً.") });
      return;
    }
    setNotice({
      ok: true,
      text: editing ? "حُفظ التعديل. إن كان الخبر معتمداً فقد عاد مسودة ويحتاج اعتماداً جديداً." : "أُضيف الخبر مسودةً. اعتمده ليظهر في المجلة.",
    });
    resetForm();
    await load();
  }

  async function entryAction(id: string, action: "approve" | "unapprove" | "delete") {
    if (busy) return;
    if (action === "delete" && !window.confirm("حذف هذا الخبر نهائياً؟")) return;
    setBusy(true);
    setNotice(null);
    const r =
      action === "delete"
        ? await call(`/api/v1/admin/journal/entries/${id}`, { method: "DELETE" })
        : await call(`/api/v1/admin/journal/entries/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
    setBusy(false);
    if (!r.ok) {
      setNotice({ ok: false, text: errText(r, "لم يتم الإجراء — حاول مجدداً.") });
      return;
    }
    setNotice({ ok: true, text: action === "approve" ? "اعتُمد الخبر." : action === "unapprove" ? "عاد الخبر مسودة." : "حُذف الخبر." });
    await load();
  }

  async function buildIssue(forMonth: string = month) {
    if (busy || !forMonth) return;
    setBusy(true);
    setNotice(null);
    const r = await call("/api/v1/admin/journal/issues", { method: "POST", body: JSON.stringify({ month: forMonth }) });
    setBusy(false);
    if (!r.ok) {
      setNotice({ ok: false, text: errText(r, "لم يُبنَ العدد — حاول مجدداً.") });
      return;
    }
    const d = r.body?.data as { entries?: number; rebuilt?: boolean } | undefined;
    setNotice({ ok: true, text: `${d?.rebuilt ? "أُعيد بناء" : "بُني"} العدد وفيه ${d?.entries ?? 0} من الأخبار. راجعه ثم اعتمده.` });
    await load();
  }

  async function issueAction(id: string, action: "approve" | "unapprove" | "send") {
    if (busy) return;
    if (action === "send" && !window.confirm("إرسال دفعة من رسائل العدد إلى المشتركين في النشرة الآن؟")) return;
    setBusy(true);
    setNotice(null);
    const r = await call(`/api/v1/admin/journal/issues/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
    setBusy(false);
    if (!r.ok) {
      setNotice({ ok: false, text: errText(r, "لم يتم الإجراء — حاول مجدداً.") });
      await load();
      return;
    }
    if (action === "send") {
      const d = r.body?.data as { sent?: number; sunk?: number; failed?: number; skippedAccounts?: number; done?: boolean } | undefined;
      setNotice({
        ok: true,
        text: d?.done
          ? "اكتمل إرسال العدد."
          : `أُرسلت دفعة: ${d?.sent ?? 0} رسالة، تعذّر ${d?.failed ?? 0}، وتُرك ${d?.skippedAccounts ?? 0} حساباً بلا بريد صالح أو موقوفاً. اضغط «إرسال» مجدداً للدفعة التالية حتى يكتمل.`,
      });
    } else {
      setNotice({ ok: true, text: action === "approve" ? "اعتُمد العدد. يمكنك الآن إرساله." : "عاد العدد مسودة." });
    }
    await load();
  }

  const card = `rounded-2xl border ${isDark ? "bg-[#0d1117] border-white/10" : "bg-white border-slate-200 shadow-sm"}`;
  const muted = isDark ? "text-slate-400" : "text-slate-600";
  const strong = isDark ? "text-white" : "text-slate-900";
  const input = `w-full rounded-xl border px-3 py-2 text-sm ${isDark ? "bg-black/30 border-white/10 text-white" : "bg-white border-slate-300 text-slate-900"}`;
  const btn = "px-3 py-1.5 rounded-xl text-sm font-bold disabled:opacity-50";
  const btnMain = `${btn} bg-[#0B3D2E] text-white`;
  const btnSoft = `${btn} border ${isDark ? "border-white/15 text-slate-200" : "border-slate-300 text-slate-700"}`;

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-[1200px] mx-auto pb-32" dir="rtl">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Newspaper size={26} weight="duotone" className={isDark ? "text-emerald-300" : "text-emerald-700"} />
          <h1 className={`text-3xl font-black ${strong}`}>المجلة التشريعية</h1>
        </div>
        <p className={`text-sm ${muted}`}>
          أدخل الأخبار التشريعية واعتمدها، ثم ابنِ العدد الشهري واعتمده قبل إرساله بالبريد لمن فعّل «النشرة الإخبارية» في إعداداته.
        </p>
      </div>

      {status && (
        <section className={`${card} p-5 space-y-2 text-sm`} aria-label="حالة المجلة">
          <StatusLine ok={status.enabled} isDark={isDark}>
            {status.enabled ? (
              "المجلة مفعّلة: الصفحة العامة ظاهرة والإرسال متاح."
            ) : (
              <>
                المجلة مطفأة: الصفحة العامة تعرض «قيد التفعيل» ولا يُرسل أي عدد. تُفعَّل من{" "}
                <Link href="/dashboard/admin/features" className="underline font-bold">مفاتيح الميزات</Link>. إدخال الأخبار واعتمادها متاح الآن.
              </>
            )}
          </StatusLine>
          <StatusLine ok={status.emailReady} isDark={isDark}>
            {status.emailReady ? "البريد الإلكتروني مُعدّ على الخادم." : "البريد الإلكتروني غير مُعدّ على الخادم، فلا يمكن الإرسال."}
          </StatusLine>
          <StatusLine ok={status.pdfReady} isDark={isDark}>
            {status.pdfReady
              ? "ملف PDF للعدد يُولَّد على الخادم."
              : "مكوّن توليد ملف PDF غير مثبّت على الخادم: ترسل الرسالة رابط صفحة العدد، ويستطيع القارئ حفظها PDF من متصفحه."}
          </StatusLine>
          <p className={muted}>
            الحسابات المشتركة في النشرة الآن: {status.optedIn === null ? "تعذّر العدّ" : status.optedIn}
          </p>
        </section>
      )}

      {notice && (
        <div
          role="status"
          className={`flex items-start gap-2 text-sm p-4 rounded-2xl border ${
            notice.ok
              ? isDark ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100" : "border-emerald-200 bg-emerald-50 text-emerald-900"
              : isDark ? "border-red-500/20 bg-red-500/10 text-red-100" : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          <WarningCircle size={18} weight="fill" className="mt-0.5 flex-shrink-0" />
          <span>{notice.text}</span>
        </div>
      )}

      {loadError && (
        <div className={`${card} p-5 flex flex-wrap items-center justify-between gap-3`}>
          <p role="alert" className={`text-sm ${isDark ? "text-red-200" : "text-red-700"}`}>{loadError}</p>
          <button type="button" onClick={() => void load()} className={btnMain}>إعادة المحاولة</button>
        </div>
      )}

      {/* ── entry form ── */}
      <section className={`${card} p-5 space-y-4`} aria-label={editing ? "تعديل خبر" : "خبر جديد"}>
        <h2 className={`text-lg font-black ${strong}`}>{editing ? "تعديل خبر" : "خبر جديد"}</h2>
        <form onSubmit={(e) => void saveEntry(e)} className="grid gap-4 md:grid-cols-2">
          <label className="md:col-span-2 space-y-1">
            <span className={`text-sm font-bold ${strong}`}>العنوان</span>
            <input className={input} required maxLength={ENTRY_LIMITS.titleMax} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span className={`text-sm font-bold ${strong}`}>تاريخ الخبر</span>
            <input type="date" className={input} required value={form.published_on} onChange={(e) => setForm({ ...form, published_on: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span className={`text-sm font-bold ${strong}`}>الجهة المصدرة</span>
            <input className={input} maxLength={ENTRY_LIMITS.issuingBodyMax} value={form.issuing_body} onChange={(e) => setForm({ ...form, issuing_body: e.target.value })} />
          </label>
          <label className="md:col-span-2 space-y-1">
            <span className={`text-sm font-bold ${strong}`}>رابط المصدر</span>
            <input type="url" dir="ltr" className={input} maxLength={ENTRY_LIMITS.urlMax} placeholder="https://" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} />
          </label>
          <label className="md:col-span-2 space-y-1">
            <span className={`text-sm font-bold ${strong}`}>سطور الأثر (سطر لكل أثر، {ENTRY_LIMITS.impactLinesMax} على الأكثر)</span>
            <textarea className={`${input} min-h-[96px]`} value={form.impact_lines} onChange={(e) => setForm({ ...form, impact_lines: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span className={`text-sm font-bold ${strong}`}>الشارة</span>
            <select className={input} value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value as "" | JournalBadge })}>
              <option value="">بلا شارة</option>
              {(Object.keys(JOURNAL_BADGES) as JournalBadge[]).map((b) => (
                <option key={b} value={b}>{JOURNAL_BADGES[b]}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className={`text-sm font-bold ${strong}`}>تاريخ النفاذ</span>
            <input type="date" className={input} value={form.effective_on} onChange={(e) => setForm({ ...form, effective_on: e.target.value })} />
          </label>
          <p className={`md:col-span-2 text-xs ${muted}`}>
            الزائر يرى العنوان والتاريخ فقط؛ ويرى المشترك في المكتبة الشارة وتاريخ النفاذ والأثر والجهة والرابط.
          </p>
          <div className="md:col-span-2 flex gap-3">
            <button type="submit" disabled={busy} className={btnMain}>{editing ? "حفظ التعديل" : "إضافة الخبر"}</button>
            {editing && (
              <button type="button" onClick={resetForm} className={btnSoft}>إلغاء</button>
            )}
          </div>
        </form>
      </section>

      {/* ── entries ── */}
      <section className="space-y-3" aria-label="الأخبار">
        <h2 className={`text-lg font-black ${strong}`}>الأخبار</h2>
        {entries === null && !loadError && <p className={`text-sm ${muted}`}>جارٍ التحميل…</p>}
        {entries && entries.length === 0 && <p className={`text-sm ${muted}`}>لا توجد أخبار بعد.</p>}
        {entries?.map((row) => {
          const inIssue = row.issue_id ? issueStatusById.get(row.issue_id) ?? "draft" : null;
          const locked = !!inIssue && inIssue !== "draft";
          return (
            <article key={row.id} className={`${card} p-4 space-y-2`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className={`font-bold ${strong}`}>{row.title}</h3>
                  <p className={`text-xs ${muted}`}>
                    {dateAr(row.published_on)}
                    {row.badge ? ` · ${JOURNAL_BADGES[row.badge]}` : ""}
                    {row.effective_on ? ` · النفاذ: ${dateAr(row.effective_on)}` : ""}
                  </p>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${row.status === "approved" ? "border-emerald-500/40 text-emerald-500" : isDark ? "border-white/15 text-slate-300" : "border-slate-300 text-slate-600"}`}>
                  {row.status === "approved" ? "معتمد" : "مسودة"}
                  {inIssue ? (locked ? " · في عدد معتمد" : " · في عدد قيد المراجعة") : ""}
                </span>
              </div>
              {locked ? (
                <p className={`text-xs ${muted}`}>الخبر داخل عدد معتمد أو مُرسل، فلا يُعدّل.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => startEdit(row)} className={btnSoft}>تعديل</button>
                  {row.status === "draft" ? (
                    <button type="button" disabled={busy} onClick={() => void entryAction(row.id, "approve")} className={btnMain}>اعتماد</button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => void entryAction(row.id, "unapprove")} className={btnSoft}>إعادة إلى مسودة</button>
                  )}
                  <button type="button" disabled={busy} onClick={() => void entryAction(row.id, "delete")} className={btnSoft}>حذف</button>
                </div>
              )}
            </article>
          );
        })}
      </section>

      {/* ── issues ── */}
      <section className="space-y-3" aria-label="الأعداد الشهرية">
        <h2 className={`text-lg font-black ${strong}`}>الأعداد الشهرية</h2>
        <div className={`${card} p-4 flex flex-wrap items-end gap-3`}>
          <label className="space-y-1">
            <span className={`text-sm font-bold ${strong}`}>الشهر</span>
            <input type="month" className={input} value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <button type="button" disabled={busy || !month} onClick={() => void buildIssue(month)} className={btnMain}>بناء العدد من الأخبار المعتمدة</button>
          <p className={`text-xs ${muted} basis-full`}>
            يُبنى العدد تلقائياً أول كل شهر ميلادي عن الشهر السابق، ويبقى بانتظار اعتمادك قبل الإرسال. إعادة البناء متاحة ما دام العدد لم يُعتمد.
          </p>
        </div>
        {issues && issues.length === 0 && <p className={`text-sm ${muted}`}>لم يُبنَ أي عدد بعد.</p>}
        {issues?.map((iss) => (
          <article key={iss.id} className={`${card} p-4 space-y-2`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className={`font-bold ${strong}`}>{iss.title}</h3>
                <p className={`text-xs ${muted}`}>
                  {periodLabelAr(iss.period_month)} · {iss.entries} خبر · {ISSUE_STATUS_AR[iss.status]}
                  {iss.status === "sending" || iss.status === "sent"
                    ? ` · أُرسل ${iss.sends.sent}، تعذّر ${iss.sends.failed}${iss.sends.sunk ? `، حسابات اختبار ${iss.sends.sunk}` : ""}`
                    : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={iss.paths.page} target="_blank" rel="noopener noreferrer" className={btnSoft}>معاينة العدد</a>
              {status?.pdfReady && (
                <a href={iss.paths.pdf} target="_blank" rel="noopener noreferrer" className={btnSoft}>PDF</a>
              )}
              {iss.status === "draft" && (
                <>
                  <button type="button" disabled={busy} onClick={() => void buildIssue(iss.period_month.slice(0, 7))} className={btnSoft}>إعادة البناء</button>
                  <button type="button" disabled={busy || iss.entries === 0} onClick={() => void issueAction(iss.id, "approve")} className={btnMain}>اعتماد العدد</button>
                </>
              )}
              {iss.status === "approved" && (
                <button type="button" disabled={busy} onClick={() => void issueAction(iss.id, "unapprove")} className={btnSoft}>إعادة إلى مسودة</button>
              )}
              {(iss.status === "approved" || iss.status === "sending") && (
                <button
                  type="button"
                  disabled={busy || !status?.enabled || !status?.emailReady}
                  onClick={() => void issueAction(iss.id, "send")}
                  className={btnMain}
                  title={!status?.enabled ? "المجلة مطفأة" : !status?.emailReady ? "البريد غير مُعدّ" : undefined}
                >
                  {iss.status === "sending" ? "إرسال الدفعة التالية" : "إرسال"}
                </button>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function StatusLine({ ok, isDark, children }: { ok: boolean; isDark: boolean; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2">
      {ok ? (
        <CheckCircle size={18} weight="fill" className="text-emerald-500 mt-0.5 flex-shrink-0" />
      ) : (
        <WarningCircle size={18} weight="fill" className={`${isDark ? "text-amber-300" : "text-amber-600"} mt-0.5 flex-shrink-0`} />
      )}
      <span className={isDark ? "text-slate-200" : "text-slate-800"}>{children}</span>
    </p>
  );
}
