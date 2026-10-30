"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle, Info, SealWarning, Timer, ArrowLeft } from "@phosphor-icons/react";
import { toArabicDigits } from "@/lib/services/hijri";
import { computeDueDate, resolveHolidayDates, parseIsoDate } from "@/lib/services/deadlineEngine";
import DualDatePicker from "@/components/ui/DualDatePicker";
import ModalShell from "@/components/ui/ModalShell";
import { formatGregorianAr } from "@/app/dashboard/lawyer/_components/DeadlineCard";
import { degreeToDb } from "@/lib/services/caseStageVocabulary";
import { getDeadlineRules, getCourtHolidays, type DeadlineRule } from "@/lib/services/deadlinesService";
import type { HolidayRule } from "@/lib/services/deadlineEngine";
import { itemsOf, type ListRead } from "@/lib/services/listRead";
import {
  DEGREE_TO_AUTO_RULE_CODE, STAGE_TRIGGER_EVENTS, TRIGGER_EVENT_LABEL_AR, isFinalOutcome,
} from "@/lib/services/stageDeadlineSync";
import { describeAutoDeadline } from "@/lib/services/stageDeadlineCopy";
import {
  recordCaseStageOutcome,
  type CaseStage,
  type AutoDeadlineResult,
  type StageTriggerEvent,
} from "@/lib/services/caseStagesService";

