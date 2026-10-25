"use client";

/**
 * LedgerEntryModal — «إضافة قيد صادر / وارد» (N3.7, owner §٤٥ axis 1).
 * Opened from the case timeline (case fixed), from the activity page's ledger
 * tab and from «+ إضافة سريعة» → «قيد صادر/وارد» (case picked here). Also
 * edits one of the caller's own entries. Saved through /api/v1/lawyer/ledger;
 * nothing is kept in the browser.
 */

import { useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { XCircle, ArrowUpRight, ArrowDownLeft } from "@phosphor-icons/react";
import { CasePicker } from "@/components/ui/CasePicker";
import {
  LEDGER_CHANNELS,
  LEDGER_CHANNEL_LABEL_AR,
  LEDGER_DIRECTION_LABEL_AR,
  MAX_LEDGER_NOTES,
  MAX_LEDGER_TITLE,
  isoToRiyadhLocalInput,
  riyadhLocalInputToIso,
  type LedgerChannel,
  type LedgerDirection,
} from "@/lib/ledger/ledgerInput";
import { createLedgerEntry, updateLedgerEntry, type LedgerEntry } from "@/lib/services/ledgerService";

interface Props {
  isDark: boolean;
  onClose: () => void;
  /** Opened from a case file: the case is fixed and the picker hidden. */
  caseRequestId?: string;
  /** Editing one of the caller's own entries (its case cannot change). */
  entry?: LedgerEntry | null;
  onSaved?: (entry: LedgerEntry) => void;
}

export default function LedgerEntryModal({ isDark, onClose, caseRequestId, entry, onSaved }: Props) {
  const [caseId, setCaseId] = useState(entry?.caseRequestId ?? caseRequestId ?? "");
  const [direction, setDirection] = useState<LedgerDirection>(entry?.direction ?? "out");
  const [channel, setChannel] = useState<LedgerChannel | "">(entry?.channel ?? "");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [when, setWhen] = useState(isoToRiyadhLocalInput(entry?.occurredAt ?? new Date().toISOString()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const fieldIds = { title: useId(), notes: useId(), when: useId() };
  const firstRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTimeout(() => firstRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const occurredAt = riyadhLocalInputToIso(when);
  const canSave = !saving && !!caseId && !!channel && title.trim().length > 0 && !!occurredAt;

  async function save() {
    if (!canSave || !channel || !occurredAt) return;
    setSaving(true);
    setError(null);
    try {
      const saved = entry
        ? await updateLedgerEntry(entry.id, { direction, channel, title: title.trim(), notes: notes.trim(), occurredAt })
        : await createLedgerEntry({ caseRequestId: caseId, direction, channel, title: title.trim(), notes: notes.trim(), occurredAt });
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر حفظ القيد.");
    } finally {
      setSaving(false);
    }
  }

  const label = `block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`;
  const field = `w-full rounded-xl border px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762] ${
    isDark ? "bg-zinc-950 border-white/10 text-zinc-100 placeholder:text-zinc-600" : "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400"
  }`;
  const chip = (active: boolean) =>
    `rounded-xl border px-2.5 py-2 text-[12px] font-bold transition ${
      active
        ? "bg-[#0B3D2E] text-white border-[#0B3D2E] dark:bg-[#C8A762] dark:text-[#0B3D2E] dark:border-[#C8A762]"
        : isDark ? "border-white/10 text-zinc-300 hover:bg-white/[0.04]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
    }`;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -10 }}
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 id={titleId} className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
            {entry ? "تعديل القيد" : "إضافة قيد صادر / وارد"}
          </h3>
          <button type="button" onClick={onClose} aria-label="إغلاق"
            className={`flex h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400 hover:text-white" : "bg-zinc-100 text-zinc-500 hover:text-black"}`}>
            <XCircle size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {error && (
            <div role="alert" className={`rounded-xl px-3 py-2 text-[12px] font-semibold border ${isDark ? "bg-red-500/10 text-red-300 border-red-500/20" : "bg-red-50 text-red-700 border-red-200"}`}>
              {error}
            </div>
          )}

          <fieldset>
            <legend className={label}>الاتجاه</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["out", "in"] as const).map((d) => (
                <button key={d} type="button" aria-pressed={direction === d} onClick={() => setDirection(d)} className={`${chip(direction === d)} inline-flex items-center justify-center gap-1.5`}>
                  {d === "out" ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownLeft size={14} aria-hidden="true" />}
                  {LEDGER_DIRECTION_LABEL_AR[d]}
                </button>
              ))}
            </div>
          </fieldset>

          {!caseRequestId && !entry && (
            <div>
              <span className={label}>القضية <span className="text-red-500">*</span></span>
              <CasePicker value={caseId} onChange={(id) => setCaseId(id)} isDark={isDark} />
            </div>
          )}

          <div>
            <label htmlFor={fieldIds.title} className={label}>العنوان <span className="text-red-500">*</span></label>
            <input id={fieldIds.title} ref={firstRef} type="text" value={title} maxLength={MAX_LEDGER_TITLE}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={direction === "out" ? "مثال: مذكرة جوابية، صحيفة دعوى" : "مثال: أصل الوكالة، صورة الهوية"}
              className={field} />
          </div>

          <fieldset>
            <legend className={label}>قناة التسليم <span className="text-red-500">*</span></legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {LEDGER_CHANNELS.map((c) => (
                <button key={c} type="button" aria-pressed={channel === c} onClick={() => setChannel(c)} className={chip(channel === c)}>
                  {LEDGER_CHANNEL_LABEL_AR[c]}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor={fieldIds.when} className={label}>التاريخ والوقت (بتوقيت الرياض) <span className="text-red-500">*</span></label>
            <input id={fieldIds.when} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={field} dir="ltr" />
          </div>

          <div>
            <label htmlFor={fieldIds.notes} className={label}>ملاحظات (اختياري)</label>
            <textarea id={fieldIds.notes} value={notes} maxLength={MAX_LEDGER_NOTES} rows={3}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: سُلّمت للسكرتارية، رقم القيد في ناجز…"
              className={`${field} resize-y`} />
          </div>

          <button type="button" onClick={save} disabled={!canSave}
            className={`w-full rounded-xl py-2.5 text-[13px] font-bold transition ${
              canSave ? "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22]" : isDark ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"
            }`}>
            {saving ? "جارٍ الحفظ..." : entry ? "حفظ التعديل" : "حفظ القيد"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
