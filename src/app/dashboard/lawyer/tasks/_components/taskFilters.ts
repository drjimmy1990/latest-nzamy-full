/**
 * taskFilters.ts — the ONE filtered task list for the tasks page, and the
 * groupings both views draw from it.
 * ─────────────────────────────────────────────────────────
 * CODE-F10 / LIVE-F27 (owner review of 0d5273ea, live test 29-Oct): the page
 * used to build its list from two different pipelines. Grouped by «حالة
 * المهمة» it went through every filter; grouped by الأولوية / النوع / الموعد
 * it read `activeVisible`, which only applied the title search — so «اليوم»
 * showed a task due 1 November in the kanban on 29 October while the list
 * hid it. A task with no due date also passed every period filter («اليوم»
 * included tasks that have no day at all).
 *
 * Now: `visibleTasks()` applies every filter once, then `groupTasks()` splits
 * that same array into sections. The list, the kanban columns, the column
 * counters and the result count all read the output of these two functions,
 * so they cannot disagree. «بلا تاريخ» is its own explicit period choice.
 *
 * Days are Riyadh calendar days ("YYYY-MM-DD", LIVE-F38) passed in by the
 * caller from useRiyadhToday — never read here — so `node --test` can pin
 * them. A due value that is a timestamp is read as the Riyadh day it falls on.
 *
 * Pure: no React, no I/O.
 */

import { riyadhDayOf, shiftDay } from "../../../../../lib/riyadhDay.ts";
import type { Priority, Task, TaskCategory, TaskStatus, TimeRange, KanbanGroupBy } from "../_types.ts";

export interface TaskFilters {
  timeRange: TimeRange;
  priority: Priority | "all";
  category: TaskCategory | "all";
  search: string;
  /** The archive is a view of its own: archived tasks only, still filtered. */
  showArchive: boolean;
}

export const DEFAULT_TASK_FILTERS: TaskFilters = {
  timeRange: "all",
  priority: "all",
  category: "all",
  search: "",
  showArchive: false,
};

export const PRIORITY_ORDER: Priority[] = ["urgent", "high", "normal", "low"];
export const CATEGORY_ORDER: TaskCategory[] = ["case", "document", "deadline", "admin", "client"];
export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];

/** Days inside «الأسبوع» counted after today — the same 7 the «هذا الأسبوع» section uses. */
export const WEEK_DAYS = 7;

