import { test } from "node:test";
import assert from "node:assert/strict";

import {
  daysBetweenIso,
  urgentCaseTasks,
  nextOpenDeadline,
  type UrgentTaskInput,
  type NextDeadlineInput,
} from "./caseOverviewCockpit.ts";

// ─── daysBetweenIso ──────────────────────────────────────────────────────────

test("daysBetweenIso: positive, negative and zero", () => {
  assert.equal(daysBetweenIso("2026-09-04", "2026-09-11"), 7);
  assert.equal(daysBetweenIso("2026-09-04", "2026-09-01"), -3);
  assert.equal(daysBetweenIso("2026-09-04", "2026-09-04"), 0);
});

test("daysBetweenIso: crosses a month boundary correctly", () => {
  assert.equal(daysBetweenIso("2026-08-30", "2026-09-02"), 3);
});

test("daysBetweenIso: malformed input yields NaN, not a wrong number", () => {
  assert.ok(Number.isNaN(daysBetweenIso("not-a-date", "2026-09-04")));
  assert.ok(Number.isNaN(daysBetweenIso("2026-09-04", "")));
});

// ─── urgentCaseTasks ─────────────────────────────────────────────────────────

const TODAY = "2026-09-04";

function task(over: Partial<UrgentTaskInput> & { id: string }): UrgentTaskInput {
  return { title: "مهمة", status: "todo", dueDate: null, ...over };
}

test("urgentCaseTasks: excludes done tasks even when overdue", () => {
  const rows = urgentCaseTasks([task({ id: "1", status: "done", dueDate: "2026-09-01" })], TODAY);
  assert.deepEqual(rows, []);
});

test("urgentCaseTasks: excludes tasks with no due date", () => {
  const rows = urgentCaseTasks([task({ id: "1", dueDate: null }), task({ id: "2" })], TODAY);
  assert.deepEqual(rows, []);
});

test("urgentCaseTasks: includes an overdue task with a negative daysLeft", () => {
  const rows = urgentCaseTasks([task({ id: "1", dueDate: "2026-09-01" })], TODAY);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].daysLeft, -3);
});

test("urgentCaseTasks: includes due-today (0) and the 7-day boundary, excludes day 8", () => {
  const rows = urgentCaseTasks(
    [
      task({ id: "today", dueDate: "2026-09-04" }),
      task({ id: "boundary", dueDate: "2026-09-11" }), // +7
      task({ id: "past-boundary", dueDate: "2026-09-12" }), // +8, excluded
    ],
    TODAY,
  );
  const ids = rows.map((r) => r.id);
  assert.deepEqual(ids, ["today", "boundary"]);
});

test("urgentCaseTasks: sorts soonest/most-overdue first", () => {
  const rows = urgentCaseTasks(
    [
      task({ id: "soon", dueDate: "2026-09-06" }),
      task({ id: "late", dueDate: "2026-08-30" }),
      task({ id: "today", dueDate: "2026-09-04" }),
    ],
    TODAY,
  );
  assert.deepEqual(rows.map((r) => r.id), ["late", "today", "soon"]);
});

test("urgentCaseTasks: an in-progress task counts the same as a not-started one", () => {
  const rows = urgentCaseTasks([task({ id: "1", status: "inprogress", dueDate: "2026-09-05" })], TODAY);
  assert.equal(rows.length, 1);
});

test("urgentCaseTasks: respects a custom window", () => {
  const rows = urgentCaseTasks([task({ id: "1", dueDate: "2026-09-06" })], TODAY, 1);
  assert.deepEqual(rows, []);
});

// ─── nextOpenDeadline ────────────────────────────────────────────────────────

function deadline(over: Partial<NextDeadlineInput> & { id: string; dueDate: string }): NextDeadlineInput {
  return { title: "مهلة", status: "open", ...over };
}

test("nextOpenDeadline: null when there are no deadlines", () => {
  assert.equal(nextOpenDeadline([], TODAY), null);
});

test("nextOpenDeadline: ignores missed, done and cancelled", () => {
  const rows: NextDeadlineInput[] = [
    deadline({ id: "1", status: "missed", dueDate: "2026-09-01" }),
    deadline({ id: "2", status: "done", dueDate: "2026-09-05" }),
    deadline({ id: "3", status: "cancelled", dueDate: "2026-09-06" }),
  ];
  assert.equal(nextOpenDeadline(rows, TODAY), null);
});

test("nextOpenDeadline: picks the soonest open deadline due today or later", () => {
  const rows: NextDeadlineInput[] = [
    deadline({ id: "far", status: "open", dueDate: "2026-09-20" }),
    deadline({ id: "near", status: "open", dueDate: "2026-09-05" }),
    deadline({ id: "past", status: "open", dueDate: "2026-09-01" }), // before today — not "next"
  ];
  const next = nextOpenDeadline(rows, TODAY);
  assert.ok(next);
  assert.equal(next.id, "near");
  assert.equal(next.daysLeft, 1);
});

test("nextOpenDeadline: an open deadline due exactly today is next, daysLeft 0", () => {
  const next = nextOpenDeadline([deadline({ id: "1", dueDate: TODAY })], TODAY);
  assert.ok(next);
  assert.equal(next.daysLeft, 0);
});
