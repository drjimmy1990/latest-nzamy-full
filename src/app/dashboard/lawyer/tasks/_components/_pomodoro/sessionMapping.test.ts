import test from "node:test";
import assert from "node:assert/strict";
import {
  isPostableSession,
  pomodoroSessionToWorkSessionInput,
  workSessionToPomodoroSession,
  getWeekStats,
  getHourStats,
  generateInsights,
} from "./sessionMapping.ts";
import type { PomodoroSession } from "./types.ts";
import type { WorkSession } from "../../../../../../lib/services/workSessionsService.ts";

function session(overrides: Partial<PomodoroSession> = {}): PomodoroSession {
  return {
    id: "1",
    mode: "focus",
    startedAt: "2026-09-04T09:00:00.000Z",
    endedAt: "2026-09-04T09:25:00.000Z",
    taskTitle: undefined,
    completed: true,
    durationMin: 25,
    noises: [],
    ...overrides,
  };
}

function workSession(overrides: Partial<WorkSession> = {}): WorkSession {
  return {
    id: "srv-1",
    mode: "focus",
    startedAt: "2026-09-04T09:00:00.000Z",
    endedAt: "2026-09-04T09:25:00.000Z",
    durationMin: 25,
    completed: true,
    taskId: null,
    label: "",
    createdAt: "2026-09-04T09:25:00.000Z",
    ...overrides,
  };
}

// ─── isPostableSession ──────────────────────────────────────────────────────

test("isPostableSession: accepts a normal completed session", () => {
  assert.equal(isPostableSession(session()), true);
});

test("isPostableSession: rejects durationMin out of 1..600 or non-integer", () => {
  assert.equal(isPostableSession(session({ durationMin: 0 })), false);
  assert.equal(isPostableSession(session({ durationMin: 601 })), false);
  assert.equal(isPostableSession(session({ durationMin: 12.5 })), false);
  assert.equal(isPostableSession(session({ durationMin: 600 })), true);
  assert.equal(isPostableSession(session({ durationMin: 1 })), true);
});

test("isPostableSession: rejects an unparsable startedAt", () => {
  assert.equal(isPostableSession(session({ startedAt: "not-a-date" })), false);
});

test("isPostableSession: rejects endedAt before startedAt, accepts endedAt === startedAt or after, and a missing endedAt", () => {
  assert.equal(isPostableSession(session({ startedAt: "2026-09-04T09:00:00.000Z", endedAt: "2026-09-04T08:59:59.000Z" })), false);
  assert.equal(isPostableSession(session({ startedAt: "2026-09-04T09:00:00.000Z", endedAt: "2026-09-04T09:00:00.000Z" })), true);
  assert.equal(isPostableSession(session({ endedAt: "" })), true); // falsy endedAt is treated as absent
});

// ─── pomodoroSessionToWorkSessionInput ──────────────────────────────────────

test("pomodoroSessionToWorkSessionInput: maps focus/short/long to the server's mode names", () => {
  assert.equal(pomodoroSessionToWorkSessionInput(session({ mode: "focus" })).mode, "focus");
  assert.equal(pomodoroSessionToWorkSessionInput(session({ mode: "short" })).mode, "short_break");
  assert.equal(pomodoroSessionToWorkSessionInput(session({ mode: "long" })).mode, "long_break");
});

test("pomodoroSessionToWorkSessionInput: taskId is always null (only a title string exists client-side)", () => {
  const input = pomodoroSessionToWorkSessionInput(session({ taskTitle: "قضية ١٢٣" }));
  assert.equal(input.taskId, null);
  assert.equal(input.label, "قضية ١٢٣");
});

test("pomodoroSessionToWorkSessionInput: label is trimmed and clamped to 120 chars, and a missing title becomes ''", () => {
  assert.equal(pomodoroSessionToWorkSessionInput(session({ taskTitle: "  spaced  " })).label, "spaced");
  assert.equal(pomodoroSessionToWorkSessionInput(session({ taskTitle: undefined })).label, "");
  const long = "a".repeat(200);
  assert.equal((pomodoroSessionToWorkSessionInput(session({ taskTitle: long })).label ?? "").length, 120);
});

