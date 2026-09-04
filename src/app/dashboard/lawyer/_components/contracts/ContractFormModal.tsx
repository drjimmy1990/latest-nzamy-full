"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { XCircle } from "@phosphor-icons/react";
import { describeDateAr } from "@/lib/services/hijri";
import {
  createContract, updateContract,
  type Contract, type CreateContractInput, type UpdateContractInput,
} from "@/lib/services/contractsService";
import {
  CONTRACT_TYPES, CONTRACT_TYPE_AR, CONTRACT_STATUSES, CONTRACT_STATUS_AR,
  canTransitionContract, type ContractType, type ContractStatus,
} from "@/lib/services/contractVocabulary";
import { getLawyerClients, type LawyerClient } from "@/lib/services/lawyerClientsService";

/**
 * ContractFormModal.tsx
 * ─────────────────────────────────────────────────────────
 * Create (initial undefined → createContract) or edit (initial set →
 * updateContract with only the fields that actually changed) one contract.
 * Shared by ContractDetail's «تعديل» and, later, the contracts list's «عقد
 * جديد». Status is only offered in edit mode — a new contract always starts
 * «مسودة» server-side (POST defaults `status` to it when omitted) — and even
 * then only the transitions `canTransitionContract` actually allows from the
 * contract's current status, plus that current status itself.
 */

interface Props {
  isDark: boolean;
  onClose: () => void;
  initial?: Contract;
  onSaved: (c: Contract) => void;
}

