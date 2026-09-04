"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Warning, X } from "@phosphor-icons/react";
import {
  updateLawyerConsultation,
  deliverConsultationOpinion,
  convertConsultationToCase,
  type LawyerConsultation,
} from "@/lib/services/lawyerConsultationsService";
import { describeDateAr } from "@/lib/services/hijri";
import { toArabicDigits } from "@/lib/services/arabicCount";
import {
  CONSULTATION_MODES,
  CONSULTATION_MODE_AR,
  CONSULTATION_OUTCOMES,
  CONSULTATION_OUTCOME_AR,
  consultationTransitionIssue,
  type ConsultationMode,
  type ConsultationOutcome,
  type ConsultationStatus,
} from "@/lib/services/consultationVocabulary";

/**
 * ConsultationActionModal.tsx
 * ─────────────────────────────────────────────────────────
 * One modal, six actions, all through lawyerConsultationsService. Mirrors
 * AddDeadlineModal / RecordStageOutcomeModal in chrome, but carries no
 * internal "done" screen: on success it calls `onDone` once and lets the
 * PARENT (ConsultationDetail) close it — the parent needs the fresh row to
 * update its own state before the modal disappears.
 */

export type ConsultationAction = "schedule" | "complete" | "cancel" | "no_show" | "opinion" | "convert";

interface Props {
  consultation: LawyerConsultation;
  action: ConsultationAction;
  isDark: boolean;
  onClose: () => void;
  onDone: (updated: LawyerConsultation, extra?: { caseRequestId?: string }) => void;
  // Optional — defaults to the lawyer dashboard so the spec's Props shape
  // stays intact for existing callers. ConsultationDetail already knows the
  // right base (it renders the same "القضية" link itself); pass it through
  // once a /dashboard/firm/consultations/[id] route exists so the
  // already-converted state below matches instead of hardcoding /lawyer/.
  basePath?: "/dashboard/lawyer" | "/dashboard/firm";
}

const DURATIONS = [30, 45, 60, 90, 120] as const;

// deliverConsultationOpinion always completes the consultation as a side
// effect — "opinion_delivered" and "converted_to_case" are outcomes the
// PLATFORM sets from those two dedicated actions, never something a lawyer
// picks by hand on the plain "complete" form.
const COMPLETE_OUTCOMES = CONSULTATION_OUTCOMES.filter(
  (o): o is Exclude<ConsultationOutcome, "opinion_delivered" | "converted_to_case"> =>
    o !== "opinion_delivered" && o !== "converted_to_case",
);

const ACTION_TARGET_STATUS: Record<ConsultationAction, ConsultationStatus | null> = {
  schedule: "scheduled",
  complete: "completed",
  cancel: "cancelled",
  no_show: "no_show",
  // Handled separately below — /opinion completes the consultation too, but
  // (like the route) skips the transition check entirely once the row is
  // already "completed" instead of refusing a same-status "transition".
  opinion: null,
  convert: null,
};

const ACTION_TITLE: Record<ConsultationAction, string> = {
  schedule: "جدولة الاستشارة",
  complete: "إتمام الاستشارة",
  cancel: "إلغاء الاستشارة",
  no_show: "تسجيل عدم حضور",
  opinion: "تسليم الرأي القانوني",
  convert: "تحويل الاستشارة إلى قضية",
};

const SUBMIT_LABEL: Record<ConsultationAction, string> = {
  schedule: "حفظ الموعد",
  complete: "إتمام الاستشارة",
  cancel: "تأكيد الإلغاء",
  no_show: "تأكيد",
  opinion: "تسليم الرأي القانوني",
  convert: "تحويل إلى قضية",
};

/** `<input type="datetime-local">` value ("YYYY-MM-DDTHH:mm", local time) from an ISO instant, or "" when there is none. */
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * An ISO instant from a `datetime-local` value, or null for an empty/invalid
 * one. `new Date("YYYY-MM-DDTHH:mm")` — no timezone offset, no seconds — is
 * parsed as LOCAL time per spec (unlike a date-only "YYYY-MM-DD" string,
 * which parses as UTC), so this round-trips exactly what the picker showed.
 */
