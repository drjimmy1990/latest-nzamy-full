"use client";

/**
 * TimeEntriesPanel — «الوقت» (owner TODO F3/F4, l6-ledger). Time worked on a
 * case and/or a client card: date, duration, description, hourly rate,
 * billable. A line can be made from a session of the existing pomodoro timer
 * (/dashboard/lawyer/tasks → work_sessions): its date, minutes and label fill
 * the form and the session is linked, so it is never logged twice.
 *
 * No delete: «إلغاء» with a reason (the row stays, marked ملغى). Rows are what
 * RLS returns: the caller's own, plus the firm's for the owner / partners /
 * finance manager.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRiyadhToday } from "@/hooks/useRiyadhToday";
import { Clock, Plus, Timer, ArrowClockwise } from "@phosphor-icons/react";
import { formatDuration, sarToHalalas, timeAmountHalalas, type TimeDto } from "@/lib/financeLedger/financeLedgerRules";
import {
  createTimeEntry, listRecentFocusSessions, listTimeEntries, patchTimeEntry, type RecentSession,
} from "@/lib/services/financeLedgerService";
import { TargetFields, VoidBox, sar, themeCls, useFinancePickers } from "./financeLedgerUi";
import { latinAmountInput, latinDigitsOnly } from "@/lib/forms/latinDigits";

export default function TimeEntriesPanel({ isDark, caseId, compact = false }: { isDark: boolean; caseId?: string; compact?: boolean }) {
  const t = themeCls(isDark);
  const [rows, setRows] = useState<TimeDto[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showVoided, setShowVoided] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const pickers = useFinancePickers(formOpen);

  const load = useCallback(() => {
    setLoadError(null);
    listTimeEntries({ caseId, voided: showVoided })
      .then((r) => { setRows(r.data); setTruncated(r.truncated); })
      .catch((e: Error) => { setRows(null); setLoadError(e.message || "تعذّر تحميل سجل الوقت."); });
  }, [caseId, showVoided]);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const live = (rows ?? []).filter((r) => !r.voided);
    return {
      minutes: live.reduce((s, r) => s + r.durationMin, 0),
      billableOpen: live.filter((r) => r.billable && !r.billed).reduce((s, r) => s + r.amountHalalas, 0),
      billed: live.filter((r) => r.billed).reduce((s, r) => s + r.amountHalalas, 0),
    };
  }, [rows]);

  // ── form ──
  const [fCase, setFCase] = useState(caseId ?? "");
  const [fClient, setFClient] = useState("");
  // The browser's Riyadh day, never one computed during SSR (the cached-date trap).
  const today = useRiyadhToday();
  const [fDate, setFDate] = useState("");
  useEffect(() => { if (today && !fDate) setFDate(today); }, [today, fDate]);
  const [fHours, setFHours] = useState("");
  const [fMinutes, setFMinutes] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fRate, setFRate] = useState("");
  const [fBillable, setFBillable] = useState(true);
  const [fSession, setFSession] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<RecentSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const durationMin = (Number(fHours || 0) * 60) + Number(fMinutes || 0);
  const rateHalalas = fRate.trim() ? sarToHalalas(fRate) : 0;

  const resetForm = () => {
    setFDesc(""); setFHours(""); setFMinutes(""); setFSession(null); setFormError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > 1440) { setFormError("أدخل مدة بين دقيقة و٢٤ ساعة."); return; }
    if (rateHalalas === null) { setFormError("سعر الساعة غير صالح (رقم بخانتين عشريتين على الأكثر)."); return; }
    if (!fCase && !fClient) { setFormError("اختر القضية أو الموكل."); return; }
    setSaving(true);
    try {
      const row = await createTimeEntry({
        caseRequestId: fCase || null,
        lawyerClientId: fClient || null,
        workDate: fDate,
        durationMin,
        description: fDesc,
        hourlyRateHalalas: rateHalalas,
        billable: fBillable,
        workSessionId: fSession,
      });
      setRows((prev) => [row, ...(prev ?? [])]);
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "تعذّر حفظ قيد الوقت.");
    } finally {
      setSaving(false);
    }
  };

  const loadSessions = () => {
    setSessionsError(null);
    listRecentFocusSessions()
      .then((s) => {
        const used = new Set((rows ?? []).filter((r) => !r.voided && r.workSessionId).map((r) => r.workSessionId));
        setSessions(s.filter((x) => !used.has(x.id)));
      })
      .catch(() => setSessionsError("تعذّر تحميل جلسات المؤقت."));
  };
  const pickSession = (s: RecentSession) => {
    setFSession(s.id);
    setFDate(new Date(Date.parse(s.startedAt) + 3 * 3_600_000).toISOString().slice(0, 10));
    setFHours(String(Math.floor(s.durationMin / 60)));
    setFMinutes(String(s.durationMin % 60));
    if (!fDesc.trim() && s.label) setFDesc(s.label);
    setSessions(null);
  };

  // ── void ──
  const [voidId, setVoidId] = useState<string | null>(null);
  const [voidBusy, setVoidBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const doVoid = async (id: string, reason: string) => {
    setVoidBusy(true); setRowError(null);
    try {
      const row = await patchTimeEntry(id, { void: true, reason });
      setRows((prev) => (showVoided ? (prev ?? []).map((r) => (r.id === id ? row : r)) : (prev ?? []).filter((r) => r.id !== id)));
      setVoidId(null);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "تعذّر إلغاء القيد.");
    } finally {
      setVoidBusy(false);
    }
  };

  return (
    <section className={`${t.card} p-4 sm:p-5`} dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={`flex items-center gap-2 text-sm font-bold ${t.title}`}>
          <Clock size={16} className="text-[#C8A762]" /> سجل الوقت
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`flex items-center gap-1 text-[11px] ${t.muted}`}>
            <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} /> إظهار الملغاة
          </label>
          <button type="button" className={t.ghost} onClick={load}><ArrowClockwise size={13} /> تحديث</button>
          <button type="button" className={t.primary} onClick={() => setFormOpen((v) => !v)}><Plus size={14} /> قيد وقت</button>
        </div>
      </div>

      {rows && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div><p className={`text-[10px] ${t.muted}`}>إجمالي الوقت</p><p className={`text-sm font-bold ${t.title}`}>{formatDuration(totals.minutes)}</p></div>
          <div><p className={`text-[10px] ${t.muted}`}>قابل للفوترة ولم يُفوتر</p><p className={`text-sm font-bold ${t.title}`}>{sar(totals.billableOpen)}</p></div>
          <div><p className={`text-[10px] ${t.muted}`}>مفوتر</p><p className={`text-sm font-bold ${t.title}`}>{sar(totals.billed)}</p></div>
        </div>
      )}

      {formOpen && (
        <form onSubmit={submit} className={`mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-xl p-3 ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
          <TargetFields isDark={isDark} pickers={pickers} caseId={fCase} clientId={fClient} onCase={setFCase} onClient={setFClient} fixedCase={!!caseId} />
          <div>
            <label className={t.label}>تاريخ العمل</label>
            <input type="date" className={t.input} value={fDate} max={today || undefined} onChange={(e) => setFDate(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={t.label}>ساعات</label>
              <input inputMode="numeric" dir="ltr" className={t.input} value={fHours} onChange={(e) => setFHours(latinDigitsOnly(e.target.value))} placeholder="0" />
            </div>
            <div>
              <label className={t.label}>دقائق</label>
              <input inputMode="numeric" dir="ltr" className={t.input} value={fMinutes} onChange={(e) => setFMinutes(latinDigitsOnly(e.target.value))} placeholder="0" />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={t.label}>الوصف</label>
            <input className={t.input} value={fDesc} maxLength={1000} onChange={(e) => setFDesc(e.target.value)} placeholder="مثال: إعداد مذكرة الرد" required />
          </div>
          <div>
            <label className={t.label}>سعر الساعة (ر.س) — اتركه فارغاً إن لم يُسعَّر</label>
            <input inputMode="decimal" dir="ltr" className={t.input} value={fRate} onChange={(e) => setFRate(latinAmountInput(e.target.value))} placeholder="مثال: 500" />
          </div>
          <div className="flex flex-col justify-end gap-1">
            <label className={`flex items-center gap-2 text-[12px] ${t.text}`}>
              <input type="checkbox" checked={fBillable} onChange={(e) => setFBillable(e.target.checked)} /> قابل للفوترة
            </label>
            {rateHalalas !== null && durationMin > 0 && (
              <p className={`text-[11px] ${t.muted}`}>المبلغ: {sar(timeAmountHalalas(durationMin, rateHalalas))}</p>
            )}
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
            <button type="submit" className={t.primary} disabled={saving}>{saving ? "جارٍ الحفظ…" : "حفظ القيد"}</button>
            <button type="button" className={t.ghost} onClick={loadSessions}><Timer size={13} /> من جلسات المؤقت</button>
            {fSession && <span className={t.chip("green")}>مرتبط بجلسة مؤقت</span>}
          </div>
          {sessionsError && <p className={`sm:col-span-2 ${t.error}`}>{sessionsError}</p>}
          {sessions && (
            <div className="sm:col-span-2 space-y-1">
              {sessions.length === 0 && <p className={`text-[12px] ${t.muted}`}>لا جلسات تركيز حديثة غير مسجّلة.</p>}
              {sessions.map((s) => (
                <button type="button" key={s.id} onClick={() => pickSession(s)}
                  className={`w-full text-start rounded-lg px-3 py-2 text-[12px] ${isDark ? "hover:bg-white/[0.05] text-zinc-300" : "hover:bg-white text-slate-700"}`}>
                  {new Date(s.startedAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" })}
                  {" · "}{formatDuration(s.durationMin)}{s.label ? ` · ${s.label}` : ""}
                </button>
              ))}
            </div>
          )}
          {pickers.error && <p className={`sm:col-span-2 ${t.warn}`}>{pickers.error}</p>}
          {formError && <p className={`sm:col-span-2 ${t.error}`}>{formError}</p>}
        </form>
      )}

      {loadError && <p className={`mt-3 ${t.error}`}>{loadError}</p>}
      {rowError && <p className={`mt-3 ${t.error}`}>{rowError}</p>}
      {rows === null && !loadError && <p className={`mt-4 text-[12px] ${t.muted}`}>جارٍ التحميل…</p>}
      {rows && rows.length === 0 && <p className={`mt-4 text-[12px] ${t.muted}`}>لا قيود وقت بعد.</p>}
      {truncated && <p className={`mt-3 ${t.warn}`}>تُعرض أحدث ٥٠٠ قيد فقط — ضيّق البحث بقضية أو موكل.</p>}

      {rows && rows.length > 0 && (
        <ul className="mt-3">
          {rows.slice(0, compact ? 8 : rows.length).map((r) => (
            <li key={r.id} className={`py-2.5 ${t.row}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-[13px] font-semibold ${r.voided ? "line-through opacity-60" : ""} ${t.text}`}>{r.description}</p>
                  <p className={`text-[11px] ${t.muted}`}>
                    {r.workDate} · {formatDuration(r.durationMin)}
                    {r.hourlyRateHalalas > 0 ? ` × ${sar(r.hourlyRateHalalas)}/س` : " · غير مسعّر"}
                    {!caseId && (r.caseTitle || r.caseRequestId) ? ` · ${r.caseTitle ?? "قضية"}` : ""}
                    {r.clientName ? ` · ${r.clientName}` : ""}
                    {!r.mine && r.writerName ? ` · سجّله ${r.writerName}` : ""}
                  </p>
                  {r.voided && r.voidReason && <p className={`text-[11px] ${t.muted}`}>سبب الإلغاء: {r.voidReason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[13px] font-bold ${t.title}`}>{sar(r.amountHalalas)}</span>
                  {r.voided ? <span className={t.chip("red")}>ملغى</span>
                    : r.billed ? <span className={t.chip("green")}>مفوتر</span>
                    : !r.billable ? <span className={t.chip("gray")}>غير قابل للفوترة</span> : null}
                  {!r.voided && voidId !== r.id && (
                    <button type="button" className={t.ghost} onClick={() => setVoidId(r.id)}>إلغاء</button>
                  )}
                </div>
              </div>
              {voidId === r.id && <VoidBox isDark={isDark} busy={voidBusy} onCancel={() => setVoidId(null)} onConfirm={(reason) => doVoid(r.id, reason)} />}
            </li>
          ))}
        </ul>
      )}
      {compact && rows && rows.length > 8 && (
        <p className={`mt-2 text-[11px] ${t.muted}`}>و{rows.length - 8} قيداً آخر — في صفحة المالية، تبويب «الوقت».</p>
      )}
    </section>
  );
}