export default function ContractFormModal({ isDark, onClose, initial, onSaved }: Props) {
  const isEdit = !!initial;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [contractType, setContractType] = useState<ContractType>(initial?.contractType ?? "service_agreement");
  const [status, setStatus] = useState<ContractStatus>(initial?.status ?? "draft");
  const [counterpartyName, setCounterpartyName] = useState(initial?.counterpartyName ?? "");
  const [valueSar, setValueSar] = useState(initial?.valueSar !== null && initial?.valueSar !== undefined ? String(initial.valueSar) : "");
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(initial?.endsOn ?? "");
  const [autoRenew, setAutoRenew] = useState(initial?.autoRenew ?? false);
  const [renewalNoticeDays, setRenewalNoticeDays] = useState(initial ? String(initial.renewalNoticeDays) : "30");
  const [signedOn, setSignedOn] = useState(initial?.signedOn ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  // ── Client card picker — same pattern as AddCaseModal: cards only
  // ("source: 'card'"), free text stays the fallback. ─────────────────────
  const [clientCards, setClientCards] = useState<LawyerClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsUnreadable, setClientsUnreadable] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(initial?.lawyerClientId ?? "");

  useEffect(() => {
    let cancelled = false;
    getLawyerClients().then((read) => {
      if (cancelled) return;
      if (!read.ok) { setClientsUnreadable(true); setClientsLoading(false); return; }
      setClientCards(read.items.filter((c) => c.source === "card"));
      setClientsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const statusOptions: ContractStatus[] = isEdit && initial
    ? CONTRACT_STATUSES.filter((s) => s === initial.status || canTransitionContract(initial.status, s))
    : [];

  const endsBeforeStarts = !!startsOn && !!endsOn && endsOn < startsOn;

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
    isDark
      ? "border-white/[0.08] bg-zinc-800 text-zinc-200 focus:border-[#C8A762]"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 focus:border-[#0B3D2E]"
  }`;
  const labelCls = `block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`;

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setError("اكتب عنوان العقد قبل الحفظ."); return; }
    if (endsBeforeStarts) { setError("تاريخ النهاية لا يمكن أن يسبق تاريخ البداية."); return; }

    let valueNum: number | null = null;
    if (valueSar.trim()) {
      const n = Number(valueSar.trim());
      if (!Number.isFinite(n) || n < 0) { setError("قيمة العقد غير صالحة."); return; }
      valueNum = n;
    }

    let noticeDays = 30;
    if (renewalNoticeDays.trim()) {
      const n = Number(renewalNoticeDays.trim());
      if (!Number.isInteger(n) || n < 0 || n > 365) {
        setError("أيام إشعار التجديد يجب أن تكون رقماً صحيحاً بين ٠ و٣٦٥.");
        return;
      }
      noticeDays = n;
    }

    setSaving(true);
    setError(null);
    try {
      let saved: Contract;
      if (!initial) {
        const input: CreateContractInput = {
          title: trimmedTitle,
          contractType,
          counterpartyName: counterpartyName.trim() || null,
          lawyerClientId: selectedClientId || null,
          valueSar: valueNum,
          startsOn: startsOn || null,
          endsOn: endsOn || null,
          autoRenew,
          renewalNoticeDays: noticeDays,
          signedOn: signedOn || null,
          notes: notes.trim(),
        };
        saved = await createContract(input);
      } else {
        const patch: UpdateContractInput = {};
        if (trimmedTitle !== initial.title) patch.title = trimmedTitle;
        if (contractType !== initial.contractType) patch.contractType = contractType;
        if (status !== initial.status) patch.status = status;
        const nextCounterparty = counterpartyName.trim() || null;
        if (nextCounterparty !== initial.counterpartyName) patch.counterpartyName = nextCounterparty;
        const nextClientId = selectedClientId || null;
        if (nextClientId !== (initial.lawyerClientId ?? null)) patch.lawyerClientId = nextClientId;
        if (valueNum !== initial.valueSar) patch.valueSar = valueNum;
        const nextStartsOn = startsOn || null;
        if (nextStartsOn !== initial.startsOn) patch.startsOn = nextStartsOn;
        const nextEndsOn = endsOn || null;
        if (nextEndsOn !== initial.endsOn) patch.endsOn = nextEndsOn;
        if (autoRenew !== initial.autoRenew) patch.autoRenew = autoRenew;
        if (noticeDays !== initial.renewalNoticeDays) patch.renewalNoticeDays = noticeDays;
        const nextSignedOn = signedOn || null;
        if (nextSignedOn !== initial.signedOn) patch.signedOn = nextSignedOn;
        const nextNotes = notes.trim();
        if (nextNotes !== initial.notes) patch.notes = nextNotes;

        saved = Object.keys(patch).length > 0 ? await updateContract(initial.id, patch) : initial;
      }
      onSaved(saved);
    } catch (err) {
      console.error("[ContractFormModal] save failed:", err);
      setError(
        err instanceof Error && err.message
          ? `تعذّر الحفظ: ${err.message}`
          : "تعذّر الحفظ. تحقّق من الاتصال ثم أعد المحاولة.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -10 }}
        className={`w-full max-w-lg rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{isEdit ? "تعديل العقد" : "عقد جديد"}</h3>
          <button onClick={onClose} className={`flex h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400 hover:text-white" : "bg-zinc-100 text-zinc-500 hover:text-black"}`}>
            <XCircle size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {error && (
            <div className={`rounded-xl px-3 py-2 text-[12px] font-semibold ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
              {error}
            </div>
          )}

          <div>
            <label className={labelCls}>عنوان العقد <span className="text-red-500">*</span></label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: عقد أتعاب — أحمد العتيبي" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>نوع العقد</label>
            <select value={contractType} onChange={(e) => setContractType(e.target.value as ContractType)} className={inputCls}>
              {CONTRACT_TYPES.map((t) => <option key={t} value={t}>{CONTRACT_TYPE_AR[t]}</option>)}
            </select>
          </div>

          {isEdit && (
            <div>
              <label className={labelCls}>حالة العقد</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as ContractStatus)} className={inputCls}>
                {statusOptions.map((s) => <option key={s} value={s}>{CONTRACT_STATUS_AR[s]}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>الطرف الآخر</label>
            <input type="text" value={counterpartyName} onChange={(e) => setCounterpartyName(e.target.value)} placeholder="اسم الطرف الآخر أو الجهة" className={inputCls} />
          </div>

          {!clientsUnreadable && (clientsLoading || clientCards.length > 0) && (
            <div>
              <label className={labelCls}>بطاقة الموكّل (اختياري)</label>
              <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} disabled={clientsLoading} className={inputCls}>
                <option value="">{clientsLoading ? "جارٍ تحميل الموكّلين..." : "— بدون ربط —"}</option>
                {clientCards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}>قيمة العقد (ر.س، اختياري)</label>
            <input type="number" min="0" value={valueSar} onChange={(e) => setValueSar(e.target.value)} placeholder="مثال: ٢٠٠٠٠" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>تاريخ البداية</label>
              <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={inputCls} />
              {startsOn && describeDateAr(startsOn) && (
                <p className={`mt-1.5 text-[10.5px] ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{describeDateAr(startsOn)}</p>
              )}
            </div>
            <div>
              <label className={labelCls}>تاريخ النهاية</label>
              <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={inputCls} />
              {endsOn && describeDateAr(endsOn) && (
                <p className={`mt-1.5 text-[10.5px] ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{describeDateAr(endsOn)}</p>
              )}
            </div>
          </div>
          {endsBeforeStarts && (
            <p className="text-[11px] font-semibold text-red-500 -mt-2">تاريخ النهاية لا يمكن أن يسبق تاريخ البداية.</p>
          )}

          <label className={`flex items-center gap-2 text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
            <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} className="accent-[#0B3D2E]" />
            تجديد تلقائي
          </label>

          <div>
            <label className={labelCls}>أيام إشعار التجديد</label>
            <input type="number" min="0" max="365" value={renewalNoticeDays} onChange={(e) => setRenewalNoticeDays(e.target.value)} className={inputCls} />
            <p className={`mt-1.5 text-[10.5px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
              يُنشأ التزام «إشعار التجديد / عدم التجديد» تلقائياً قبل النهاية بهذه الأيام ويظهر في رادار المهل
            </p>
          </div>

          <div>
            <label className={labelCls}>تاريخ التوقيع (اختياري)</label>
            <input type="date" value={signedOn} onChange={(e) => setSignedOn(e.target.value)} className={inputCls} />
            {signedOn && describeDateAr(signedOn) && (
              <p className={`mt-1.5 text-[10.5px] ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{describeDateAr(signedOn)}</p>
            )}
          </div>

          <div>
            <label className={labelCls}>ملاحظات</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} resize-none`} />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full rounded-xl py-2.5 text-[13px] font-bold transition mt-2 ${
              saving
                ? isDark ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"
                : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22]"
            }`}
          >
            {saving ? "جارٍ الحفظ..." : "حفظ العقد"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