function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function ConsultationActionModal({ consultation, action, isDark, onClose, onDone, basePath = "/dashboard/lawyer" }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── schedule ──
  const [scheduledAtLocal, setScheduledAtLocal] = useState(() => toDatetimeLocalValue(consultation.scheduledAt));
  // Falls back to 60 only when the stored value isn't one of the offered
  // options — PATCH accepts any integer 5..480, so a row saved with e.g. 75
  // would otherwise leave the <select> matching nothing, silently rewriting
  // it to whichever option the browser defaults to on the next save.
  const [duration, setDuration] = useState<number>(
    consultation.durationMinutes !== null && (DURATIONS as readonly number[]).includes(consultation.durationMinutes)
      ? consultation.durationMinutes
      : 60,
  );
  const [mode, setMode] = useState<ConsultationMode>(consultation.mode);

  // ── complete ──
  const [outcome, setOutcome] = useState<ConsultationOutcome>(
    consultation.outcome && (COMPLETE_OUTCOMES as readonly string[]).includes(consultation.outcome)
      ? consultation.outcome
      : "advice_given",
  );
  const [feeSarText, setFeeSarText] = useState(consultation.feeSar !== null ? String(consultation.feeSar) : "");
  const [feePaid, setFeePaid] = useState(consultation.feePaid);

  // ── cancel ──
  const [cancelReason, setCancelReason] = useState(consultation.cancelledReason ?? "");

  // ── opinion ──
  const [opinionText, setOpinionText] = useState("");

  // ── convert ──
  const [convertTitle, setConvertTitle] = useState(`قضية من استشارة: ${consultation.title}`);

  const scheduledAtIso = action === "schedule" ? fromDatetimeLocalValue(scheduledAtLocal) : null;
  const scheduledAtDescribed = action === "schedule" && scheduledAtLocal
    ? describeDateAr(scheduledAtLocal.slice(0, 10))
    : null;
  const scheduledAtTime = action === "schedule" && scheduledAtIso
    ? new Date(scheduledAtIso).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })
    : null;

  const targetStatus = ACTION_TARGET_STATUS[action];
  const genericTransitionIssue = targetStatus
    ? consultationTransitionIssue(consultation.status, targetStatus, {
        scheduledAt: action === "schedule" ? scheduledAtIso : consultation.scheduledAt,
      })
    : null;
  // /opinion mirrors the route exactly: once the row is already "completed"
  // the transition check is skipped rather than run against itself — the
  // vocabulary has no reflexive "completed → completed" allowance, so running
  // it here would show a false refusal for the single most common case (a
  // consultation the lawyer already marked complete, now getting its opinion).
  const opinionIssue = action === "opinion"
    ? consultation.status === "completed"
      ? null
      : consultationTransitionIssue(consultation.status, "completed", { scheduledAt: consultation.scheduledAt })
    : null;
  const transitionIssue = action === "opinion" ? opinionIssue : genericTransitionIssue;

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
    isDark
      ? "border-white/[0.08] bg-zinc-800 text-zinc-200 focus:border-[#C8A762]"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 focus:border-[#0B3D2E]"
  }`;
  const labelCls = `block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`;

  function chip(active: boolean, label: string, onClick: () => void, key: string) {
    return (
      <button
        key={key}
        type="button"
        onClick={onClick}
        className={`rounded-xl border py-2 px-2.5 text-[12px] font-bold transition-all ${
          active
            ? isDark ? "border-[#C8A762]/40 bg-[#C8A762]/10 text-[#C8A762]" : "border-[#0B3D2E]/30 bg-[#0B3D2E]/5 text-[#0B3D2E]"
            : isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-400" : "border-slate-200 bg-white text-slate-500"
        }`}
      >
        {label}
      </button>
    );
  }

  const feeTrim = feeSarText.trim();
  const feeNumber = feeTrim === "" ? null : Number(feeTrim);
  const feeValid = feeTrim === "" || (Number.isFinite(feeNumber) && (feeNumber as number) >= 0);

  const opinionAlreadyDelivered = !!consultation.opinionDeliveredAt;
  const alreadyConverted = !!consultation.convertedCaseRequestId;

  const canSave = (() => {
    if (transitionIssue) return false;
    if (action === "schedule") return !!scheduledAtIso && !!duration && !!mode;
    if (action === "complete") return !!outcome && feeValid;
    if (action === "cancel") return true;
    if (action === "no_show") return true;
    if (action === "opinion") return !opinionAlreadyDelivered && !!opinionText.trim();
    if (action === "convert") return !alreadyConverted && !!convertTitle.trim();
    return false;
  })();

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (action === "schedule") {
        const updated = await updateLawyerConsultation(consultation.id, {
          status: "scheduled",
          scheduledAt: scheduledAtIso,
          durationMinutes: duration,
          mode,
        });
        onDone(updated);
      } else if (action === "complete") {
        const updated = await updateLawyerConsultation(consultation.id, {
          status: "completed",
          outcome,
          // Blank means "clear" here, not "leave as-is" — the field is
          // prefilled from the current value, so an intentionally emptied
          // field is a decision to remove the fee, not silence.
          feeSar: feeTrim === "" ? null : feeNumber,
          feePaid,
        });
        onDone(updated);
      } else if (action === "cancel") {
        const updated = await updateLawyerConsultation(consultation.id, {
          status: "cancelled",
          cancelledReason: cancelReason.trim() || null,
        });
        onDone(updated);
      } else if (action === "no_show") {
        const updated = await updateLawyerConsultation(consultation.id, { status: "no_show" });
        onDone(updated);
      } else if (action === "opinion") {
        const updated = await deliverConsultationOpinion(consultation.id, opinionText.trim());
        onDone(updated);
      } else if (action === "convert") {
        const { consultation: updated, caseRequestId } = await convertConsultationToCase(consultation.id, {
          title: convertTitle.trim(),
        });
        onDone(updated, { caseRequestId });
      }
    } catch (err) {
      console.error("[ConsultationActionModal] save failed:", err);
      setError(
        err instanceof Error && err.message
          ? `تعذّر الحفظ: ${err.message}`
          : "تعذّر الحفظ. تحقّق من الاتصال ثم أعد المحاولة.",
      );
    } finally {
      setSaving(false);
    }
  }

  const title = action === "schedule"
    ? (consultation.status === "scheduled" ? "إعادة الجدولة" : ACTION_TITLE.schedule)
    : ACTION_TITLE[action];
  const isDestructive = action === "cancel";
  const showFooterButton =
    (action !== "opinion" || !opinionAlreadyDelivered) &&
    (action !== "convert" || !alreadyConverted);

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
          <h3 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{title}</h3>
          <button onClick={onClose} className={`flex h-7 w-7 items-center justify-center rounded-full ${isDark ? "bg-white/[0.07] text-zinc-400 hover:text-white" : "bg-zinc-100 text-zinc-500 hover:text-black"}`}>
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className={`mb-4 rounded-xl px-3 py-2 text-[12px] font-semibold ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
            {error}
          </div>
        )}

        {transitionIssue && (
          <div className={`mb-4 flex items-start gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold ${isDark ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
            <Warning size={14} className="mt-0.5 shrink-0" /> <span>{transitionIssue}</span>
          </div>
        )}

        <div className="space-y-4">
          {action === "schedule" && (
            <>
              <div>
                <label className={labelCls}>الموعد <span className="text-red-500">*</span></label>
                <input type="datetime-local" value={scheduledAtLocal} onChange={(e) => setScheduledAtLocal(e.target.value)} className={inputCls} />
                {scheduledAtDescribed && (
                  <p className={`mt-1.5 text-[11px] font-semibold ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
                    {scheduledAtDescribed}{scheduledAtTime ? ` · ${scheduledAtTime}` : ""}
                  </p>
                )}
              </div>
              <div>
                <label className={labelCls}>المدة</label>
                <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputCls}>
                  {DURATIONS.map((d) => <option key={d} value={d}>{toArabicDigits(d)} دقيقة</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>طريقة الاستشارة</label>
                <div className="grid grid-cols-3 gap-2">
                  {CONSULTATION_MODES.map((m) => chip(mode === m, CONSULTATION_MODE_AR[m], () => setMode(m), m))}
                </div>
              </div>
            </>
          )}

          {action === "complete" && (
            <>
              <div>
                <label className={labelCls}>نتيجة الاستشارة</label>
                <div className="grid grid-cols-1 gap-2">
                  {COMPLETE_OUTCOMES.map((o) => chip(outcome === o, CONSULTATION_OUTCOME_AR[o], () => setOutcome(o), o))}
                </div>
              </div>
              <div>
                <label className={labelCls}>الأتعاب (ر.س)</label>
                <input value={feeSarText} onChange={(e) => setFeeSarText(e.target.value)} inputMode="decimal" placeholder="اختياري" className={inputCls} />
                {!feeValid && <p className="mt-1.5 text-[11px] font-semibold text-red-500">قيمة الأتعاب يجب أن تكون رقماً غير سالب.</p>}
              </div>
              <label className={`flex items-center gap-2 text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                <input type="checkbox" checked={feePaid} onChange={(e) => setFeePaid(e.target.checked)} className="accent-[#0B3D2E]" />
                مسدَّدة
              </label>
            </>
          )}

          {action === "cancel" && (
            <div>
              <label className={labelCls}>سبب الإلغاء (اختياري)</label>
              <textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className={`${inputCls} resize-none`} />
            </div>
          )}

          {action === "no_show" && (
            <p className={`text-[13px] ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>سيُسجَّل عدم حضور العميل لهذه الاستشارة.</p>
          )}

          {action === "opinion" && (
            opinionAlreadyDelivered ? (
              <div>
                <p className={`text-[12px] mb-2 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>سُلِّم الرأي القانوني مسبقاً — لا يمكن التراجع.</p>
                <div className={`rounded-xl border p-3 text-[13px] whitespace-pre-wrap leading-relaxed ${isDark ? "border-white/[0.08] bg-white/[0.03] text-zinc-300" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                  {consultation.opinionText}
                </div>
              </div>
            ) : (
              <div>
                <label className={labelCls}>نص الرأي القانوني <span className="text-red-500">*</span></label>
                <textarea rows={8} value={opinionText} onChange={(e) => setOpinionText(e.target.value)} className={`${inputCls} resize-none`} />
                <p className={`mt-1.5 text-[11px] font-semibold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                  يُسلَّم للعميل فوراً ويُختم وقت التسليم — لا يمكن التراجع
                </p>
              </div>
            )
          )}

          {action === "convert" && (
            alreadyConverted ? (
              <div className="space-y-2">
                <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>حُوِّلت هذه الاستشارة إلى قضية بالفعل.</p>
                <Link href={`${basePath}/cases/${consultation.convertedCaseRequestId}`} className="inline-block text-[12px] font-bold text-royal hover:underline">
                  افتح القضية
                </Link>
              </div>
            ) : (
              <div>
                <label className={labelCls}>عنوان القضية</label>
                <input value={convertTitle} onChange={(e) => setConvertTitle(e.target.value)} className={inputCls} />
                <p className={`mt-1.5 text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                  تُنشأ قضية جديدة مربوطة بهذه الاستشارة والموكّل، مرّة واحدة فقط
                </p>
              </div>
            )
          )}

          {showFooterButton && (
            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              className={`w-full rounded-xl py-2.5 text-[13px] font-bold transition mt-2 ${
                saving || !canSave
                  ? isDark ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : isDestructive
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22]"
              }`}
            >
              {saving ? "جارٍ الحفظ..." : SUBMIT_LABEL[action]}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
