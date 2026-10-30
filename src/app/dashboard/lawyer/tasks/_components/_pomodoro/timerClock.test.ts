import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  idleTimer, start, pause, phaseOf, activeMs, remainingSec, completionAt,
  completedSession, partialSession, parseStoredTimer,
} from "./timerClock.ts";

const T0 = Date.parse("2026-10-29T09:00:00.000Z");
const MIN = 60_000;
const TASK = { id: "11111111-1111-4111-8111-111111111111", title: "صياغة لائحة" };

test("CODE-F08: resume continues from the active time spent — the start time is kept", () => {
  let t = start(idleTimer("focus", "s1", TASK), T0);
  t = pause(t, T0 + 10 * MIN);
  assert.equal(phaseOf(t), "paused");
  // ten minutes of pause do not count
  assert.equal(activeMs(t, T0 + 20 * MIN), 10 * MIN);
  t = start(t, T0 + 20 * MIN);
  assert.equal(t.startedAt, new Date(T0).toISOString());
  assert.equal(activeMs(t, T0 + 25 * MIN), 15 * MIN);
  assert.equal(remainingSec(t, T0 + 25 * MIN), 10 * 60);
});

test("CODE-F08: time comes from timestamps — a throttled tab that wakes late shows the true value", () => {
  const t = start(idleTimer("focus", "s1"), T0);
  // no ticks at all for 7m30s
  assert.equal(remainingSec(t, T0 + 7.5 * MIN), 17 * 60 + 30);
  assert.equal(remainingSec(t, T0 + 999), 25 * 60 - 0); // 24:59.001 rounds up to 25:00
});

test("LIVE-F17: a stored running period comes back with the same value and task after a reload", () => {
  const t = start(idleTimer("focus", "s1", TASK), T0);
  const restored = parseStoredTimer(JSON.parse(JSON.stringify(t)));
  assert.ok(restored);
  assert.equal(phaseOf(restored), "running");
  assert.equal(restored.taskId, TASK.id);
  assert.equal(restored.taskTitle, TASK.title);
  assert.equal(remainingSec(restored, T0 + 3 * MIN), 22 * 60); // not 25:00
});

test("LIVE-F17 policy: a period that ran out while the page was closed completes at the moment it ran out", () => {
  let t = start(idleTimer("focus", "s1", TASK), T0);
  t = pause(t, T0 + 5 * MIN);
  t = start(t, T0 + 10 * MIN);
  assert.equal(completionAt(t, T0 + 20 * MIN), null);
  const comeBack = T0 + 3 * 60 * MIN; // three hours later
  const at = completionAt(t, comeBack);
  assert.equal(at, T0 + 30 * MIN); // 5 min + 20 min after the resume at +10
  const s = completedSession(t, at!, ["rain"]);
  assert.equal(s.id, "s1");
  assert.equal(s.completed, true);
  assert.equal(s.durationMin, 25);
  assert.equal(s.endedAt, new Date(T0 + 30 * MIN).toISOString());
  assert.equal(s.startedAt, new Date(T0).toISOString());
  assert.equal(s.taskId, TASK.id);
});

test("CODE-F08: a paused period never completes on its own", () => {
  const t = pause(start(idleTimer("short", "s1"), T0), T0 + MIN);
  assert.equal(completionAt(t, T0 + 99 * MIN), null);
});

test("CODE-F08: reset while PAUSED saves the partial (the old engine saved nothing)", () => {
  let t = start(idleTimer("focus", "s1", TASK), T0);
  t = pause(t, T0 + 12 * MIN + 40_000);
  const s = partialSession(t, T0 + 40 * MIN, []);
  assert.ok(s);
  assert.equal(s.completed, false);
  assert.equal(s.durationMin, 12);
  assert.equal(s.endedAt, new Date(T0 + 12 * MIN + 40_000).toISOString()); // ended at the pause
  assert.equal(s.taskId, TASK.id);
});

test("partial under MIN_SAVE_DURATION, or a period never started, is not saved", () => {
  const t = start(idleTimer("focus", "s1"), T0);
  assert.equal(partialSession(t, T0 + 4 * MIN + 59_000, []), null);
  assert.equal(partialSession(idleTimer("focus", "s2"), T0, []), null);
});

test("a corrupt or foreign stored record starts fresh instead of crashing", () => {
  assert.equal(parseStoredTimer(null), null);
  assert.equal(parseStoredTimer("x"), null);
  assert.equal(parseStoredTimer({ ...idleTimer("focus", "s"), v: 2 }), null);
  assert.equal(parseStoredTimer({ ...idleTimer("focus", "s"), mode: "nap" }), null);
  assert.equal(parseStoredTimer({ ...idleTimer("focus", "s"), segmentStartedAt: T0 }), null); // running but never started
  assert.ok(parseStoredTimer(idleTimer("long", "s")));
});

// Wiring — the engine is lifted to the page and persisted, no tick counting.
const ENGINE = readFileSync(new URL("./usePomodoroEngine.ts", import.meta.url), "utf8");
const PAGE = readFileSync(new URL("../../page.tsx", import.meta.url), "utf8");

test("CODE-F08 wiring: the engine never counts ticks and persists the period by user scope", () => {
  assert.equal(/setTimeLeft\(\s*cur\s*=>/.test(ENGINE), false);
  assert.match(ENGINE, /activeTimerStorageKey\(/);
  assert.match(ENGINE, /queueStorageKey\(/);
  assert.match(ENGINE, /visibilitychange/);
});

test("the engine sets no state on a plain tick — the board is not re-rendered every second", () => {
  const tick = ENGINE.slice(ENGINE.indexOf("const tick = useCallback"), ENGINE.indexOf("// ── restore on load"));
  assert.equal(/set[A-Z]\w*\(/.test(tick), false);
  assert.match(ENGINE, /export function usePomodoroClock\(/);
});

test("LIVE-F17 wiring: the page owns the engine, so closing the panel does not end the period", () => {
  assert.match(PAGE, /usePomodoroEngine\(/);
  assert.match(PAGE, /<PomodoroPanel[\s\S]*?engine=\{pomodoro\}/);
});