/** "YYYY-MM-DD" `months` calendar months after `day`, clamped to that month's end. */
export function monthsAfter(day: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + months;
  const d = Number(m[3]);
  const ty = y + Math.floor(mo / 12);
  const tm = ((mo % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const dd = Math.min(d, last);
  return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** The inclusive last day of a period starting today; null for «الكل» / «بلا تاريخ». */
export function rangeEnd(range: TimeRange, today: string): string | null {
  if (range === "today") return today;
  if (range === "week") return shiftDay(today, WEEK_DAYS);
  if (range === "month") return monthsAfter(today, 1);
  if (range === "quarter") return monthsAfter(today, 3);
  if (range === "year") return monthsAfter(today, 12);
  return null;
}

/** True when the period filter needs today's date and it is not known yet. */
export function dateFilterPending(filters: TaskFilters, today: string): boolean {
  return !today && filters.timeRange !== "all" && filters.timeRange !== "nodate";
}

/** The Riyadh day a task is due on, or null when it has none. */
export function taskDueDay(task: Pick<Task, "dueDate">): string | null {
  return riyadhDayOf(task.dueDate ?? null);
}

/**
 * Does a due value fall in a period? A task without a date belongs to «الكل»
 * and «بلا تاريخ» only — never implicitly to «اليوم» or any other period.
 */
export function matchesTimeRange(due: string | null, range: TimeRange, today: string): boolean {
  if (range === "all") return true;
  if (range === "nodate") return due === null;
  if (due === null || !today) return false;
  const end = rangeEnd(range, today);
  return due >= today && (end === null || due <= end);
}

function matchesSearch(task: Task, query: string): boolean {
  return !query || task.title.toLowerCase().includes(query);
}

/**
 * The ONE filtered list. `archivedCaseIds`: tasks hanging off a closed or
 * archived case stay out of the active board (they still show in the archive
 * view only if archived themselves). Sorted by priority, then due day
 * (earliest first, undated last), stable otherwise.
 */
export function visibleTasks(
  tasks: readonly Task[],
  filters: TaskFilters,
  ctx: { today: string; archivedCaseIds?: ReadonlySet<string> },
): Task[] {
  const query = filters.search.trim().toLowerCase();
  const archivedCases = ctx.archivedCaseIds ?? new Set<string>();
  const pool = filters.showArchive
    ? tasks.filter(t => t.status === "archived")
    : tasks.filter(t => t.status !== "archived" && (!t.caseId || !archivedCases.has(t.caseId)));

  const out = pool
    .filter(t => filters.category === "all" || t.category === filters.category)
    .filter(t => filters.priority === "all" || t.priority === filters.priority)
    .filter(t => matchesSearch(t, query))
    .filter(t => matchesTimeRange(taskDueDay(t), filters.timeRange, ctx.today));

  return out
    .map((t, i) => ({ t, i, due: taskDueDay(t) }))
    .sort((a, b) => {
      const p = PRIORITY_ORDER.indexOf(a.t.priority) - PRIORITY_ORDER.indexOf(b.t.priority);
      if (p !== 0) return p;
      if (a.due !== b.due) {
        if (a.due === null) return 1;
        if (b.due === null) return -1;
        return a.due < b.due ? -1 : 1;
      }
      return a.i - b.i;
    })
    .map(x => x.t);
}

/** Section keys of the «الموعد» grouping. */
export type DueSection = "overdue" | "today" | "week" | "later" | "past_done" | "nodate";
export const DUE_SECTION_ORDER: DueSection[] = ["overdue", "today", "week", "later", "nodate", "past_done"];

/** Which «الموعد» section a task belongs to. Every task lands in exactly one. */
export function dueSectionOf(task: Task, today: string): DueSection {
  const due = taskDueDay(task);
  if (due === null) return "nodate";
  if (due < today) return task.status === "done" ? "past_done" : "overdue";
  if (due === today) return "today";
  if (due <= shiftDay(today, WEEK_DAYS)) return "week";
  return "later";
}

export interface TaskSection {
  key: string;
  tasks: Task[];
}

/**
 * Split the ONE visible list into sections. Every task of `visible` appears
 * in exactly one section (the archive view is one section), so the sum of
 * section lengths is always `visible.length`.
 */
export function groupTasks(
  visible: readonly Task[],
  groupBy: KanbanGroupBy,
  opts: { today: string; archive: boolean },
): TaskSection[] {
  if (opts.archive) return [{ key: "archive", tasks: [...visible] }];
  if (groupBy === "status") {
    return STATUS_ORDER.map(s => ({ key: s, tasks: visible.filter(t => t.status === s) }));
  }
  if (groupBy === "priority") {
    return PRIORITY_ORDER.map(p => ({ key: p, tasks: visible.filter(t => t.priority === p) }));
  }
  if (groupBy === "category") {
    return CATEGORY_ORDER.map(c => ({ key: c, tasks: visible.filter(t => t.category === c) }));
  }
  return DUE_SECTION_ORDER.map(k => ({ key: k, tasks: visible.filter(t => dueSectionOf(t, opts.today) === k) }));
}

// ─── Active-filter chips (UX09) ───────────────────────────────────────────────

export type FilterChipKey = "timeRange" | "priority" | "category" | "search" | "showArchive";

export const TIME_RANGE_LABELS_AR: Record<TimeRange, string> = {
  all: "الكل",
  today: "اليوم",
  week: "الأسبوع",
  month: "هذا الشهر",
  quarter: "هذا الربع",
  year: "هذه السنة",
  nodate: "بلا تاريخ",
};

export const PRIORITY_LABELS_AR: Record<Priority, string> = {
  urgent: "عاجل", high: "عالية", normal: "عادية", low: "منخفضة",
};

export const CATEGORY_LABELS_AR: Record<TaskCategory, string> = {
  case: "قضية", document: "مستند", deadline: "ميعاد", admin: "إداري", client: "موكل",
};

export interface FilterChip {
  key: FilterChipKey;
  label: string;
}

/** One chip per filter that is narrowing the list — each removable on its own. */
export function activeFilterChips(filters: TaskFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.showArchive) chips.push({ key: "showArchive", label: "الأرشيف" });
  if (filters.timeRange !== "all") chips.push({ key: "timeRange", label: `الفترة: ${TIME_RANGE_LABELS_AR[filters.timeRange]}` });
  if (filters.priority !== "all") chips.push({ key: "priority", label: `الأولوية: ${PRIORITY_LABELS_AR[filters.priority]}` });
  if (filters.category !== "all") chips.push({ key: "category", label: `النوع: ${CATEGORY_LABELS_AR[filters.category]}` });
  if (filters.search.trim()) chips.push({ key: "search", label: `بحث: «${filters.search.trim()}»` });
  return chips;
}

/** Reset one filter to its default. */
export function clearFilter(filters: TaskFilters, key: FilterChipKey): TaskFilters {
  return { ...filters, [key]: DEFAULT_TASK_FILTERS[key] };
}

/** How many filters inside the «فلاتر» panel are set (the quick period row and search are outside it). */
export function panelFilterCount(filters: TaskFilters): number {
  let n = 0;
  if (filters.timeRange !== "all" && filters.timeRange !== "today" && filters.timeRange !== "week") n++;
  if (filters.priority !== "all") n++;
  if (filters.category !== "all") n++;
  if (filters.showArchive) n++;
  return n;
}
