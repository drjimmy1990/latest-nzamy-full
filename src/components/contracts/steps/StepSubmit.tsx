import { motion } from "framer-motion";
import { FileText, PaperPlaneTilt, Warning } from "@phosphor-icons/react";
import { useState } from "react";

/**
 * StepSubmit — shared "review & send" step for محترف العقود.
 *
 * Task C2 built this for draft mode; Task C3 (review mode) is expected to
 * reuse it rather than build a second recap screen. To keep that reuse
 * possible, this component takes everything it renders from props — it
 * never reaches into draft-only state (party1Data, contractDesc, ...) or
 * review-only state (representing, concerns, ...). Callers build the recap
 * rows from their own state and pass them in.
 *
 * There is no internal "السابق" button: src/app/ai/contracts/page.tsx
 * already renders one global back button below every step (driven by
 * s.prevStep()), so this component only owns the submit action.
 */

export interface StepSubmitRow {
  label: string;
  value: string;
  /** Renders the value in the "needs attention" tone (amber) instead of the default. */
  warn?: boolean;
}

export interface StepSubmitAttachment {
  documentId: string;
  name: string;
}

interface StepSubmitProps {
  isDark: boolean;
  heading: string;
  description: string;
  rows: StepSubmitRow[];
  attachments?: StepSubmitAttachment[];
  consentText: string;
  submitLabel?: string;
  submitting: boolean;
  submitErrors: string[];
  onSubmit: () => void;
}

export function StepSubmit({
  isDark, heading, description, rows, attachments = [],
  consentText, submitLabel = "إرسال الطلب", submitting, submitErrors, onSubmit,
}: StepSubmitProps) {
  const [confirmed, setConfirmed] = useState(false);
  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className={`${card} p-5 space-y-5`}>
        <div>
          <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{heading}</h2>
          <p className={`text-[12px] mt-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{description}</p>
        </div>

        <dl className="space-y-2">
          {rows.map((row) => (
            <div key={row.label} className="flex gap-3 text-[12px]">
              <dt className={isDark ? "text-zinc-500 w-32 shrink-0" : "text-zinc-400 w-32 shrink-0"}>{row.label}</dt>
              <dd className={row.warn ? "text-amber-500" : isDark ? "text-zinc-200" : "text-zinc-800"}>
                {row.value || "—"}
              </dd>
            </div>
          ))}
        </dl>

        {attachments.length > 0 && (
          <div className="space-y-1.5">
            <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>المرفقات ({attachments.length})</p>
            {attachments.map((a) => (
              <div key={a.documentId} className={`flex items-center gap-2 text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                <FileText size={12} />{a.name}
              </div>
            ))}
          </div>
        )}

        {submitErrors.length > 0 && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 space-y-1">
            {submitErrors.map((e) => (
              <p key={e} className="flex items-center gap-1.5 text-[11px] text-red-500">
                <Warning size={12} />{e}
              </p>
            ))}
          </div>
        )}

        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
          <span className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{consentText}</span>
        </label>

        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={onSubmit} disabled={!confirmed || submitting}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50] py-3 text-[13px] font-bold text-white disabled:opacity-40 shadow-lg">
          <PaperPlaneTilt size={15} />{submitting ? "جارٍ الإرسال..." : submitLabel}
        </motion.button>
      </div>
    </motion.div>
  );
}
