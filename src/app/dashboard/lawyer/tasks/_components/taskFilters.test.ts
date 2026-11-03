import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TASK_FILTERS, visibleTasks, groupTasks, matchesTimeRange, rangeEnd, monthsAfter,
  dueSectionOf, activeFilterChips, clearFilter, dateFilterPending, panelFilterCount, type TaskFilters,
} from "./taskFilters.ts";
import type { Task } from "../_types.ts";

const TODAY = "2026-10-29";

function task(id: string, over: Partial<Task> = {}): Task {
  return { id, title: `مهمة ${id}`, category: "case", priority: "normal", status: "todo", ...over };
}

function f(over: Partial<TaskFilters> = {}): TaskFilters {
  return { ...DEFAULT_TASK_FILTERS, ...over };
}

// The owner's LIVE-F27 board on 29 October: one task due today, one due 1 Nov,
// one with no date.
const BOARD: Task[] = [
  task("today", { dueDate: "2026-10-29" }),
  task("nov1", { dueDate: "2026-11-01" }),
  task("nodate"),
];

test("LIVE-F27: «اليوم» keeps only the task due today — not 1 Nov, not the undated one", () => {
  const v = visibleTasks(BOARD, f({ timeRange: "today" }), { today: TODAY });
  assert.deepEqual(v.map(t => t.id), ["today"]);
});

test("LIVE-F27: list and kanban read the same sections — every grouping sums to the visible count", () => {
  const filters = f({ timeRange: "today" });
  const v = visibleTasks(BOARD, filters, { today: TODAY });
  for (const g of ["status", "priority", "category", "due"] as const) {
    const sections = groupTasks(v, g, { today: TODAY, archive: false });
    const ids = sections.flatMap(s => s.tasks.map(t => t.id));
    assert.deepEqual(ids.sort(), v.map(t => t.id).sort(), `grouping ${g}`);
  }
  const todo = groupTasks(v, "status", { today: TODAY, archive: false }).find(s => s.key === "todo")!;
  assert.equal(todo.tasks.length, 1); // the «معلقة» header and its cards are one array
});

test("CODE-F10: priority/category/due groupings no longer bypass the other filters", () => {
  const tasks = [
    task("a", { priority: "urgent", category: "document", dueDate: "2026-11-20" }),
    task("b", { priority: "urgent", category: "case", dueDate: "2026-10-29" }),
  ];
  const v = visibleTasks(tasks, f({ category: "case" }), { today: TODAY });
  const urgent = groupTasks(v, "priority", { today: TODAY, archive: false }).find(s => s.key === "urgent")!;
  assert.deepEqual(urgent.tasks.map(t => t.id), ["b"]);
});

test("CODE-F10: an undated task passes «الكل» and «بلا تاريخ» only", () => {
  for (const r of ["today", "week", "month", "quarter", "year"] as const) {
    assert.equal(matchesTimeRange(null, r, TODAY), false, r);
  }
  assert.equal(matchesTimeRange(null, "all", TODAY), true);
  assert.equal(matchesTimeRange(null, "nodate", TODAY), true);
  assert.equal(matchesTimeRange("2026-10-29", "nodate", TODAY), false);
  const v = visibleTasks(BOARD, f({ timeRange: "nodate" }), { today: TODAY });
  assert.deepEqual(v.map(t => t.id), ["nodate"]);
});

test("LIVE-F38: a timestamp due value is read as its Riyadh day", () => {
  // 22:30 UTC on the 28th is 01:30 on the 29th in Riyadh.
  const v = visibleTasks([task("ts", { dueDate: "2026-10-28T22:30:00Z" })], f({ timeRange: "today" }), { today: TODAY });
  assert.equal(v.length, 1);
});

test("period ends are Riyadh calendar days, month ends clamped", () => {
  assert.equal(rangeEnd("today", TODAY), TODAY);
  assert.equal(rangeEnd("week", TODAY), "2026-11-05");
  assert.equal(rangeEnd("month", "2026-01-31"), "2026-02-28");
  assert.equal(rangeEnd("quarter", TODAY), "2027-01-29");
  assert.equal(rangeEnd("year", TODAY), "2027-10-29");
  assert.equal(monthsAfter("2026-12-15", 1), "2027-01-15");
  assert.equal(rangeEnd("all", TODAY), null);
  assert.equal(rangeEnd("nodate", TODAY), null);
});

