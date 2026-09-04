"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { XCircle } from "@phosphor-icons/react";
import { describeDateAr } from "@/lib/services/hijri";
import {
  addContractParty, updateContractParty,
  addContractObligation, updateContractObligation,
  addContractPayment, updateContractPayment,
  type ContractParty, type ContractObligation, type ContractPayment,
} from "@/lib/services/contractsService";
import {
  PARTY_ROLES, PARTY_ROLE_AR, PARTY_KINDS, PARTY_KIND_AR, ENTITY_TYPES, ENTITY_TYPE_AR,
  OBLIGATION_KINDS, OBLIGATION_KIND_AR, OBLIGATION_STATUSES, OBLIGATION_STATUS_AR,
  PAYMENT_STAGES, PAYMENT_STAGE_AR, PAYMENT_STATUSES, PAYMENT_STATUS_AR,
  type PartyRole, type PartyKind, type EntityType,
  type ObligationKind, type ObligationStatus,
  type PaymentStage, type PaymentStatus,
} from "@/lib/services/contractVocabulary";
import { normalizeCommercialRegister, isValidCommercialRegister } from "@/lib/services/clientIdentityRules";
import { getLawyerClients, type LawyerClient } from "@/lib/services/lawyerClientsService";

/**
 * ContractChildForms.tsx
 * ─────────────────────────────────────────────────────────
 * Three small modals — one per contract child table — that ContractDetail
 * opens for "add" (initial undefined) and "edit" (initial set). Same shell
 * as ContractFormModal/AddDeadlineModal; each writes the whole form as the
 * patch on edit rather than diffing field-by-field, since these rows carry
 * far fewer fields and a full-object PATCH is exactly as correct.
 */

const inputClsFor = (isDark: boolean) =>
  `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
    isDark
      ? "border-white/[0.08] bg-zinc-800 text-zinc-200 focus:border-[#C8A762]"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 focus:border-[#0B3D2E]"
  }`;
const labelClsFor = (isDark: boolean) => `block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`;

function ModalShell({
  isDark, title, onClose, busy, children,
}: { isDark: boolean; title: string; onClose: () => void; busy: boolean; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -10 }}
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{title}</h3>
          <button onClick={onClose} disabled={busy} className={`flex h-7 w-7 items-center justify-center rounded-full disabled:opacity-40 ${isDark ? "bg-white/[0.07] text-zinc-400 hover:text-white" : "bg-zinc-100 text-zinc-500 hover:text-black"}`}>
            <XCircle size={16} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function SaveButton({ isDark, busy, onClick, label = "حفظ" }: { isDark: boolean; busy: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`w-full rounded-xl py-2.5 text-[13px] font-bold transition mt-2 ${
        busy
          ? isDark ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"
          : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22]"
      }`}
    >
      {busy ? "جارٍ الحفظ..." : label}
    </button>
  );
}

