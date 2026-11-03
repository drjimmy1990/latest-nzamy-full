/**
 * stageDeadlineCopy.ts — the Arabic sentence for each thing the stage-outcome
 * hook can do to a deadline (owner package 2026-10-30: «لا تجاهل صامت»).
 *
 * One honest line per result, never implying a deadline exists when none
 * does, and never hiding that one moved or was cancelled. Pure, so the
 * wording is pinned by `node --test`; RecordStageOutcomeModal renders it.
 */

import type { AutoDeadlineResult, AutoDeadlineSkipReason, CaseStage, LinkedStageDeadline } from "./caseStagesService.ts";

/**
 * The stage row a list should hold after a save: the PATCH answer plus the
 * linked deadline as the hook left it — so reopening the form still knows
 * what a further correction would move. `undefined` linked = unknown (keep
 * whatever the list had).
 */
export function mergeSavedStage(previous: CaseStage, saved: CaseStage, result: AutoDeadlineResult | null): CaseStage {
  let linked: LinkedStageDeadline | null | undefined = previous.linkedDeadline;
  if (result) {
    if ("deadline" in result) {
      linked = {
        id: result.deadline.id,
        status: result.action === "kept" ? result.deadlineStatus : "open",
        dueDate: result.deadline.dueDate,
        triggerDate: saved.triggerDate ?? previous.linkedDeadline?.triggerDate ?? "",
      };
    } else if (result.action === "cancelled") {
      linked = null;
    }
  }
  return { ...previous, ...saved, linkedDeadline: linked };
}

export const SKIP_REASON_TEXT: Record<AutoDeadlineSkipReason, string> = {
  outcome_pending: "«قيد النظر» لا يُغلق الدرجة ولا يحسب مهلة — تُحسب بعد تسجيل نتيجة نهائية.",
  no_trigger: "لم تُحسب مهلة: لم تحدّد الحدث الذي تبدأ منه المهلة (صدور الحكم أو تسلّم صورته أو التبليغ به).",
  no_rule_for_degree: "لا مهلة نظامية تلي هذه الدرجة.",
  rule_missing: "قاعدة المهلة غير مفعّلة على المنصّة — أضف المهلة يدوياً من الرادار.",
  compute_failed: "تعذّر حساب المهلة تلقائياً — أضفها يدوياً من رادار المهل.",
  insert_failed: "تعذّر حساب المهلة تلقائياً — أضفها يدوياً من رادار المهل.",
  no_closed_on: "لم تُحسب مهلة: لا تاريخ إغلاق.",
  already_exists: "المهلة التالية مسجَّلة مسبقاً في رادار المهل.",
};

/** Reasons whose sentence sends the lawyer to the radar to add it by hand. */
export const SKIP_REASON_LINK: ReadonlySet<AutoDeadlineSkipReason> = new Set(["rule_missing", "compute_failed", "insert_failed"]);

const STATUS_AR: Record<string, string> = {
  done: "مُنجزة", cancelled: "ملغاة", missed: "فائتة", open: "مفتوحة",
};

export interface AutoDeadlineNotice {
  tone: "info" | "changed" | "warning";
  heading: string;
  /** The deadline the notice is about, when there is one. */
  showDeadline: boolean;
  /** A "from → to" line for a recomputed deadline. */
  change?: { fromDueDate: string; toDueDate: string; fromTriggerDate: string };
  linkToRadar: boolean;
}

export function describeAutoDeadline(result: AutoDeadlineResult): AutoDeadlineNotice {
  if (result.created) {
    return { tone: "info", heading: "حُسبت مهلة نظامية تلقائياً", showDeadline: true, linkToRadar: true };
  }
  switch (result.action) {
    case "recomputed":
      return {
        tone: "changed",
        heading: "أُعيد احتساب المهلة المرتبطة بعد تعديل التاريخ",
        showDeadline: true,
        change: { fromDueDate: result.previous.dueDate, toDueDate: result.deadline.dueDate, fromTriggerDate: result.previous.triggerDate },
        linkToRadar: true,
      };
    case "unchanged":
      return { tone: "info", heading: "المهلة المرتبطة محسوبة من التاريخ نفسه — لم تتغيّر", showDeadline: true, linkToRadar: true };
    case "kept":
      return {
        tone: "warning",
        heading: `لم تُعدَّل المهلة المرتبطة لأنها ${STATUS_AR[result.deadlineStatus] ?? "مُغلقة"} — أعد فتحها من الرادار إن لزم تعديلها`,
        showDeadline: true,
        linkToRadar: true,
      };
    case "cancelled":
      return {
        tone: "warning",
        heading: result.skipped === "outcome_pending"
          ? "أُلغيت المهلة المحسوبة سابقاً لأن النتيجة عادت «قيد النظر»"
          : "أُلغيت المهلة المحسوبة سابقاً لأن حدث بدء المهلة أُزيل",
        showDeadline: false,
        linkToRadar: true,
      };
    default:
      return {
        tone: result.skipped === "outcome_pending" || result.skipped === "no_rule_for_degree" ? "info" : "warning",
        heading: SKIP_REASON_TEXT[result.skipped] ?? SKIP_REASON_TEXT.insert_failed,
        showDeadline: false,
        linkToRadar: SKIP_REASON_LINK.has(result.skipped),
      };
  }
}
