"use client";

/**
 * FeeStatementView — «بيان أتعاب» (owner TODO F3/F4, l6-ledger): the billable,
 * live, not-yet-billed time entries and expenses of one case or one client for
 * a period, priced and totalled, with what was left out counted.
 *
 *   طباعة            a clean printable page (its own window, RTL, no app chrome).
 *   تحويل إلى فاتورة  one invoice for the total through the EXISTING invoice
 *                     call (POST /api/v1/lawyer/finance, unchanged), keyed by
 *                     the statement's lines so a retry never issues a second;
 *                     the lines are then stamped «مفوتر» and leave the statement.
 *
 * The label is the owner's (٤٣٠): a fee statement, not a ZATCA e-invoice.
 */

import { useEffect, useMemo, useState } from "react";
import { useRiyadhToday } from "@/hooks/useRiyadhToday";
import Link from "next/link";
import { FileText, Printer, Receipt, Warning } from "@phosphor-icons/react";
import { formatDuration, type FeeStatement } from "@/lib/financeLedger/financeLedgerRules";
import { convertStatementToInvoice, getFeeStatement, type FeeStatementRead } from "@/lib/services/financeLedgerService";
import { riyadhTodayIso, sar, themeCls, useFinancePickers } from "./financeLedgerUi";

const STATEMENT_LABEL = "بيان أتعاب — ليست فاتورة ضريبية إلكترونية";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The printable page: plain HTML in its own window, so no dashboard chrome prints. */
export function statementPrintHtml(read: FeeStatementRead): string {
  const s: FeeStatement = read.statement;
  const subject = read.subject.caseTitle ? `القضية: ${read.subject.caseTitle}` : "";
  const client = read.subject.clientName ? `الموكل: ${read.subject.clientName}` : "";
  const period = `الفترة: ${s.from ?? "من البداية"} — ${s.to ?? "حتى اليوم"}`;
  const timeRows = s.timeLines.map((l) => `<tr><td>${esc(l.date)}</td><td>${esc(l.description)}</td><td>${esc(formatDuration(l.durationMin ?? 0))}</td><td>${l.rateHalalas ? esc(sar(l.rateHalalas)) : "غير مسعّر"}</td><td>${esc(sar(l.amountHalalas))}</td></tr>`).join("");
  const expRows = s.expenseLines.map((l) => `<tr><td>${esc(l.date)}</td><td>${esc(l.description)}</td><td>${esc(l.categoryLabel ?? "")}</td><td>${esc(sar(l.amountHalalas))}</td></tr>`).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(STATEMENT_LABEL)}</title>