function ErrorBanner({ isDark, error }: { isDark: boolean; error: string | null }) {
  if (!error) return null;
  return (
    <div className={`rounded-xl px-3 py-2 text-[12px] font-semibold ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
      {error}
    </div>
  );
}

// ─── Common child-form props ────────────────────────────────────────────────

interface PartyFormProps {
  contractId: string;
  isDark: boolean;
  onClose: () => void;
  initial?: ContractParty;
  onSaved: (p: ContractParty) => void;
  parties?: ContractParty[];
}

interface ObligationFormProps {
  contractId: string;
  isDark: boolean;
  onClose: () => void;
  initial?: ContractObligation;
  onSaved: (o: ContractObligation) => void;
  parties?: ContractParty[];
}

interface PaymentFormProps {
  contractId: string;
  isDark: boolean;
  onClose: () => void;
  initial?: ContractPayment;
  onSaved: (p: ContractPayment) => void;
  parties?: ContractParty[];
}

// ─── PartyFormModal ──────────────────────────────────────────────────────────

export function PartyFormModal({ contractId, isDark, onClose, initial, onSaved, parties }: PartyFormProps) {
  const isEdit = !!initial;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState<PartyRole>(initial?.role ?? "second_party");
  const [partyKind, setPartyKind] = useState<PartyKind>(initial?.partyKind ?? "counterparty");
  const [entityType, setEntityType] = useState<EntityType>(initial?.entityType ?? "individual");
  const [name, setName] = useState(initial?.name ?? "");
  const [commercialRegisterNo, setCommercialRegisterNo] = useState(initial?.commercialRegisterNo ?? "");
  const [contactPhone, setContactPhone] = useState(initial?.contactPhone ?? "");
  const [contactEmail, setContactEmail] = useState(initial?.contactEmail ?? "");

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

  const crTrimmed = commercialRegisterNo.trim();
  const crInvalid = !!crTrimmed && !isValidCommercialRegister(crTrimmed);

  const inputCls = inputClsFor(isDark);
  const labelCls = labelClsFor(isDark);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) { setError("اسم الطرف مطلوب."); return; }
    if (crInvalid) { setError("رقم السجل التجاري يجب أن يتكوّن من ١٠ أرقام."); return; }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        role,
        partyKind,
        name: trimmedName,
        entityType,
        lawyerClientId: selectedClientId || null,
        commercialRegisterNo: crTrimmed ? normalizeCommercialRegister(crTrimmed) : null,
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
        position: initial?.position ?? (parties?.length ?? 0),
      };
      const saved = initial
        ? await updateContractParty(contractId, initial.id, payload)
        : await addContractParty(contractId, payload);
      onSaved(saved);
    } catch (err) {
      console.error("[PartyFormModal] save failed:", err);
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
    <ModalShell isDark={isDark} title={isEdit ? "تعديل الطرف" : "إضافة طرف"} onClose={onClose} busy={saving}>
      <div className="space-y-4">
        <ErrorBanner isDark={isDark} error={error} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>دور الطرف</label>
            <select value={role} onChange={(e) => setRole(e.target.value as PartyRole)} className={inputCls}>
              {PARTY_ROLES.map((r) => <option key={r} value={r}>{PARTY_ROLE_AR[r]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>نوع الطرف</label>
            <select value={partyKind} onChange={(e) => setPartyKind(e.target.value as PartyKind)} className={inputCls}>
              {PARTY_KINDS.map((k) => <option key={k} value={k}>{PARTY_KIND_AR[k]}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>نوع الكيان</label>
          <select value={entityType} onChange={(e) => setEntityType(e.target.value as EntityType)} className={inputCls}>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{ENTITY_TYPE_AR[t]}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>الاسم <span className="text-red-500">*</span></label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>

        {!clientsUnreadable && (clientsLoading || clientCards.length > 0) && (
          <div>
            <label className={labelCls}>ربط ببطاقة موكّل (اختياري)</label>
            <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} disabled={clientsLoading} className={inputCls}>
              <option value="">{clientsLoading ? "جارٍ تحميل الموكّلين..." : "— بدون ربط —"}</option>
              {clientCards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className={labelCls}>رقم السجل التجاري (اختياري)</label>
          <input type="text" value={commercialRegisterNo} onChange={(e) => setCommercialRegisterNo(e.target.value)} className={inputCls} placeholder="١٠ أرقام" />
          {crInvalid && <p className="mt-1.5 text-[11px] font-semibold text-red-500">رقم السجل التجاري يجب أن يتكوّن من ١٠ أرقام.</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>الهاتف</label>
            <input type="text" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>البريد الإلكتروني</label>
            <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} />
          </div>
        </div>

        <SaveButton isDark={isDark} busy={saving} onClick={handleSave} label="حفظ الطرف" />
      </div>
    </ModalShell>
  );
}

// ─── ObligationFormModal ─────────────────────────────────────────────────────

export function ObligationFormModal({ contractId, isDark, onClose, initial, onSaved, parties }: ObligationFormProps) {
  const isEdit = !!initial;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState<ObligationKind>(initial?.kind ?? "delivery");
  const [dueOn, setDueOn] = useState(initial?.dueOn ?? "");
  const [responsiblePartyId, setResponsiblePartyId] = useState(initial?.responsiblePartyId ?? "");
  const [status, setStatus] = useState<ObligationStatus>(initial?.status ?? "pending");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [createDeadline, setCreateDeadline] = useState(true);

  const inputCls = inputClsFor(isDark);
  const labelCls = labelClsFor(isDark);

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setError("عنوان الالتزام مطلوب."); return; }
    if (!dueOn) { setError("تاريخ الاستحقاق مطلوب."); return; }

    setSaving(true);
    setError(null);
    try {
      const saved = initial
        ? await updateContractObligation(contractId, initial.id, {
            title: trimmedTitle,
            kind,
            dueOn,
            responsiblePartyId: responsiblePartyId || null,
            status,
            notes: notes.trim(),
          })
        : await addContractObligation(contractId, {
            title: trimmedTitle,
            kind,
            dueOn,
            responsiblePartyId: responsiblePartyId || null,
            status: "pending",
            notes: notes.trim(),
            createDeadline,
          });
      onSaved(saved);
    } catch (err) {
      console.error("[ObligationFormModal] save failed:", err);
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
    <ModalShell isDark={isDark} title={isEdit ? "تعديل الالتزام" : "إضافة التزام"} onClose={onClose} busy={saving}>
      <div className="space-y-4">
        <ErrorBanner isDark={isDark} error={error} />

        <div>
          <label className={labelCls}>عنوان الالتزام <span className="text-red-500">*</span></label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>نوع الالتزام</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as ObligationKind)} className={inputCls}>
            {OBLIGATION_KINDS.map((k) => <option key={k} value={k}>{OBLIGATION_KIND_AR[k]}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>تاريخ الاستحقاق <span className="text-red-500">*</span></label>
          <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} className={inputCls} />
          {dueOn && describeDateAr(dueOn) && (
            <p className={`mt-1.5 text-[10.5px] ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{describeDateAr(dueOn)}</p>
          )}
        </div>

        {parties && parties.length > 0 && (
          <div>
            <label className={labelCls}>الطرف المسؤول (اختياري)</label>
            <select value={responsiblePartyId} onChange={(e) => setResponsiblePartyId(e.target.value)} className={inputCls}>
              <option value="">— بدون تحديد —</option>
              {parties.map((p) => <option key={p.id} value={p.id}>{PARTY_ROLE_AR[p.role]} — {p.name}</option>)}
            </select>
          </div>
        )}

        {isEdit && (
          <div>
            <label className={labelCls}>حالة الالتزام</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as ObligationStatus)} className={inputCls}>
              {OBLIGATION_STATUSES.map((s) => <option key={s} value={s}>{OBLIGATION_STATUS_AR[s]}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className={labelCls}>ملاحظات</label>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} resize-none`} />
        </div>

        {!isEdit && (
          <label className={`flex items-start gap-2 text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
            <input type="checkbox" checked={createDeadline} onChange={(e) => setCreateDeadline(e.target.checked)} className="accent-[#0B3D2E] mt-0.5" />
            <span>
              إضافتها إلى رادار المهل
              <span className={`block text-[10.5px] font-normal mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                تُنشئ مهلة في رادار المهل بتذكيرات قبل الاستحقاق
              </span>
            </span>
          </label>
        )}

        <SaveButton isDark={isDark} busy={saving} onClick={handleSave} label="حفظ الالتزام" />
      </div>
    </ModalShell>
  );
}

// ─── PaymentFormModal ────────────────────────────────────────────────────────

export function PaymentFormModal({ contractId, isDark, onClose, initial, onSaved }: PaymentFormProps) {
  const isEdit = !!initial;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState(initial?.label ?? "");
  const [stage, setStage] = useState<PaymentStage>(initial?.stage ?? "advance");
  const [amountSar, setAmountSar] = useState(initial?.amountSar !== undefined && initial?.amountSar !== null ? String(initial.amountSar) : "");
  const [dueOn, setDueOn] = useState(initial?.dueOn ?? "");
  const [status, setStatus] = useState<PaymentStatus>(initial?.status ?? "pending");
  const [paidOn, setPaidOn] = useState(initial?.paidOn ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const inputCls = inputClsFor(isDark);
  const labelCls = labelClsFor(isDark);

  const paidOnRequired = isEdit && status === "paid";
  const paidOnMissing = paidOnRequired && !paidOn;

  async function handleSave() {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) { setError("اسم الدفعة مطلوب."); return; }
    const amountNum = Number(amountSar.trim());
    if (!amountSar.trim() || !Number.isFinite(amountNum) || amountNum <= 0) {
      setError("المبلغ يجب أن يكون أكبر من صفر");
      return;
    }
    if (paidOnMissing) { setError("حدّد تاريخ السداد"); return; }

    setSaving(true);
    setError(null);
    try {
      const saved = initial
        ? await updateContractPayment(contractId, initial.id, {
            label: trimmedLabel,
            stage,
            amountSar: amountNum,
            dueOn: dueOn || null,
            status,
            paidOn: paidOn || null,
            notes: notes.trim(),
          })
        : await addContractPayment(contractId, {
            label: trimmedLabel,
            stage,
            amountSar: amountNum,
            dueOn: dueOn || null,
            status: "pending",
            paidOn: null,
            // no position on create — the API appends at the end of the schedule
            notes: notes.trim(),
          });
      onSaved(saved);
    } catch (err) {
      console.error("[PaymentFormModal] save failed:", err);
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
    <ModalShell isDark={isDark} title={isEdit ? "تعديل الدفعة" : "إضافة دفعة"} onClose={onClose} busy={saving}>
      <div className="space-y-4">
        <ErrorBanner isDark={isDark} error={error} />

        <div>
          <label className={labelCls}>اسم الدفعة <span className="text-red-500">*</span></label>
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>مرحلة الدفعة</label>
          <select value={stage} onChange={(e) => setStage(e.target.value as PaymentStage)} className={inputCls}>
            {PAYMENT_STAGES.map((s) => <option key={s} value={s}>{PAYMENT_STAGE_AR[s]}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>المبلغ (ر.س) <span className="text-red-500">*</span></label>
            <input type="number" min="0" value={amountSar} onChange={(e) => setAmountSar(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>تاريخ الاستحقاق</label>
            <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} className={inputCls} />
          </div>
        </div>

        {isEdit && (
          <div>
            <label className={labelCls}>حالة الدفعة</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus)} className={inputCls}>
              {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{PAYMENT_STATUS_AR[s]}</option>)}
            </select>
          </div>
        )}

        {paidOnRequired && (
          <div>
            <label className={labelCls}>تاريخ السداد <span className="text-red-500">*</span></label>
            <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={inputCls} />
            {paidOnMissing && <p className="mt-1.5 text-[11px] font-semibold text-red-500">حدّد تاريخ السداد</p>}
          </div>
        )}

        <div>
          <label className={labelCls}>ملاحظات</label>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} resize-none`} />
        </div>

        <SaveButton isDark={isDark} busy={saving} onClick={handleSave} label="حفظ الدفعة" />
      </div>
    </ModalShell>
  );
}
