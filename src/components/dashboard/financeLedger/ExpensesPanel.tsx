"use client";

/**
 * ExpensesPanel — «المصروفات» (owner TODO F3/F4, l6-ledger): money the office
 * spent for a case and/or a client card — category, amount, date, billable,
 * and a receipt (JPG / PNG / WEBP / PDF, ≤ 5 MB) kept in the private documents
 * storage. No delete: «إلغاء» with a reason.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRiyadhToday } from "@/hooks/useRiyadhToday";
import { Receipt, Plus, ArrowClockwise, Paperclip, Eye } from "@phosphor-icons/react";
import {
  EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL_AR, sarToHalalas, type ExpenseCategory, type ExpenseDto,
} from "@/lib/financeLedger/financeLedgerRules";
import { LICENCE_ACCEPT } from "@/lib/services/licenceUpload";
import { createExpense, listExpenses, patchExpense, receiptUrl, uploadExpenseReceipt } from "@/lib/services/financeLedgerService";
import { openPendingTab } from "@/lib/ui/pendingTab";
import { TargetFields, VoidBox, sar, themeCls, useFinancePickers } from "./financeLedgerUi";

export default function ExpensesPanel({ isDark, caseId, compact = false }: { isDark: boolean; caseId?: string; compact?: boolean }) {
  const t = themeCls(isDark);
  const [rows, setRows] = useState<ExpenseDto[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showVoided, setShowVoided] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const pickers = useFinancePickers(formOpen);

  const load = useCallback(() => {
    setLoadError(null);
    listExpenses({ caseId, voided: showVoided })
      .then((r) => { setRows(r.data); setTruncated(r.truncated); })
      .catch((e: Error) => { setRows(null); setLoadError(e.message || "تعذّر تحميل المصروفات."); });
  }, [caseId, showVoided]);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const live = (rows ?? []).filter((r) => !r.voided);
    return {
      all: live.reduce((s, r) => s + r.amountHalalas, 0),
      billableOpen: live.filter((r) => r.billable && !r.billed).reduce((s, r) => s + r.amountHalalas, 0),
      billed: live.filter((r) => r.billed).reduce((s, r) => s + r.amountHalalas, 0),
    };
  }, [rows]);

  const [fCase, setFCase] = useState(caseId ?? "");
  const [fClient, setFClient] = useState("");
  // The browser's Riyadh day, never one computed during SSR (the cached-date trap).
  const today = useRiyadhToday();
  const [fDate, setFDate] = useState("");
  useEffect(() => { if (today && !fDate) setFDate(today); }, [today, fDate]);
  const [fCategory, setFCategory] = useState<ExpenseCategory>("court_fees");
  const [fDesc, setFDesc] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fBillable, setFBillable] = useState(true);
  const [fFile, setFFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNote, setFormNote] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null); setFormNote(null);
    const amount = sarToHalalas(fAmount);
    if (!amount || amount <= 0) { setFormError("أدخل مبلغاً صحيحاً (خانتان عشريتان على الأكثر)."); return; }
    if (!fCase && !fClient) { setFormError("اختر القضية أو الموكل."); return; }
    setSaving(true);
    try {
      let row = await createExpense({
        caseRequestId: fCase || null,
        lawyerClientId: fClient || null,
        spentOn: fDate,
        category: fCategory,
        description: fDesc,
        amountHalalas: amount,
        billable: fBillable,
      });
      if (fFile) {
        try {
          await uploadExpenseReceipt(row.id, fFile);
          row = { ...row, hasReceipt: true };
        } catch (err) {
          setFormNote(`حُفظ المصروف، لكن الإيصال لم يُرفع: ${err instanceof Error ? err.message : ""} — أرفقه من القائمة.`);
        }
      }
      setRows((prev) => [row, ...(prev ?? [])]);
      setFDesc(""); setFAmount(""); setFFile(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "تعذّر حفظ المصروف.");
    } finally {
      setSaving(false);
    }
  };

  const [voidId, setVoidId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const doVoid = async (id: string, reason: string) => {
    setBusyId(id); setRowError(null);
    try {
      const row = await patchExpense(id, { void: true, reason });
      setRows((prev) => (showVoided ? (prev ?? []).map((r) => (r.id === id ? row : r)) : (prev ?? []).filter((r) => r.id !== id)));
      setVoidId(null);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "تعذّر إلغاء المصروف.");
    } finally {
      setBusyId(null);
    }
  };
  const attach = async (id: string, file: File | null) => {
    if (!file) return;
    setBusyId(id); setRowError(null);
    try {
      await uploadExpenseReceipt(id, file);
      setRows((prev) => (prev ?? []).map((r) => (r.id === id ? { ...r, hasReceipt: true } : r)));
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "تعذّر رفع الإيصال.");
    } finally {
      setBusyId(null);
    }
  };
  const view = (id: string) => {
    setRowError(null);
    const tab = openPendingTab(window);
    receiptUrl(id)
      .then((url) => {
        if (!tab.navigate(url)) setRowError("منع المتصفح فتح نافذة جديدة — اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.");
      })
      .catch((err: unknown) => {
        tab.close();
        setRowError(err instanceof Error ? err.message : "تعذّر فتح الإيصال.");
      });
  };

  return (
    <section className={`${t.card} p-4 sm:p-5`} dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={`flex items-center gap-2 text-sm font-bold ${t.title}`}>
          <Receipt size={16} className="text-[#C8A762]" /> المصروفات
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`flex items-center gap-1 text-[11px] ${t.muted}`}>
            <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} /> إظهار الملغاة
          </label>
          <button type="button" className={t.ghost} onClick={load}><ArrowClockwise size={13} /> تحديث</button>
          <button type="button" className={t.primary} onClick={() => setFormOpen((v) => !v)}><Plus size={14} /> مصروف</button>
        </div>
      </div>

      {rows && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div><p className={`text-[10px] ${t.muted}`}>إجمالي المصروفات</p><p className={`text-sm font-bold ${t.title}`}>{sar(totals.all)}</p></div>
          <div><p className={`text-[10px] ${t.muted}`}>قابل للفوترة ولم يُفوتر</p><p className={`text-sm font-bold ${t.title}`}>{sar(totals.billableOpen)}</p></div>
          <div><p className={`text-[10px] ${t.muted}`}>مفوتر</p><p className={`text-sm font-bold ${t.title}`}>{sar(totals.billed)}</p></div>
        </div>
      )}

      {formOpen && (
        <form onSubmit={submit} className={`mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-xl p-3 ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
          <TargetFields isDark={isDark} pickers={pickers} caseId={fCase} clientId={fClient} onCase={setFCase} onClient={setFClient} fixedCase={!!caseId} />
          <div>
            <label className={t.label}>التصنيف</label>
            <select className={t.input} value={fCategory} onChange={(e) => setFCategory(e.target.value as ExpenseCategory)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL_AR[c]}</option>)}
            </select>
          </div>
          <div>
            <label className={t.label}>التاريخ</label>
            <input type="date" className={t.input} value={fDate} max={today || undefined} onChange={(e) => setFDate(e.target.value)} required />
          </div>
          <div className="sm:col-span-2">
            <label className={t.label}>الوصف</label>
            <input className={t.input} value={fDesc} maxLength={1000} onChange={(e) => setFDesc(e.target.value)} placeholder="مثال: رسوم قيد الدعوى" required />
          </div>
          <div>
            <label className={t.label}>المبلغ (ر.س)</label>
            <input inputMode="decimal" className={t.input} value={fAmount} onChange={(e) => setFAmount(e.target.value)} required />
          </div>
          <div>
            <label className={t.label}>الإيصال (اختياري — صورة أو PDF حتى ٥ ميغابايت)</label>
            <input type="file" accept={LICENCE_ACCEPT} className={`text-[12px] ${t.text}`} onChange={(e) => setFFile(e.target.files?.[0] ?? null)} />
          </div>
          <label className={`flex items-center gap-2 text-[12px] ${t.text}`}>
            <input type="checkbox" checked={fBillable} onChange={(e) => setFBillable(e.target.checked)} /> يُحمَّل على الموكل (قابل للفوترة)
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className={t.primary} disabled={saving}>{saving ? "جارٍ الحفظ…" : "حفظ المصروف"}</button>
          </div>
          {pickers.error && <p className={`sm:col-span-2 ${t.warn}`}>{pickers.error}</p>}
          {formError && <p className={`sm:col-span-2 ${t.error}`}>{formError}</p>}
          {formNote && <p className={`sm:col-span-2 ${t.warn}`}>{formNote}</p>}
        </form>
      )}

      {loadError && <p className={`mt-3 ${t.error}`}>{loadError}</p>}
      {rowError && <p className={`mt-3 ${t.error}`}>{rowError}</p>}
      {rows === null && !loadError && <p className={`mt-4 text-[12px] ${t.muted}`}>جارٍ التحميل…</p>}
      {rows && rows.length === 0 && <p className={`mt-4 text-[12px] ${t.muted}`}>لا مصروفات مسجّلة بعد.</p>}
      {truncated && <p className={`mt-3 ${t.warn}`}>تُعرض أحدث ٥٠٠ مصروف فقط — ضيّق البحث بقضية أو موكل.</p>}

      {rows && rows.length > 0 && (
        <ul className="mt-3">
          {rows.slice(0, compact ? 8 : rows.length).map((r) => (
            <li key={r.id} className={`py-2.5 ${t.row}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-[13px] font-semibold ${r.voided ? "line-through opacity-60" : ""} ${t.text}`}>{r.description}</p>
                  <p className={`text-[11px] ${t.muted}`}>
                    {r.spentOn} · {EXPENSE_CATEGORY_LABEL_AR[r.category]}
                    {!caseId && (r.caseTitle || r.caseRequestId) ? ` · ${r.caseTitle ?? "قضية"}` : ""}
                    {r.clientName ? ` · ${r.clientName}` : ""}
                    {!r.mine && r.writerName ? ` · سجّله ${r.writerName}` : ""}
                  </p>
                  {r.voided && r.voidReason && <p className={`text-[11px] ${t.muted}`}>سبب الإلغاء: {r.voidReason}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[13px] font-bold ${t.title}`}>{sar(r.amountHalalas)}</span>
                  {r.voided ? <span className={t.chip("red")}>ملغى</span>
                    : r.billed ? <span className={t.chip("green")}>مفوتر</span>
                    : !r.billable ? <span className={t.chip("gray")}>على المكتب</span> : null}
                  {r.hasReceipt && (
                    <button type="button" className={t.ghost} onClick={() => view(r.id)}><Eye size={13} /> الإيصال</button>
                  )}
                  {!r.hasReceipt && r.mine && !r.voided && !r.billed && (
                    <label className={`${t.ghost} cursor-pointer`}>
                      <Paperclip size={13} /> {busyId === r.id ? "جارٍ الرفع…" : "إرفاق إيصال"}
                      <input type="file" accept={LICENCE_ACCEPT} className="hidden" disabled={busyId === r.id}
                        onChange={(e) => attach(r.id, e.target.files?.[0] ?? null)} />
                    </label>
                  )}
                  {!r.voided && voidId !== r.id && (
                    <button type="button" className={t.ghost} onClick={() => setVoidId(r.id)}>إلغاء</button>
                  )}
                </div>
              </div>
              {voidId === r.id && <VoidBox isDark={isDark} busy={busyId === r.id} onCancel={() => setVoidId(null)} onConfirm={(reason) => doVoid(r.id, reason)} />}
            </li>
          ))}
        </ul>
      )}
      {compact && rows && rows.length > 8 && (
        <p className={`mt-2 text-[11px] ${t.muted}`}>و{rows.length - 8} مصروفاً آخر — في صفحة المالية، تبويب «المصروفات».</p>
      )}
    </section>
  );
}
