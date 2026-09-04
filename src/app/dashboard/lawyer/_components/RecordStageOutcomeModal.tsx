"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { CheckCircle, XCircle, Info, SealWarning, Timer } from "@phosphor-icons/react";
import { toArabicDigits } from "@/lib/services/hijri";
import { isoDate } from "@/lib/services/deadlineEngine";
import { formatGregorianAr } from "@/app/dashboard/lawyer/_components/DeadlineCard";
import {
  recordCaseStageOutcome,
  type CaseStage,
  type AutoDeadlineResult,
  type AutoDeadlineSkipReason,
} from "@/lib/services/caseStagesService";

interface Props {
  onClose: () => void;
  isDark: boolean;
  caseRequestId: string;
  stage: CaseStage;
  /**
   * Fired once, when the lawyer dismisses the confirmation screen — NOT the
   * moment the outcome is actually written. Mirrors AddDeadlineModal's
   * contract: the parent refreshes its lists only after this fires, so the
   * auto-computed deadline explanation stays on screen long enough to read.
   */
  onSaved: (stage: CaseStage, autoDeadline: AutoDeadlineResult | null) => void;
}

type Outcome = "pending" | "won" | "lost" | "partial" | "settled" | "withdrawn";

const OUTCOME_OPTIONS: { value: Outcome; label: string }[] = [
  { value: "pending", label: "قيد النظر" },
  { value: "won", label: "كسب القضية" },
  { value: "lost", label: "خسارة" },
  { value: "partial", label: "حكم جزئي" },
  { value: "settled", label: "تسوية" },
  { value: "withdrawn", label: "تنازل" },
];
const KNOWN_OUTCOMES = new Set<string>(OUTCOME_OPTIONS.map((o) => o.value));

// One honest sentence per AutoDeadlineSkipReason — never implies a deadline
// exists when none does.
const SKIP_REASON_TEXT: Record<AutoDeadlineSkipReason, string> = {
  no_closed_on: "لم تُحسب مهلة: لا تاريخ إغلاق.",
  no_rule_for_degree: "لا مهلة نظامية تلي هذه الدرجة.",
  already_exists: "المهلة التالية مسجَّلة مسبقاً في رادار المهل.",
  rule_missing: "قاعدة المهلة غير مفعّلة على المنصّة — أضف المهلة يدوياً من الرادار.",
  compute_failed: "تعذّر حساب المهلة تلقائياً — أضفها يدوياً من رادار المهل.",
  insert_failed: "تعذّر حساب المهلة تلقائياً — أضفها يدوياً من رادار المهل.",
};
// Only the three reasons whose own sentence tells the lawyer to go add it
// manually "من الرادار" (rule_missing, compute_failed, insert_failed) get the
// shortcut link — a link on «مسجَّلة مسبقاً» would just repeat what the
// sentence already says.
const SKIP_REASON_LINK = new Set<AutoDeadlineSkipReason>(["rule_missing", "compute_failed", "insert_failed"]);