test("pomodoroSessionToWorkSessionInput: carries startedAt/endedAt/durationMin/completed through unchanged", () => {
  const input = pomodoroSessionToWorkSessionInput(session({ completed: false, durationMin: 5 }));
  assert.equal(input.startedAt, "2026-09-04T09:00:00.000Z");
  assert.equal(input.endedAt, "2026-09-04T09:25:00.000Z");
  assert.equal(input.durationMin, 5);
  assert.equal(input.completed, false);
});

// ─── workSessionToPomodoroSession ───────────────────────────────────────────

test("workSessionToPomodoroSession: maps the server's mode names back to focus/short/long", () => {
  assert.equal(workSessionToPomodoroSession(workSession({ mode: "focus" })).mode, "focus");
  assert.equal(workSessionToPomodoroSession(workSession({ mode: "short_break" })).mode, "short");
  assert.equal(workSessionToPomodoroSession(workSession({ mode: "long_break" })).mode, "long");
});

test("workSessionToPomodoroSession: noises is always [] — not a work_sessions column, an honest omission", () => {
  assert.deepEqual(workSessionToPomodoroSession(workSession()).noises, []);
});

test("workSessionToPomodoroSession: an empty label becomes an undefined taskTitle; a non-empty one passes through", () => {
  assert.equal(workSessionToPomodoroSession(workSession({ label: "" })).taskTitle, undefined);
  assert.equal(workSessionToPomodoroSession(workSession({ label: "مهمة" })).taskTitle, "مهمة");
});

test("workSessionToPomodoroSession: a null endedAt falls back to startedAt rather than being omitted", () => {
  const mapped = workSessionToPomodoroSession(workSession({ endedAt: null, startedAt: "2026-09-04T09:00:00.000Z" }));
  assert.equal(mapped.endedAt, "2026-09-04T09:00:00.000Z");
});

// ─── Analytics helpers (kept pure; exercised over a fixed clock-independent shape) ──

test("getWeekStats: always returns exactly 7 days, ending on today", () => {
  const week = getWeekStats([]);
  assert.equal(week.length, 7);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(week[6].date, today);
});

test("getWeekStats: counts only focus-mode sessions from today into today's bucket", () => {
  const now = new Date();
  const todayIso = now.toISOString();
  const sessions: PomodoroSession[] = [
    session({ id: "a", mode: "focus", startedAt: todayIso, durationMin: 25, completed: true }),
    session({ id: "b", mode: "short", startedAt: todayIso, durationMin: 5, completed: true }), // excluded: not focus
  ];
  const week = getWeekStats(sessions);
  const todayBucket = week[week.length - 1];
  assert.equal(todayBucket.focusMin, 25);
  assert.equal(todayBucket.sessions, 1);
  assert.equal(todayBucket.completed, 1);
});

test("getHourStats: returns 24 buckets and places focus minutes in the session's own local hour", () => {
  const iso = "2026-09-04T09:30:00.000Z";
  const expectedHour = new Date(iso).getHours(); // local hour, not necessarily 09 — avoids a timezone-dependent test
  const hours = getHourStats([session({ mode: "focus", startedAt: iso, durationMin: 25 })]);
  assert.equal(hours.length, 24);
  assert.equal(hours[expectedHour].focusMin, 25);
});

test("generateInsights: an empty log yields no insights", () => {
  assert.deepEqual(generateInsights([]), []);
});

test("generateInsights: a completed focus session yields at least a completion-rate insight", () => {
  const insights = generateInsights([session({ mode: "focus", completed: true, durationMin: 25 })]);
  assert.ok(insights.length > 0);
  assert.ok(insights.some(i => i.title === "معدل إتمام الفترات"));
});