<style>
body{font-family:Tahoma,Arial,sans-serif;color:#111;margin:32px;font-size:13px}
h1{font-size:20px;margin:0 0 4px} .muted{color:#555} table{width:100%;border-collapse:collapse;margin:12px 0}
th,td{border:1px solid #ccc;padding:6px 8px;text-align:right} th{background:#f3f3f3}
.total{font-size:15px;font-weight:bold} @media print{button{display:none}}
</style></head><body>
<h1>${esc(STATEMENT_LABEL)}</h1>
<p class="muted">${esc([subject, client, period].filter(Boolean).join(" · "))}</p>
<p class="muted">تاريخ الإعداد: ${esc(riyadhTodayIso())}${read.scope === "own" ? " · يشمل قيود معدّ البيان فقط" : ""}</p>
${s.timeLines.length ? `<h3>الوقت</h3><table><thead><tr><th>التاريخ</th><th>الوصف</th><th>المدة</th><th>سعر الساعة</th><th>المبلغ</th></tr></thead><tbody>${timeRows}</tbody></table>
<p>إجمالي الوقت: ${esc(formatDuration(s.totalMinutes))} — ${esc(sar(s.timeTotalHalalas))}</p>` : ""}
${s.expenseLines.length ? `<h3>المصروفات</h3><table><thead><tr><th>التاريخ</th><th>الوصف</th><th>التصنيف</th><th>المبلغ</th></tr></thead><tbody>${expRows}</tbody></table>
<p>إجمالي المصروفات: ${esc(sar(s.expenseTotalHalalas))}</p>` : ""}
<p class="total">الإجمالي: ${esc(sar(s.totalHalalas))}</p>
<button onclick="window.print()">طباعة</button>
</body></html>`;
}

export default function FeeStatementView({
  isDark, initialCaseId, initialClientId, invoicesHref,
}: { isDark: boolean; initialCaseId?: string; initialClientId?: string; invoicesHref: string }) {
  const t = themeCls(isDark);
  const pickers = useFinancePickers(true);
  const [mode, setMode] = useState<"case" | "client">(initialClientId && !initialCaseId ? "client" : "case");
  const [caseId, setCaseId] = useState(initialCaseId ?? "");
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [from, setFrom] = useState("");
  const today = useRiyadhToday();
  const [to, setTo] = useState("");
  const [read, setRead] = useState<FeeStatementRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjectId = mode === "case" ? caseId : clientId;
  const build = async (toOverride?: string) => {
    if (!subjectId) { setError(mode === "case" ? "اختر القضية." : "اختر الموكل."); return; }
    setLoading(true); setError(null); setDone(null); setConfirming(false);
    try {
      setRead(await getFeeStatement({
        caseId: mode === "case" ? caseId : undefined,
        clientId: mode === "client" ? clientId : undefined,
        from: from || undefined,
        to: (toOverride ?? to) || undefined,
      }));
    } catch (err) {
      setRead(null);
      setError(err instanceof Error ? err.message : "تعذّر إعداد البيان.");
    } finally {
      setLoading(false);
    }
  };
  // «إلى» defaults to the browser's Riyadh day (never an SSR-cached one); a
  // link from a case page or a client then opens the statement at once.
  const [autoBuilt, setAutoBuilt] = useState(false);
  useEffect(() => {
    if (!today || autoBuilt) return;
    setAutoBuilt(true);
    if (!to) setTo(today);
    if (initialCaseId || initialClientId) void build(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const [confirming, setConfirming] = useState(false);
  const [converting, setConverting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const convert = async () => {
    if (!read) return;
    setConverting(true); setError(null);
    try {
      const r = await convertStatementToInvoice(read);
      setDone(r.stamped === r.requested
        ? "صدرت الفاتورة ورُبطت بها قيود البيان كلها."
        : `صدرت الفاتورة، ورُبط بها ${r.stamped} من ${r.requested} قيداً — الباقي تغيّر أو أُلغي في الأثناء، فراجعه.`);
      setConfirming(false);
      await build();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر التحويل إلى فاتورة.");
    } finally {
      setConverting(false);
    }
  };

  const print = () => {
    if (!read) return;
    const w = window.open("", "_blank");
    if (!w) { setError("منع المتصفح فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة لهذا الموقع."); return; }
    w.opener = null;
    w.document.open();
    w.document.write(statementPrintHtml(read));
    w.document.close();
    w.focus();
    w.print();
  };

  const s = read?.statement ?? null;
  const empty = useMemo(() => !!s && s.timeLines.length + s.expenseLines.length === 0, [s]);

  return (
    <div className="space-y-4" dir="rtl">
      <section className={`${t.card} p-4 sm:p-5`}>
        <h2 className={`flex items-center gap-2 text-base font-bold ${t.title}`}><FileText size={18} className="text-[#C8A762]" /> بيان أتعاب</h2>
        <p className={`mt-1 text-[12px] ${t.muted}`}>من قيود الوقت والمصروفات القابلة للفوترة وغير المفوترة لقضية أو موكل في فترة.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className={t.label}>البيان لـ</label>
            <select className={t.input} value={mode} onChange={(e) => setMode(e.target.value as "case" | "client")}>
              <option value="case">قضية</option>
              <option value="client">موكل</option>
            </select>
          </div>
          <div>
            <label className={t.label}>{mode === "case" ? "القضية" : "الموكل"}</label>
            {mode === "case" ? (
              <select className={t.input} value={caseId} onChange={(e) => setCaseId(e.target.value)}>
                <option value="">{pickers.cases === null ? "جارٍ التحميل…" : "اختر القضية"}</option>
                {(pickers.cases ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            ) : (
              <select className={t.input} value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">{pickers.clients === null ? "جارٍ التحميل…" : "اختر الموكل"}</option>
                {(pickers.clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className={t.label}>من</label>
            <input type="date" className={t.input} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className={t.label}>إلى</label>
            <input type="date" className={t.input} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <button type="button" className={t.primary} onClick={() => void build()} disabled={loading}>{loading ? "جارٍ الإعداد…" : "إعداد البيان"}</button>
        </div>
        {pickers.error && <p className={`mt-3 ${t.warn}`}>{pickers.error}</p>}
        {error && <p className={`mt-3 ${t.error}`}>{error}</p>}
        {done && (
          <p className={`mt-3 rounded-xl px-3 py-2 text-[12px] ${isDark ? "bg-emerald-500/10 text-emerald-300" : "bg-emerald-50 text-emerald-800"}`}>
            {done} <Link href={invoicesHref} className="font-bold underline">عرض بيانات الأتعاب المصدرة</Link>
          </p>
        )}
      </section>

      {read && s && (
        <section className={`${t.card} p-4 sm:p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className={`text-sm font-bold ${t.title}`}>{STATEMENT_LABEL}</h3>
              <p className={`text-[12px] ${t.muted}`}>
                {[read.subject.caseTitle && `القضية: ${read.subject.caseTitle}`, read.subject.clientName && `الموكل: ${read.subject.clientName}`]
                  .filter(Boolean).join(" · ")}
                {" · "}{s.from ?? "من البداية"} — {s.to ?? "حتى اليوم"}
              </p>
              <p className={`text-[11px] ${t.muted}`}>
                {read.scope === "own" ? "يشمل قيودك أنت فقط." : "يشمل قيود المكتب التي تملك الاطلاع عليها."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={t.ghost} onClick={print} disabled={empty}><Printer size={14} /> طباعة</button>
              <button type="button" className={t.primary} onClick={() => setConfirming(true)} disabled={empty || s.totalHalalas <= 0 || converting}>
                <Receipt size={14} /> تحويل إلى فاتورة
              </button>
            </div>
          </div>

          {read.truncated && <p className={`mt-3 ${t.warn}`}>القيود كثيرة وقُطع بعضها — ضيّق الفترة قبل الطباعة أو التحويل.</p>}
          {s.unpricedTimeCount > 0 && (
            <p className={`mt-3 ${t.warn}`}><Warning size={13} className="inline" /> {s.unpricedTimeCount} من قيود الوقت بلا سعر ساعة (مبلغها صفر) — سعّرها أو ألغها قبل التحويل.</p>
          )}

          {empty ? (
            <p className={`mt-4 text-[12px] ${t.muted}`}>لا قيود قابلة للفوترة وغير مفوترة في هذه الفترة.</p>
          ) : (
            <>
              {s.timeLines.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <p className={`mb-1 text-[12px] font-bold ${t.text}`}>الوقت</p>
                  <table className="w-full text-[12px]">
                    <thead><tr className={t.muted}><th className="py-1 text-start">التاريخ</th><th className="text-start">الوصف</th><th className="text-start">المدة</th><th className="text-start">السعر</th><th className="text-start">المبلغ</th></tr></thead>
                    <tbody>
                      {s.timeLines.map((l) => (
                        <tr key={l.id} className={`${t.row} ${t.text}`}>
                          <td className="py-1.5">{l.date}</td><td>{l.description}</td><td>{formatDuration(l.durationMin ?? 0)}</td>
                          <td>{l.rateHalalas ? sar(l.rateHalalas) : "غير مسعّر"}</td><td className="font-bold">{sar(l.amountHalalas)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className={`mt-1 text-[12px] ${t.text}`}>إجمالي الوقت: {formatDuration(s.totalMinutes)} — {sar(s.timeTotalHalalas)}</p>
                </div>
              )}
              {s.expenseLines.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <p className={`mb-1 text-[12px] font-bold ${t.text}`}>المصروفات</p>
                  <table className="w-full text-[12px]">
                    <thead><tr className={t.muted}><th className="py-1 text-start">التاريخ</th><th className="text-start">الوصف</th><th className="text-start">التصنيف</th><th className="text-start">المبلغ</th></tr></thead>
                    <tbody>
                      {s.expenseLines.map((l) => (
                        <tr key={l.id} className={`${t.row} ${t.text}`}>
                          <td className="py-1.5">{l.date}</td><td>{l.description}</td><td>{l.categoryLabel}</td><td className="font-bold">{sar(l.amountHalalas)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className={`mt-1 text-[12px] ${t.text}`}>إجمالي المصروفات: {sar(s.expenseTotalHalalas)}</p>
                </div>
              )}
              <p className={`mt-4 text-base font-black ${t.title}`}>الإجمالي: {sar(s.totalHalalas)}</p>
            </>
          )}
          {(s.excluded.voided + s.excluded.notBillable + s.excluded.alreadyBilled) > 0 && (
            <p className={`mt-2 text-[11px] ${t.muted}`}>
              خارج البيان: {s.excluded.alreadyBilled} مفوتر سابقاً · {s.excluded.notBillable} غير قابل للفوترة · {s.excluded.voided} ملغى.
            </p>
          )}

          {confirming && (
            <div className={`mt-4 ${t.warn}`}>
              <p className="font-bold">إصدار بيان أتعاب (فاتورة) بمبلغ {sar(s.totalHalalas)} {read.subject.clientName ? `للموكل ${read.subject.clientName}` : ""}؟</p>
              {!read.invoiceClientId && <p className="mt-1">لا موكل مرتبط بهذه القضية — اربطها ببطاقة موكل أولاً.</p>}
              <p className="mt-1">بعد الإصدار تُعلَّم قيود البيان «مفوتر» ولا تعود تظهر فيه. إعادة الضغط بعد انقطاع لا تُصدر فاتورة ثانية.</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className={t.primary} onClick={() => void convert()} disabled={converting || !read.invoiceClientId}>
                  {converting ? "جارٍ الإصدار…" : "تأكيد الإصدار"}
                </button>
                <button type="button" className={t.ghost} onClick={() => setConfirming(false)} disabled={converting}>تراجع</button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
