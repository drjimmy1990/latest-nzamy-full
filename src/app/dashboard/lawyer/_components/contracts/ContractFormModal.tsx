"use client";

import { useEffect, useState } from "react";
import ModalShell from "@/components/ui/ModalShell";
import DualDatePicker from "@/components/ui/DualDatePicker";
import {
  createContract, updateContract,
  type Contract, type CreateContractInput, type UpdateContractInput,
} from "@/lib/services/contractsService";
import {
  CONTRACT_TYPES, CONTRACT_TYPE_AR, CONTRACT_STATUSES, CONTRACT_STATUS_AR,
  canTransitionContract, type ContractType, type ContractStatus,
} from "@/lib/services/contractVocabulary";
import {
  getLawyerClients, createLawyerClient, type LawyerClient, type ClientType,
} from "@/lib/services/lawyerClientsService";
import { isSupabaseMode } from "@/lib/runtimeMode";
import { apiGet } from "@/lib/services/api";
import type { WorkflowRequest } from "@/lib/workflowStore";
import { isLawyerCaseRow } from "../../cases/_caseListRules";

/** A case the contract can be linked to (N01-6) — the rows the case list shows. */
interface CaseOption { id: string; title: string }

/**
 * N01-6: the caller's cases, narrowed to one client card's when one is picked
 * (service-requests GET `lawyer_client_id`). Same rows and rule as the
 * hearing modal's case picker (isLawyerCaseRow, cancelled left out). The
 * server re-checks the link on save (own case, same client card).
 */