export default function RecordStageOutcomeModal({ onClose, isDark, caseRequestId, stage, onSaved }: Props) {
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedStage, setSavedStage] = useState<CaseStage | null>(null);
  const [autoDeadline, setAutoDeadline] = useState<AutoDeadlineResult | null>(null);

  const [outcome, setOutcome] = useState<Outcome>(
    stage.outcome && KNOWN_OUTCOMES.has(stage.outcome) ? (stage.outcome as Outcome) : "pending",
  );
  const [closedOn, setClosedOn] = useState(stage.closedOn ?? "");
  const [notes, setNotes] = useState(stage.notes ?? "");

  // SSR-cached-date trap: today's date is computed here, in an effect that
  // runs once on mount — never in the useState initializer above — and only
  // fills the field when the stage did not already carry a closing date.
  useEffect(() => {
    if (!stage.closedOn) setClosedOn(isoDate(new Date()));
  }, [stage.closedOn]);

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
    isDark
      ? "border-white/[0.08] bg-zinc-800 text-zinc-200 focus:border-[#C8A762]"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 focus:border-[#0B3D2E]"
  }`;

  const dateRequired = outcome !== "pending";
  const dateMissing = dateRequired && !closedOn;

  const outcomeBtn = (opt: { value: Outcome; label: string }) => {
    const selected = outcome === opt.value;
    const selectedCls =
      opt.value === "won"
        ? isDark ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-emerald-200 bg-emerald-50 text-emerald-700"
        : opt.value === "lost"
          ? isDark ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-red-200 bg-red-50 text-red-600"
          : opt.value === "partial"
            ? isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-600"
            : isDark ? "border-[#C8A762]/40 bg-[#C8A762]/10 text-[#C8A762]" : "border-[#0B3D2E]/30 bg-[#0B3D2E]/5 text-[#0B3D2E]";
    return (
      <button
        key={opt.value}
        type="button"
        onClick={() => setOutcome(opt.value)}
        className={`rounded-xl border py-2 text-[12px] font-bold transition-all ${
          selected
            ? selectedCls
            : isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-400" : "border-slate-200 bg-white text-slate-500"
        }`}
      >
        {opt.label}
      </button>
    );
  };

  async function handleSave() {
    if (dateMissing) {
      setError("تاريخ الإغلاق مطلوب لتسجيل نتيجة");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await recordCaseStageOutcome(caseRequestId, {
        id: stage.id,
        outcome,
        closedOn: closedOn || null,
        notes,
      });
      setSavedStage(res.stage);
      setAutoDeadline(res.autoDeadline);
      setDone(true);
    } catch (err) {
      console.error("[RecordStageOutcomeModal] save failed:", err);
      // Same convention as AddDeadlineModal/AddCaseStageModal: prefix the raw
      // backend message with an Arabic sentence so the banner is never pure
      // English, even when the API falls back to a raw English/Postgres string.
      setError(
        err instanceof Error && err.message
          ? `تعذّر تسجيل النتيجة: ${err.message}`
          : "تعذّر تسجيل النتيجة. تحقّق من الاتصال ثم أعد المحاولة.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleCloseConfirmation() {
    // savedStage is only unset if the PATCH somehow returned no row — fall
    // back to the stage prop rather than leaving «إغلاق» a dead button.
    onSaved(savedStage ?? stage, autoDeadline);
  }

  const chipCls = `rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-600"}`;
  const amberChipCls = `flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700"}`;

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
        className={`w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto ${isDark ? "bg-zinc-900 border border-white/[0.08]" : "bg-white border border-slate-200"}`}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>تسجيل نتيجة الدرجة</h3>
          <button onClick={onClose} className={`flex h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400 hover:text-white" : "bg-zinc-100 text-zinc-500 hover:text-black"}`}>
            <XCircle size={16} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-4">
            <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} weight="fill" className="text-emerald-500" />
            </div>
            <p className={`font-bold text-[16px] ${isDark ? "text-white" : "text-zinc-900"}`}>سُجِّلت النتيجة</p>

            {autoDeadline?.created && (
              <div className={`mt-4 rounded-xl p-3 text-right space-y-1.5 ${isDark ? "bg-white/[0.04] border border-white/[0.06]" : "bg-slate-50 border border-slate-100"}`}>
                <p className={`flex items-center gap-1.5 text-[12px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
                  <Timer size={13} /> حُسبت مهلة نظامية تلقائياً
                </p>
                <p className={`text-[12.5px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{autoDeadline.deadline.title}</p>
                <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  {formatGregorianAr(autoDeadline.deadline.dueDate)}
                  {autoDeadline.deadline.dueDateHijri ? ` · ${autoDeadline.deadline.dueDateHijri}` : ""}
                  {autoDeadline.deadline.daysCount !== null ? ` · خلال ${toArabicDigits(autoDeadline.deadline.daysCount)} يوماً` : ""}
                </p>
                {autoDeadline.deadline.rolledFromHoliday && (
                  <p className={`flex items-center gap-1 text-[11px] ${isDark ? "text-amber-400" : "text-amber-600"}`}>
                    <Info size={11} /> رُحِّلت لأول يوم عمل بعد عطلة/عطلة نهاية الأسبوع
                  </p>
                )}
                {autoDeadline.deadline.ruleTitleAr && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className={chipCls}>{autoDeadline.deadline.ruleTitleAr}</span>
                    {autoDeadline.deadline.ruleVerified === false && (
                      <span className={amberChipCls}>
                        <SealWarning size={10} /> قاعدة افتراضية — تحتاج مراجعتك
                      </span>
                    )}
                  </div>
                )}
                <Link
                  href="/dashboard/lawyer/deadlines"
                  className={`inline-block pt-1 text-[11px] font-bold hover:underline ${isDark ? "text-emerald-300" : "text-emerald-700"}`}
                >
                  افتح رادار المهل
                </Link>
              </div>
            )}

            {autoDeadline && !autoDeadline.created && (
              <div className={`mt-4 rounded-xl p-3 text-right space-y-1.5 ${isDark ? "bg-white/[0.04] border border-white/[0.06]" : "bg-slate-50 border border-slate-100"}`}>
                <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                  {SKIP_REASON_TEXT[autoDeadline.skipped]}
                </p>
                {SKIP_REASON_LINK.has(autoDeadline.skipped) && (
                  <Link
                    href="/dashboard/lawyer/deadlines"
                    className={`inline-block text-[11px] font-bold hover:underline ${isDark ? "text-emerald-300" : "text-emerald-700"}`}
                  >
                    افتح رادار المهل
                  </Link>
                )}
              </div>
            )}

            <button
              onClick={handleCloseConfirmation}
              className="mt-4 rounded-xl px-5 py-2.5 w-full text-[13px] font-bold bg-[#0B3D2E] text-white hover:bg-[#0B3D2E]/90 transition"
            >
              إغلاق
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className={`rounded-xl px-3 py-2 text-[12px] font-semibold ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {error}
              </div>
            )}

            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>النتيجة <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-3 gap-2">
                {OUTCOME_OPTIONS.map(outcomeBtn)}
              </div>
            </div>

            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                تاريخ الإغلاق {dateRequired && <span className="text-red-500">*</span>}
              </label>
              <input type="date" value={closedOn} onChange={(e) => setClosedOn(e.target.value)} className={inputCls} />
              {dateMissing && (
                <p className="mt-1.5 text-[11px] font-semibold text-red-500">تاريخ الإغلاق مطلوب لتسجيل نتيجة</p>
              )}
              <p className={`mt-1.5 text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                عند تسجيل نتيجة الدرجة الابتدائية أو الاستئناف بتاريخ إغلاق، تُحسب مهلة الاعتراض التالية تلقائياً وتظهر في رادار المهل.
              </p>
            </div>

            <div>
              <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>ملاحظات</label>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} resize-none`} />
            </div>

            <button
              onClick={handleSave}
              disabled={saving || dateMissing}
              className={`w-full rounded-xl py-2.5 text-[13px] font-bold transition mt-2 ${
                saving || dateMissing
                  ? isDark ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22]"
              }`}
            >
              {saving ? "جارٍ الحفظ..." : "حفظ النتيجة"}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