interface Props {
  onClose: () => void;
  isDark: boolean;
  caseRequestId: string;
  stage: CaseStage;
  /**
   * Fired ONCE, the moment the server confirms the save (CODE-F06) — not when
   * the confirmation screen is dismissed. The parent refreshes its lists here
   * and must NOT close the modal: the confirmation stays on screen, and every
   * way out (×, backdrop, Escape, «إغلاق») only calls `onClose`.
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

const DEGREE_AR: Record<string, string> = {
  first_instance: "الابتدائية", appeal: "الاستئناف", cassation: "النقض", execution: "التنفيذ",
};

export default function RecordStageOutcomeModal({ onClose, isDark, caseRequestId, stage, onSaved }: Props) {
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoDeadline, setAutoDeadline] = useState<AutoDeadlineResult | null>(null);
  const [droppedForPending, setDroppedForPending] = useState(false);

  const initialOutcome: Outcome = stage.outcome && KNOWN_OUTCOMES.has(stage.outcome) ? (stage.outcome as Outcome) : "pending";
  const [outcome, setOutcome] = useState<Outcome>(initialOutcome);
  // CODE-F03: no default legal date. The field starts with the stored closing
  // date or EMPTY — the old "fill today" effect is gone (it is what turned
  // «قيد النظر» into a closed degree with a cassation deadline, LIVE-F15).
  const [closedOn, setClosedOn] = useState(stage.closedOn ?? "");
  const [triggerEvent, setTriggerEvent] = useState<StageTriggerEvent | "">(stage.triggerEvent ?? "");
  const [triggerDate, setTriggerDate] = useState(
    stage.triggerEvent && stage.triggerEvent !== "judgment_date" ? stage.triggerDate ?? "" : "",
  );
  const [notes, setNotes] = useState(stage.notes ?? "");

  const [rulesRead, setRulesRead] = useState<ListRead<DeadlineRule> | null>(null);
  const [holidaysRead, setHolidaysRead] = useState<ListRead<HolidayRule> | null>(null);
  useEffect(() => {
    let cancelled = false;
    getDeadlineRules().then((r) => { if (!cancelled) setRulesRead(r); });
    getCourtHolidays().then((r) => { if (!cancelled) setHolidaysRead(r); });
    return () => { cancelled = true; };
  }, []);

  const dbDegree = degreeToDb(stage.degree);
  const ruleCode = DEGREE_TO_AUTO_RULE_CODE[dbDegree];
  const rule = useMemo(
    () => itemsOf(rulesRead).find((r) => r.code === ruleCode && r.ownerUserId === null && r.active) ?? null,
    [rulesRead, ruleCode],
  );

  const final = isFinalOutcome(outcome);
  const effectiveTrigger = !final || !triggerEvent ? "" : triggerEvent === "judgment_date" ? closedOn : triggerDate;

  // The same engine and holidays the server uses — a preview, so the lawyer
  // sees the date (and, on a correction, the change) BEFORE saving (CODE-F04).
  const preview = useMemo(() => {
    if (!rule || !effectiveTrigger || !holidaysRead) return null;
    const year = parseIsoDate(effectiveTrigger)?.getFullYear();
    if (!year) return null;
    return computeDueDate({
      triggerDate: effectiveTrigger,
      periodDays: rule.periodDays,
      countFromNextDay: rule.countFromNextDay,
      rollForwardIfHoliday: rule.rollForwardIfHoliday,
      holidays: resolveHolidayDates(itemsOf(holidaysRead), year, year + 1),
    });
  }, [rule, effectiveTrigger, holidaysRead]);

  const linked = stage.linkedDeadline ?? null;
  const willMove = !!linked && linked.status === "open" && !!preview && preview.dueDate !== linked.dueDate;
  const linkedClosed = !!linked && linked.status !== "open";

  const dirty =
    outcome !== initialOutcome || closedOn !== (stage.closedOn ?? "") ||
    triggerEvent !== (stage.triggerEvent ?? "") || notes !== (stage.notes ?? "") ||
    triggerDate !== (stage.triggerEvent && stage.triggerEvent !== "judgment_date" ? stage.triggerDate ?? "" : "");

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${
    isDark
      ? "border-white/[0.08] bg-zinc-800 text-zinc-200 focus:border-[#C8A762]"
      : "border-zinc-200 bg-zinc-50 text-zinc-800 focus:border-[#0B3D2E]"
  }`;
  const labelCls = `block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`;
  const hintCls = `mt-1.5 text-[11px] ${isDark ? "text-zinc-500" : "text-slate-500"}`;
  const panelCls = `rounded-xl p-3 text-right space-y-1.5 ${isDark ? "bg-white/[0.04] border border-white/[0.06]" : "bg-slate-50 border border-slate-100"}`;
  const chipCls = `rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-slate-100 text-slate-600"}`;
  const amberChipCls = `flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700"}`;
  const linkCls = `inline-block pt-1 text-[11px] font-bold hover:underline ${isDark ? "text-emerald-300" : "text-emerald-700"}`;

  const dateMissing = final && !closedOn;
  const triggerDateMissing = final && (triggerEvent === "copy_received" || triggerEvent === "notified") && !triggerDate;
  const triggerBeforeJudgment = final && !!triggerDate && !!closedOn && triggerEvent !== "judgment_date" && triggerDate < closedOn;
  const blocked = dateMissing || triggerDateMissing || triggerBeforeJudgment;

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
        aria-pressed={selected}
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
    if (blocked) {
      setError(dateMissing ? "تاريخ صدور الحكم مطلوب لتسجيل نتيجة نهائية" : "أكمل تاريخ بدء المهلة أو اختر حدثاً آخر");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // «قيد النظر» sends no closing date and no trigger: the degree stays open.
      const res = await recordCaseStageOutcome(caseRequestId, final
        ? {
            id: stage.id,
            outcome,
            closedOn: closedOn || null,
            notes,
            triggerEvent: triggerEvent || null,
            triggerDate: triggerEvent && triggerEvent !== "judgment_date" ? triggerDate || null : null,
          }
        : { id: stage.id, outcome, closedOn: null, notes, triggerEvent: null });
      setAutoDeadline(res.autoDeadline);
      setDroppedForPending(res.droppedForPending);
      setDone(true);
      onSaved(res.stage ?? stage, res.autoDeadline);
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

  const notice = autoDeadline ? describeAutoDeadline(autoDeadline) : null;
  const noticeDeadline = autoDeadline && "deadline" in autoDeadline ? autoDeadline.deadline : null;

  return (
    <ModalShell title="تسجيل نتيجة الدرجة" onClose={onClose} isDark={isDark} busy={saving} dirty={!done && dirty}>
      {done ? (
        <div className="text-center py-4">
          <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
            <CheckCircle size={28} weight="fill" className="text-emerald-500" />
          </div>
          <p className={`font-bold text-[16px] ${isDark ? "text-white" : "text-zinc-900"}`} role="status">
            {final ? "سُجِّلت النتيجة" : "سُجِّلت الدرجة «قيد النظر» — ما زالت مفتوحة"}
          </p>
          {droppedForPending && (
            <p className={hintCls}>لم يُحفظ تاريخ إغلاق ولا حدث مهلة لأن الدرجة ما زالت قيد النظر.</p>
          )}

          {notice && (
            <div className={`mt-4 ${panelCls}`} role="status">
              <p className={`flex items-center gap-1.5 text-[12px] font-bold ${
                notice.tone === "warning" ? (isDark ? "text-amber-400" : "text-amber-700")
                : notice.tone === "changed" ? (isDark ? "text-sky-300" : "text-sky-700")
                : isDark ? "text-zinc-100" : "text-zinc-900"
              }`}>
                <Timer size={13} /> {notice.heading}
              </p>
              {notice.showDeadline && noticeDeadline && (
                <>
                  <p className={`text-[12.5px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{noticeDeadline.title}</p>
                  {notice.change ? (
                    <p className={`flex flex-wrap items-center gap-1 text-[12px] ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      <span className="line-through opacity-70">{formatGregorianAr(notice.change.fromDueDate)}</span>
                      <ArrowLeft size={11} aria-label="إلى" />
                      <span className="font-bold">{formatGregorianAr(notice.change.toDueDate)}</span>
                    </p>
                  ) : (
                    <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                      {formatGregorianAr(noticeDeadline.dueDate)}
                      {noticeDeadline.dueDateHijri ? ` · ${noticeDeadline.dueDateHijri}` : ""}
                      {noticeDeadline.daysCount !== null ? ` · خلال ${toArabicDigits(noticeDeadline.daysCount)} يوماً` : ""}
                    </p>
                  )}
                  {noticeDeadline.rolledFromHoliday && (
                    <p className={`flex items-center gap-1 text-[11px] ${isDark ? "text-amber-400" : "text-amber-600"}`}>
                      <Info size={11} /> رُحِّلت لأول يوم عمل بعد عطلة/عطلة نهاية الأسبوع
                    </p>
                  )}
                  {noticeDeadline.ruleTitleAr && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className={chipCls}>{noticeDeadline.ruleTitleAr}</span>
                      {noticeDeadline.ruleVerified === false && (
                        <span className={amberChipCls}><SealWarning size={10} /> قاعدة افتراضية — تحتاج مراجعتك</span>
                      )}
                    </div>
                  )}
                </>
              )}
              {notice.linkToRadar && (
                <Link href="/dashboard/lawyer/deadlines" className={linkCls}>افتح رادار المهل</Link>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-xl px-5 py-2.5 w-full text-[13px] font-bold bg-[#0B3D2E] text-white hover:bg-[#0B3D2E]/90 transition"
          >
            إغلاق
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div role="alert" className={`rounded-xl px-3 py-2 text-[12px] font-semibold ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
              {error}
            </div>
          )}

          <fieldset>
            <legend className={labelCls}>النتيجة <span className="text-red-500">*</span></legend>
            <div className="grid grid-cols-3 gap-2">
              {OUTCOME_OPTIONS.map(outcomeBtn)}
            </div>
            {!final && (
              <p className={hintCls}>«قيد النظر» يُبقي الدرجة مفتوحة: لا تاريخ إغلاق ولا مهلة اعتراض حتى تُسجَّل نتيجة نهائية.</p>
            )}
          </fieldset>

          {final && (
            <>
              <div>
                <label className={labelCls}>
                  تاريخ صدور الحكم (إغلاق الدرجة) <span className="text-red-500">*</span>
                </label>
                <DualDatePicker label="تاريخ صدور الحكم" value={closedOn} onChange={setClosedOn} clearable={false} className={inputCls} />
                {dateMissing && <p className="mt-1.5 text-[11px] font-semibold text-red-500">اختر تاريخ صدور الحكم — لا يُفترض تاريخ تلقائياً</p>}
              </div>

              {ruleCode && (
                <fieldset>
                  <legend className={labelCls}>تبدأ مهلة الاعتراض من</legend>
                  <div className="space-y-1.5" role="radiogroup">
                    {STAGE_TRIGGER_EVENTS.map((ev) => (
                      <label key={ev} className={`flex items-center gap-2 text-[12.5px] ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                        <input
                          type="radio"
                          name={`trigger-${stage.id}`}
                          value={ev}
                          checked={triggerEvent === ev}
                          onChange={() => setTriggerEvent(ev)}
                        />
                        {TRIGGER_EVENT_LABEL_AR[ev]}
                      </label>
                    ))}
                    <label className={`flex items-center gap-2 text-[12.5px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                      <input type="radio" name={`trigger-${stage.id}`} value="" checked={triggerEvent === ""} onChange={() => setTriggerEvent("")} />
                      لم يُحدَّد بعد — لا تُحسب مهلة الآن
                    </label>
                  </div>
                  {(triggerEvent === "copy_received" || triggerEvent === "notified") && (
                    <div className="mt-2">
                      <DualDatePicker label={TRIGGER_EVENT_LABEL_AR[triggerEvent]} value={triggerDate} onChange={setTriggerDate} clearable className={inputCls} min={closedOn || undefined} />
                      {closedOn && !triggerDate && (
                        <button type="button" onClick={() => setTriggerDate(closedOn)} className={linkCls}>
                          في يوم صدور الحكم نفسه
                        </button>
                      )}
                      {triggerBeforeJudgment && <p className="mt-1.5 text-[11px] font-semibold text-red-500">لا يسبق تاريخ صدور الحكم</p>}
                    </div>
                  )}
                </fieldset>
              )}

              {ruleCode && (
                <div className={panelCls}>
                  {rule ? (
                    <>
                      <p className={`text-[12px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
                        القاعدة: {rule.titleAr} — {toArabicDigits(rule.periodDays)} يوماً
                      </p>
                      <p className={`text-[11.5px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                        تنطبق لأن الدرجة {DEGREE_AR[dbDegree] ?? ""} انتهت بنتيجة نهائية. {rule.descriptionAr}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {rule.sourceAr && <span className={chipCls}>{rule.sourceAr}</span>}
                        {!rule.verifiedByOwner && (
                          <span className={amberChipCls}><SealWarning size={10} /> قاعدة افتراضية — تحتاج مراجعتك</span>
                        )}
                      </div>
                      {triggerEvent === "judgment_date" && (
                        <p className={`flex items-start gap-1 text-[11px] ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                          <Info size={11} className="mt-0.5 shrink-0" /> نصّ القاعدة يحتسب من تسلّم صورة الحكم أو التبليغ به؛ اختر «صدور الحكم» فقط إن كان هو يوم التسلّم.
                        </p>
                      )}
                      {preview && (
                        <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                          آخر موعد بحسب ما أدخلت: {formatGregorianAr(preview.dueDate)}
                          {preview.rolledFromHoliday ? " (رُحِّل بسبب عطلة)" : ""}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className={`text-[11.5px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                      {rulesRead && !rulesRead.ok ? "تعذّر عرض قاعدة المهلة الآن — سيحسبها الخادم عند الحفظ." : "جارٍ قراءة قاعدة المهلة…"}
                    </p>
                  )}
                  {willMove && linked && preview && (
                    <p className={`text-[12px] font-bold ${isDark ? "text-sky-300" : "text-sky-700"}`} role="status">
                      سيُعاد احتساب المهلة المرتبطة: من {formatGregorianAr(linked.dueDate)} إلى {formatGregorianAr(preview.dueDate)}
                    </p>
                  )}
                  {linkedClosed && (
                    <p className={`text-[11.5px] font-semibold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                      المهلة المرتبطة مُغلقة في الرادار، فلن تُعدَّل تلقائياً.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {!final && linked && linked.status === "open" && (
            <p className={`text-[11.5px] font-semibold ${isDark ? "text-amber-400" : "text-amber-700"}`} role="status">
              عند الحفظ «قيد النظر» تُلغى المهلة المحسوبة سابقاً لهذه الدرجة ({formatGregorianAr(linked.dueDate)}).
            </p>
          )}

          <div>
            <label className={labelCls} htmlFor={`stage-notes-${stage.id}`}>ملاحظات</label>
            <textarea id={`stage-notes-${stage.id}`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} resize-none`} />
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || blocked}
            className={`w-full rounded-xl py-2.5 text-[13px] font-bold transition mt-2 ${
              saving || blocked
                ? isDark ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"
                : "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#092e22]"
            }`}
          >
            {saving ? "جارٍ الحفظ..." : "حفظ النتيجة"}
          </button>
        </div>
      )}
    </ModalShell>
  );
}