async function loadCaseOptions(lawyerClientId: string): Promise<CaseOption[]> {
  const rows = await apiGet<{ data?: WorkflowRequest[]; degraded?: boolean }>("/api/v1/service-requests", {
    receiver: "lawyer",
    limit: 200,
    ...(lawyerClientId ? { lawyer_client_id: lawyerClientId } : {}),
  });
  if (rows.degraded) throw new Error("degraded");
  return (rows.data ?? [])
    .filter(isLawyerCaseRow)
    .filter((r) => r.status !== "cancelled")
    .map((r) => ({ id: r.id, title: r.title || "قضية بدون عنوان" }));
}

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

  // N01-6 «ربط بقضية قائمة»: optional; the list follows the picked client card.
  const [selectedRequestId, setSelectedRequestId] = useState(initial?.requestId ?? "");
  const [caseRead, setCaseRead] = useState<{ key: string; ok: boolean; items: CaseOption[] } | null>(null);
  useEffect(() => {
    if (!isSupabaseMode) return;
    let cancelled = false;
    const key = selectedClientId;
    loadCaseOptions(key)
      .then((items) => { if (!cancelled) setCaseRead({ key, ok: true, items }); })
      .catch((err) => {
        console.error("[ContractFormModal] cases load failed:", err);
        if (!cancelled) setCaseRead({ key, ok: false, items: [] });
      });
    return () => { cancelled = true; };
  }, [selectedClientId]);
  const casesLoading = !caseRead || caseRead.key !== selectedClientId;

  // N01-4 (owner 13-Nov): a quick client card from inside the contract — the
  // same POST /api/v1/lawyer/clients AddCaseModal uses — selected on save.
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickType, setQuickType] = useState<ClientType>("individual");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  async function handleQuickClient() {
    const name = quickName.trim();
    if (!name) { setQuickError("اكتب اسم الموكّل."); return; }
    setQuickSaving(true);
    setQuickError(null);
    try {
      const card = await createLawyerClient({
        name,
        clientType: quickType,
        ...(quickPhone.trim() ? { phone: quickPhone.trim() } : {}),
      });
      setClientCards((prev) => [card, ...prev.filter((c) => c.id !== card.id)]);
      setSelectedClientId(card.id);
      // A new card has no cases yet: a case picked before cannot stay linked.
      setSelectedRequestId("");
      if (!counterpartyName.trim()) setCounterpartyName(card.name);
      setQuickOpen(false);
      setQuickName("");
      setQuickPhone("");
    } catch (err) {
      setQuickError(err instanceof Error && err.message ? err.message : "تعذّر حفظ الموكّل.");
    } finally {
      setQuickSaving(false);
    }
  }

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

  // CODE-F34: "dirty" = differs from what the form opened with (empty for a
  // new contract, the saved contract for an edit). The first render's snapshot
  // is the baseline.
  const snapshot = JSON.stringify([
    title, contractType, status, counterpartyName, selectedClientId, valueSar,
    startsOn, endsOn, autoRenew, renewalNoticeDays, signedOn, notes, selectedRequestId,
  ]);
  const [baseline] = useState(snapshot);
  const dirty = snapshot !== baseline;

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
          requestId: selectedRequestId || null,
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
        const nextRequestId = selectedRequestId || null;
        if (nextRequestId !== (initial.requestId ?? null)) patch.requestId = nextRequestId;
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

  // CODE-F34: no exit while the contract is being saved; a changed draft asks first.
  return (
    <ModalShell
      title={isEdit ? "تعديل العقد" : "عقد جديد"}
      onClose={onClose}
      isDark={isDark}
      busy={saving}
      dirty={dirty}
      maxWidthClass="max-w-lg"
    >
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

          {!clientsUnreadable && (clientsLoading || clientCards.length > 0 || isSupabaseMode) && (
            <div>
              <label className={labelCls}>بطاقة الموكّل (اختياري)</label>
              <select
                value={selectedClientId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedClientId(id);
                  // The case list follows the client, so a case picked for
                  // another client is cleared — never saved while hidden.
                  if (id !== selectedClientId) setSelectedRequestId("");
                  // N01-5 (owner package 13 Nov): picking the client fills «الطرف الآخر»
                  // when it is still empty; a name the lawyer typed is never overwritten.
                  const picked = clientCards.find((c) => c.id === id);
                  if (picked && !counterpartyName.trim()) setCounterpartyName(picked.name);
                }}
                disabled={clientsLoading}
                className={inputCls}
              >
                <option value="">{clientsLoading ? "جارٍ تحميل الموكّلين..." : "— بدون ربط —"}</option>
                {clientCards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {isSupabaseMode && !clientsLoading && !quickOpen && (
                <button
                  type="button"
                  onClick={() => { setQuickOpen(true); setQuickError(null); }}
                  className={`mt-1.5 text-[11.5px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} hover:underline`}
                >
                  + إضافة موكّل جديد
                </button>
              )}
              {quickOpen && (
                <div className={`mt-2 space-y-2 rounded-xl border p-3 ${isDark ? "border-white/[0.08] bg-zinc-900" : "border-zinc-200 bg-white"}`}>
                  <input
                    type="text"
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    placeholder="اسم الموكّل"
                    className={inputCls}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={quickType} onChange={(e) => setQuickType(e.target.value as ClientType)} className={inputCls}>
                      <option value="individual">فرد</option>
                      <option value="company">شركة</option>
                    </select>
                    <input
                      type="tel"
                      dir="ltr"
                      value={quickPhone}
                      onChange={(e) => setQuickPhone(e.target.value)}
                      placeholder="05xxxxxxxx (اختياري)"
                      className={inputCls}
                    />
                  </div>
                  {quickError && <p className="text-[11px] font-semibold text-red-500">{quickError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleQuickClient}
                      disabled={quickSaving}
                      className="flex-1 rounded-xl bg-[#0B3D2E] py-2 text-[12px] font-bold text-[#C8A762] hover:bg-[#092e22] disabled:opacity-60"
                    >
                      {quickSaving ? "جارٍ الحفظ..." : "حفظ الموكّل واختياره"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setQuickOpen(false); setQuickError(null); }}
                      disabled={quickSaving}
                      className={`rounded-xl border px-3 py-2 text-[12px] font-bold ${isDark ? "border-white/[0.08] text-zinc-300" : "border-zinc-200 text-zinc-600"}`}
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isSupabaseMode && (
            <div>
              <label className={labelCls}>ربط بقضية قائمة (اختياري)</label>
              <select
                value={selectedRequestId}
                onChange={(e) => setSelectedRequestId(e.target.value)}
                disabled={casesLoading}
                className={inputCls}
              >
                <option value="">
                  {casesLoading ? "جارٍ تحميل القضايا..." : caseRead && !caseRead.ok ? "تعذّر تحميل القضايا" : "— بدون ربط —"}
                </option>
                {initial?.requestId && selectedRequestId === initial.requestId &&
                  !(caseRead?.items ?? []).some((c) => c.id === initial.requestId) && (
                  <option value={initial.requestId}>القضية المرتبطة حالياً</option>
                )}
                {(casesLoading ? [] : caseRead?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              {!casesLoading && caseRead?.ok && caseRead.items.length === 0 && (
                <p className={`mt-1.5 text-[10.5px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                  {selectedClientId ? "لا توجد قضايا مسجّلة لهذا الموكّل." : "لا توجد قضايا لربطها."}
                </p>
              )}
            </div>
          )}

          <div>
            <label className={labelCls}>قيمة العقد (ر.س، اختياري)</label>
            <input type="number" min="0" value={valueSar} onChange={(e) => setValueSar(e.target.value)} placeholder="مثال: ٢٠٠٠٠" className={inputCls} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>تاريخ البداية</label>
              <DualDatePicker label="تاريخ البداية" value={startsOn} onChange={setStartsOn} clearable className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>تاريخ النهاية</label>
              <DualDatePicker label="تاريخ النهاية" value={endsOn} onChange={setEndsOn} clearable className={inputCls} />
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
            <DualDatePicker label="تاريخ التوقيع" value={signedOn} onChange={setSignedOn} clearable className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>ملاحظات</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} resize-none`} />
          </div>

          <button
            type="button"
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
    </ModalShell>
  );
}
