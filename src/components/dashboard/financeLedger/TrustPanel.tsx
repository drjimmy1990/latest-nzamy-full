"use client";

/**
 * TrustPanel — «أمانات العميل» (owner TODO F3/F4, l6-ledger): money received
 * on behalf of a client (إيداع) and paid out of it (صرف), with the running
 * balance per client. The balance a card shows at the top is the server's
 * (public.client_trust_balance — every live row of that client). A payment
 * that takes it below zero is refused once with a warning and saved only
 * after «تأكيد رغم الرصيد السالب». Movements are never edited or deleted:
 * «إلغاء» with a reason, then record the correct one.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRiyadhToday } from "@/hooks/useRiyadhToday";
import { Vault, Plus, ArrowClockwise, Warning } from "@phosphor-icons/react";
import {
  TRUST_KIND_LABEL_AR, sarToHalalas, withRunningBalance, type TrustDto, type TrustKind,
} from "@/lib/financeLedger/financeLedgerRules";
import { TrustNegativeError, createTrustEntry, listTrust, voidTrustEntry } from "@/lib/services/financeLedgerService";
import { TargetFields, VoidBox, sar, themeCls, useFinancePickers } from "./financeLedgerUi";

export default function TrustPanel({ isDark, caseId }: { isDark: boolean; caseId?: string }) {
  const t = themeCls(isDark);
  const [rows, setRows] = useState<TrustDto[] | null>(null);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [truncated, setTruncated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showVoided, setShowVoided] = useState(false);
  const [clientFilter, setClientFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const pickers = useFinancePickers(true);

  const load = useCallback(() => {
    setLoadError(null);
    listTrust({ caseId, clientId: clientFilter || undefined, voided: showVoided })
      .then((r) => { setRows(r.data); setBalances(r.balances ?? {}); setTruncated(r.truncated); })
      .catch((e: Error) => { setRows(null); setLoadError(e.message || "تعذّر تحميل سجل الأمانات."); });
  }, [caseId, clientFilter, showVoided]);
  useEffect(() => { load(); }, [load]);

  const withBalance = useMemo(() => withRunningBalance(rows ?? []).reverse(), [rows]);
  // «الرصيد بعد الحركة» only where the list is the client's whole account:
  // one client, no case filter, nothing cut off.
  const showRunning = !!clientFilter && !caseId && !truncated && !showVoided;
  const clientLabel = (id: string | null) =>
    (id && (rows ?? []).find((r) => r.lawyerClientId === id)?.clientName)
    || (id && pickers.clients?.find((c) => c.id === id)?.label) || "موكل";

  const [fClient, setFClient] = useState("");
  const [fCase, setFCase] = useState(caseId ?? "");
  const [fKind, setFKind] = useState<TrustKind>("deposit");
  const [fAmount, setFAmount] = useState("");
  // The browser's Riyadh day, never one computed during SSR (the cached-date trap).
  const today = useRiyadhToday();
  const [fDate, setFDate] = useState("");
  useEffect(() => { if (today && !fDate) setFDate(today); }, [today, fDate]);
  const [fDesc, setFDesc] = useState("");
  const [fRef, setFRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [negative, setNegative] = useState<TrustNegativeError | null>(null);

  const save = async (confirmNegative: boolean) => {
    setFormError(null);
    const amount = sarToHalalas(fAmount);
    if (!fClient) { setFormError("الأمانة تُسجَّل لموكل — اختر الموكل."); return; }
    if (!amount || amount <= 0) { setFormError("أدخل مبلغاً صحيحاً (خانتان عشريتان على الأكثر)."); return; }
    setSaving(true);
    try {
      const res = await createTrustEntry({
        lawyerClientId: fClient,
        caseRequestId: fCase || null,
        kind: fKind,
        amountHalalas: amount,
        occurredOn: fDate,
        description: fDesc,
        reference: fRef,
        confirmNegative,
      });
      setNegative(null);
      setRows((prev) => [res.data, ...(prev ?? [])]);
      setBalances((prev) => ({ ...prev, [fClient]: res.balanceHalalas }));
      setFAmount(""); setFDesc(""); setFRef("");
    } catch (err) {
      if (err instanceof TrustNegativeError) setNegative(err);
      else setFormError(err instanceof Error ? err.message : "تعذّر حفظ الحركة.");
    } finally {
      setSaving(false);
    }
  };

  const [voidId, setVoidId] = useState<string | null>(null);
  const [voidBusy, setVoidBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const doVoid = async (id: string, reason: string) => {
    setVoidBusy(true); setRowError(null);
    try {
      await voidTrustEntry(id, reason);
      setVoidId(null);
      load(); // the balance is the server's
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "تعذّر إلغاء الحركة.");
    } finally {
      setVoidBusy(false);
    }
  };

  const balanceEntries = Object.entries(balances);

  return (
    <section className={`${t.card} p-4 sm:p-5`} dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={`flex items-center gap-2 text-sm font-bold ${t.title}`}>
          <Vault size={16} className="text-[#C8A762]" /> أمانات العملاء
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <select className={`${t.input} !w-auto`} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} aria-label="تصفية بالموكل">
            <option value="">كل الموكلين</option>
            {(pickers.clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <label className={`flex items-center gap-1 text-[11px] ${t.muted}`}>
            <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} /> إظهار الملغاة
          </label>
          <button type="button" className={t.ghost} onClick={load}><ArrowClockwise size={13} /> تحديث</button>
          <button type="button" className={t.primary} onClick={() => setFormOpen((v) => !v)}><Plus size={14} /> حركة أمانة</button>
        </div>
      </div>

      <p className={`mt-2 text-[11px] ${t.muted}`}>
        يسجّل الأمانةَ صاحبُ بطاقة الموكل، أو الشريك والمدير المالي في المكتب. الرصيد يجمع كل الحركات غير الملغاة للموكل.
      </p>

      {balanceEntries.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {balanceEntries.map(([id, b]) => (
            <div key={id} className={`rounded-xl px-3 py-2 ${b < 0 ? (isDark ? "bg-red-500/10" : "bg-red-50") : isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
              <p className={`text-[10px] ${t.muted}`}>رصيد {clientLabel(id)}</p>
              <p className={`text-sm font-bold ${b < 0 ? "text-red-500" : t.title}`}>{sar(b)}</p>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <form onSubmit={(e) => { e.preventDefault(); void save(false); }}
          className={`mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-xl p-3 ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
          <TargetFields isDark={isDark} pickers={pickers} caseId={fCase} clientId={fClient} onCase={setFCase} onClient={(v) => { setFClient(v); setNegative(null); }}
            fixedCase={!!caseId} requireClient />
          <div>
            <label className={t.label}>نوع الحركة</label>
            <select className={t.input} value={fKind} onChange={(e) => { setFKind(e.target.value as TrustKind); setNegative(null); }}>
              <option value="deposit">{TRUST_KIND_LABEL_AR.deposit} — استلام مبلغ لحساب الموكل</option>
              <option value="disbursement">{TRUST_KIND_LABEL_AR.disbursement} — دفع من أمانة الموكل</option>
            </select>
          </div>
          <div>
            <label className={t.label}>المبلغ (ر.س)</label>
            <input inputMode="decimal" className={t.input} value={fAmount} onChange={(e) => { setFAmount(e.target.value); setNegative(null); }} required />
          </div>
          <div>
            <label className={t.label}>التاريخ</label>
            <input type="date" className={t.input} value={fDate} max={today || undefined} onChange={(e) => setFDate(e.target.value)} required />
          </div>
          <div>
            <label className={t.label}>المرجع (رقم الحوالة أو السند — اختياري)</label>
            <input className={t.input} value={fRef} maxLength={200} onChange={(e) => setFRef(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={t.label}>البيان</label>
            <input className={t.input} value={fDesc} maxLength={1000} onChange={(e) => setFDesc(e.target.value)} placeholder="مثال: دفعة لرسوم التنفيذ" required />
          </div>
          {negative && (
            <div className={`sm:col-span-2 ${t.warn}`}>
              <p className="flex items-center gap-1 font-bold"><Warning size={14} /> {negative.message}</p>
              <p className="mt-1">الرصيد الحالي {sar(negative.balanceHalalas)} — بعد الصرف {sar(negative.afterHalalas)}.</p>
              <button type="button" className={`${t.ghost} mt-2`} disabled={saving} onClick={() => void save(true)}>
                تأكيد التسجيل رغم الرصيد السالب
              </button>
            </div>
          )}
          <div className="sm:col-span-2">
            <button type="submit" className={t.primary} disabled={saving}>{saving ? "جارٍ الحفظ…" : "حفظ الحركة"}</button>
          </div>
          {pickers.error && <p className={`sm:col-span-2 ${t.warn}`}>{pickers.error}</p>}
          {formError && <p className={`sm:col-span-2 ${t.error}`}>{formError}</p>}
        </form>
      )}

      {loadError && <p className={`mt-3 ${t.error}`}>{loadError}</p>}
      {rowError && <p className={`mt-3 ${t.error}`}>{rowError}</p>}
      {rows === null && !loadError && <p className={`mt-4 text-[12px] ${t.muted}`}>جارٍ التحميل…</p>}
      {rows && rows.length === 0 && <p className={`mt-4 text-[12px] ${t.muted}`}>لا حركات أمانة بعد.</p>}
      {truncated && <p className={`mt-3 ${t.warn}`}>تُعرض أحدث ٥٠٠ حركة فقط، فقد لا يطابق «الرصيد بعد الحركة» الرصيد الكامل أعلاه — اختر موكلاً.</p>}

      {withBalance.length > 0 && (
        <ul className="mt-3">
          {withBalance.map((r) => (
            <li key={r.id} className={`py-2.5 ${t.row}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-[13px] font-semibold ${r.voided ? "line-through opacity-60" : ""} ${t.text}`}>
                    {TRUST_KIND_LABEL_AR[r.kind]} · {r.description}
                  </p>
                  <p className={`text-[11px] ${t.muted}`}>
                    {r.occurredOn} · {r.clientName ?? "موكل"}
                    {r.caseTitle ? ` · ${r.caseTitle}` : ""}
                    {r.reference ? ` · مرجع ${r.reference}` : ""}
                    {!r.mine && r.writerName ? ` · سجّله ${r.writerName}` : ""}
                  </p>
                  {r.negativeAck && <p className="text-[11px] text-amber-500">سُجّل رغم تنبيه الرصيد السالب</p>}
                  {r.voided && r.voidReason && <p className={`text-[11px] ${t.muted}`}>سبب الإلغاء: {r.voidReason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[13px] font-bold ${r.kind === "deposit" ? "text-emerald-500" : "text-red-500"}`}>
                    {r.kind === "deposit" ? "+" : "−"}{sar(r.amountHalalas)}
                  </span>
                  {showRunning && r.balanceAfterHalalas !== null && (
                    <span className={`text-[11px] ${t.muted}`}>الرصيد {sar(r.balanceAfterHalalas)}</span>
                  )}
                  {r.voided ? <span className={t.chip("red")}>ملغى</span>
                    : voidId !== r.id && <button type="button" className={t.ghost} onClick={() => setVoidId(r.id)}>إلغاء</button>}
                </div>
              </div>
              {voidId === r.id && <VoidBox isDark={isDark} busy={voidBusy} onCancel={() => setVoidId(null)} onConfirm={(reason) => doVoid(r.id, reason)} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
