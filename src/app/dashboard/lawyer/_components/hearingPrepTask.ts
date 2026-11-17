/**
 * hearingPrepTask — «إنشاء مهمة تحضير قبل الجلسة بـ 48 ساعة» (owner 13-Nov,
 * N01-15; spec 01 «الجسر 4»).
 *
 * AddHearingModal offers the option (checked by default) for a court sitting.
 * After the hearing is CONFIRMED saved, it creates one task through the
 * existing POST /api/v1/lawyer/tasks, linked to the same case. A task's due
 * date is a calendar day (tasks.due_date, YYYY-MM-DD), so «48 hours before»
 * is the hearing's day minus two Riyadh calendar days.
 *
 *   - a hearing already in the past: no task (null);
 *   - a hearing less than 48 h away: the task is due today, not in the past.
 *
 * Pure — `node --test` loads it (hearingPrepTask.test.ts).
 */
import { shiftDay } from "../../../../lib/riyadhDay.ts";
import { parseIsoDate } from "../../../../lib/services/deadlineEngine.ts";

export const PREP_TASK_LEAD_DAYS = 2;

/** Due day of the prep task, or null when none should be created. */
export function prepTaskDueDate(hearingDate: string, todayRiyadh: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hearingDate) || !parseIsoDate(hearingDate)) return null;
  if (hearingDate < todayRiyadh) return null;
  const due = shiftDay(hearingDate, -PREP_TASK_LEAD_DAYS);
  return due < todayRiyadh ? todayRiyadh : due;
}

/** «تحضير للجلسة — <القضية>», or the bare label when nothing names it. */
export function prepTaskTitle(caseOrLabel: string | null | undefined): string {
  const name = typeof caseOrLabel === "string" ? caseOrLabel.trim() : "";
  return name ? `تحضير للجلسة — ${name}` : "تحضير للجلسة";
}

/** The hearing's urgency carried onto the task (tasks.priority vocabulary). */
export function prepTaskPriority(urgency: string): "urgent" | "high" | "normal" {
  if (urgency === "critical") return "urgent";
  if (urgency === "high") return "high";
  return "normal";
}