test("a period filter waits for the day instead of showing everything", () => {
  assert.equal(dateFilterPending(f({ timeRange: "today" }), ""), true);
  assert.equal(dateFilterPending(f({ timeRange: "all" }), ""), false);
  assert.equal(dateFilterPending(f({ timeRange: "nodate" }), ""), false);
  assert.equal(dateFilterPending(f({ timeRange: "today" }), TODAY), false);
});

test("«الموعد» grouping: every task lands somewhere, undated and past-done included", () => {
  assert.equal(dueSectionOf(task("x", { dueDate: "2026-10-20" }), TODAY), "overdue");
  assert.equal(dueSectionOf(task("x", { dueDate: "2026-10-20", status: "done" }), TODAY), "past_done");
  assert.equal(dueSectionOf(task("x", { dueDate: TODAY }), TODAY), "today");
  assert.equal(dueSectionOf(task("x", { dueDate: "2026-11-05" }), TODAY), "week");
  assert.equal(dueSectionOf(task("x", { dueDate: "2026-11-06" }), TODAY), "later");
  assert.equal(dueSectionOf(task("x"), TODAY), "nodate");
});

test("archive view: archived tasks only, still filtered; archived-case tasks leave the active board", () => {
  const tasks = [
    task("a1", { status: "archived", priority: "high" }),
    task("a2", { status: "archived", priority: "low" }),
    task("onClosedCase", { caseId: "c-closed" }),
    task("live"),
  ];
  const arch = visibleTasks(tasks, f({ showArchive: true, priority: "high" }), { today: TODAY });
  assert.deepEqual(arch.map(t => t.id), ["a1"]);
  const active = visibleTasks(tasks, f(), { today: TODAY, archivedCaseIds: new Set(["c-closed"]) });
  assert.deepEqual(active.map(t => t.id), ["live"]);
  assert.deepEqual(groupTasks(arch, "status", { today: TODAY, archive: true }).map(s => s.key), ["archive"]);
});

test("sorted by priority, then earliest due day, undated last", () => {
  const v = visibleTasks([
    task("n-late", { dueDate: "2026-12-01" }),
    task("n-none"),
    task("u", { priority: "urgent" }),
    task("n-soon", { dueDate: "2026-10-30" }),
  ], f(), { today: TODAY });
  assert.deepEqual(v.map(t => t.id), ["u", "n-soon", "n-late", "n-none"]);
});

test("UX09: chips name every narrowing filter; clearing one leaves the rest; panel count excludes the quick row", () => {
  const filters = f({ timeRange: "month", priority: "urgent", category: "client", search: " عقد ", showArchive: true });
  assert.deepEqual(activeFilterChips(filters).map(c => c.key), ["showArchive", "timeRange", "priority", "category", "search"]);
  assert.equal(activeFilterChips(DEFAULT_TASK_FILTERS).length, 0);
  const cleared = clearFilter(filters, "priority");
  assert.equal(cleared.priority, "all");
  assert.equal(cleared.category, "client");
  assert.equal(panelFilterCount(filters), 4);
  assert.equal(panelFilterCount(f({ timeRange: "today" })), 0);
});

test("UX09 acceptance: a task hidden by filters comes back after clearing all of them", () => {
  const tasks = [task("hidden", { status: "archived", priority: "low" })];
  const narrowed = f({ timeRange: "today", priority: "urgent" });
  assert.equal(visibleTasks(tasks, narrowed, { today: TODAY }).length, 0);
  // «الأرشيف» chip + «مسح الفلاتر» = the defaults; the archive view needs its own toggle
  assert.equal(visibleTasks(tasks, { ...DEFAULT_TASK_FILTERS, showArchive: true }, { today: TODAY }).length, 1);
});
