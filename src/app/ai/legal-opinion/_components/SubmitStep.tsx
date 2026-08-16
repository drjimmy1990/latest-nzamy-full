"use client";

// ─── SubmitStep ────────────────────────────────────────────────────────────────
// The real replacement for the old "processing → result" theatre shared by
// consult/study/legal-memo/research/due-diligence/cross-exam (letter has its
// own submit screen inside LetterWorkflow.tsx — it never reaches this
// component). Modelled on src/app/ai/wargaming/page.tsx's SubmitReview: every
// row below is a read-only recap of a value already collected earlier in the
// wizard and included verbatim in page.tsx's buildIntake() — nothing here is
// a control whose value fails to reach the order payload (Task C4).

import { useState } from "react";
import { motion } from "framer-motion";
import { FileText, PaperPlaneTilt, ArrowLeft, Warning } from "@phosphor-icons/react";
import type { OrderAttachment } from "@/lib/services/orderIntake";

export interface RecapRow {
  label: string;
  value: string;
}

interface Props {
  isDark: boolean;
  card: string;
  title: string;
  recapRows: RecapRow[];
  description: string;
  descriptionLabel: string;
  attachments: OrderAttachment[];
  submitting: boolean;
  submitErrors: string[];
  onBack: () => void;
  onSubmit: () => void;
}

export function SubmitStep({
  isDark, card, title, recapRows, description, descriptionLabel,
  attachments, submitting, submitErrors, onBack, onSubmit,
}: Props) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className={`${card} p-5 space-y-5`}>
        <div>
          <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>مراجعة الطلب وإرساله</h2>
          <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
            سيراجع فريق نظامي بيانات {title} يدوياً ويُعدّ لك المستند المطلوب، وسيصلك إشعار عند جهوزيته.
          </p>
        </div>

        <dl className="space-y-2">
          {recapRows.map(row => (
            <div key={row.label} className="flex gap-3 text-[12px]">
              <dt className={isDark ? "text-zinc-500 w-32 shrink-0" : "text-zinc-400 w-32 shrink-0"}>{row.label}</dt>
              <dd className={isDark ? "text-zinc-200" : "text-zinc-800"}>{row.value || "—"}</dd>
            </div>
          ))}
          <div className="flex gap-3 text-[12px]">
            <dt className={isDark ? "text-zinc-500 w-32 shrink-0" : "text-zinc-400 w-32 shrink-0"}>{descriptionLabel}</dt>
            <dd className={isDark ? "text-zinc-200" : "text-zinc-800"}>
              {description.trim() ? `${description.trim().slice(0, 220)}${description.trim().length > 220 ? "…" : ""}` : "—"}
            </dd>
          </div>
        </dl>

        {attachments.length > 0 && (
          <div className="space-y-1.5">
            <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>المرفقات ({attachments.length})</p>
            {attachments.map(a => (
              <div key={a.documentId} className={`flex items-center gap-2 text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                <FileText size={12} />{a.name}
              </div>
            ))}
          </div>
        )}

        {submitErrors.length > 0 && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 space-y-1">
            {submitErrors.map(e => (
              <p key={e} className="flex items-center gap-1.5 text-[11px] text-red-500">
                <Warning size={12} />{e}
              </p>
            ))}
          </div>
        )}

        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5" />
          <span className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            أقر بأن البيانات المدخلة صحيحة، وأوافق على إرسالها لفريق نظامي لإعداد الطلب.
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-semibold border transition-colors ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-zinc-200 bg-white text-zinc-600"}`}>
            <ArrowLeft size={13} className="rotate-180" />السابق
          </button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onSubmit} disabled={!confirmed || submitting}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50] py-3 text-[13px] font-bold text-white disabled:opacity-40 shadow-lg">
            <PaperPlaneTilt size={15} />{submitting ? "جارٍ الإرسال..." : "إرسال الطلب"}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
