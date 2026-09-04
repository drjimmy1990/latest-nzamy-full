/**
 * caseOverviewCockpit.ts — pure derivations behind the case file's «نظرة
 * عامة» tab (src/app/dashboard/lawyer/cases/[id]/page.tsx).
 *
 * Two things a lawyer opening a case needs to see WITHOUT switching tabs:
 * which of this case's open tasks are due soon or already late, and which
 * of its deadlines comes next. Both are derived from data the page already
 * loads (its tasks read and its deadlines read, both eager on mount) — no
 * new fetch, no new table.
 *
 * DELIBERATELY IMPORT-FREE of React and of anything under src/app, so
 * `node --test` can load it directly — the same discipline
 * businessOverview.ts and clientDashboardCards.ts already follow. Chip
 * wording/colour is NOT computed here: `daysLeftChip` in
 * ../../app/dashboard/lawyer/_components/DeadlineCard.tsx already owns that
 * phrasing for the whole app (رادار المهل and this case file both use it).
 * This module hands back the plain `daysLeft` integer and the page formats
 * it through that shared chip.
 */

// ─── Day arithmetic on wall-clock dates ────────────────────────────────────
//
// `dueDate` on a task/deadline row is a wall-clock "YYYY-MM-DD", not an
// instant — the same kind of string `hearings.hearing_date` is (see this
// page's own `formatHearingDate`). Comparing two such strings by calendar
// day must not go through `new Date(iso)` (that parses as UTC midnight and
// drifts a day for any reader west of Riyadh); everything below stays in
// UTC day numbers derived directly from the string's digits.

function isoToUtcDays(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

/**
 * Whole calendar days from `fromIso` to `toIso` (both "YYYY-MM-DD").
 * Negative when `toIso` is before `fromIso`; `NaN` when either string is not
 * a plain ISO date.
 */
export function daysBetweenIso(fromIso: string, toIso: string): number {
  return isoToUtcDays(toIso) - isoToUtcDays(fromIso);
}

// ─── مهام عاجلة — urgent tasks ──────────────────────────────────────────────

export interface UrgentTaskInput {
  id: string;
  title: string;
  /** This page's TaskStatus ("todo" | "inprogress" | "done") — only "done" is excluded, so any other string still counts as open. */
  status: string;
  /** Wall-clock "YYYY-MM-DD", same shape as hearings.hearing_date / deadlines.dueDate. */
  dueDate?: string | null;
}

export interface UrgentTaskRow {
  id: string;
  title: string;
  dueDate: string;
  /** Negative = overdue, 0 = due today, positive = days remaining. */
  daysLeft: number;
}

/**
 * Not-done tasks carrying a due date within `windowDays` of `todayIso`
 * (inclusive), or already overdue — soonest/most-overdue first.
 *
 * A task with NO due date is not "urgent" by this measure: that is a fact
 * about scheduling, not urgency, and is not this list's job to surface (the
 * task tab's own «لم تبدأ» count already covers unscheduled work).
 */
export function urgentCaseTasks(
  tasks: readonly UrgentTaskInput[],
  todayIso: string,
  windowDays = 7,
): UrgentTaskRow[] {
  const rows: UrgentTaskRow[] = [];
  for (const t of tasks) {
    if (t.status === "done" || !t.dueDate) continue;
    const daysLeft = daysBetweenIso(todayIso, t.dueDate);
    if (!Number.isFinite(daysLeft) || daysLeft > windowDays) continue;
    rows.push({ id: t.id, title: t.title, dueDate: t.dueDate, daysLeft });
  }
  return rows.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
}

// ─── المهلة القادمة — next open deadline ────────────────────────────────────

export interface NextDeadlineInput {
  id: string;
  title: string;
  status: string;
  /** Wall-clock "YYYY-MM-DD". */
  dueDate: string;
}

export interface NextDeadlineRow {
  id: string;
  title: string;
  dueDate: string;
  /** Always >= 0 — a past-due OPEN deadline is "missed" by the API, not "next" (see the filter below). */
  daysLeft: number;
}

/**
 * The soonest deadline still `status === "open"` and due today or later —
 * `null` when there is none.
 *
 * Only "open" counts: "missed" is already overdue and unresolved (its own
 * tab surfaces it in red), "done"/"cancelled" are history. Mixing any of
 * those into "next" would print a deadline that no longer needs anyone's
 * attention as if it still did.
 */
export function nextOpenDeadline(deadlines: readonly NextDeadlineInput[], todayIso: string): NextDeadlineRow | null {
  let best: NextDeadlineInput | null = null;
  for (const d of deadlines) {
    if (d.status !== "open" || d.dueDate < todayIso) continue;
    if (!best || d.dueDate < best.dueDate) best = d;
  }
  if (!best) return null;
  return { id: best.id, title: best.title, dueDate: best.dueDate, daysLeft: daysBetweenIso(todayIso, best.dueDate) };
}
