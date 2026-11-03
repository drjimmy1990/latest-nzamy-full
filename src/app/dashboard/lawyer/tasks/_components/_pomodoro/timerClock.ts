// ─── Pomodoro Pro — the timer as timestamps (pure) ──────────────────────────
//
// CODE-F08 / LIVE-F17 (owner review of 0d5273ea, live test 29-Oct). The old
// engine counted interval ticks (`setTimeLeft(cur => cur - 1)` once a second)
// and kept the period in component state only, so:
//   • a background tab throttles setInterval → the clock drifted slow;
//   • «استئناف» after a pause reset the start time, so the saved session lied
//     about when it began and how long it ran;
//   • «إعادة ضبط» while PAUSED saved nothing (the partial save required
//     `running`);
//   • switching mode or closing the panel threw the period away;
//   • a reload came back at 25:00 with no task linked.
//
// The period is now a small record of timestamps — when it began, when the
// current run began, how much active time came before — and every number on
// screen is derived from it and `now`. Nothing counts ticks; an interval only
// asks React to re-render. The record is what gets persisted (see
// `usePomodoroEngine.ts`), so a reload or a closed panel restores the same
// period, value and task.
//
// POLICY (documented here because it is what the lawyer gets):
//   • Pause keeps the period open; resume continues from the active time
//     already spent (the original start time is kept).
//   • A running period keeps running while the page or the panel is closed.
//     If it ran out while away, it is recorded as COMPLETE at the moment it
//     ran out, not at the moment the lawyer came back.
//   • «إنهاء الفترة» (reset), switching mode, or finishing early — from either
//     running or paused — closes the period as PARTIAL, saved when it had at
//     least MIN_SAVE_DURATION minutes of active time, discarded otherwise.
//   • The linked task is fixed for the life of a period; it can be changed
//     once the period is closed.
//
// Pure: no React, no storage, no `Date.now()` — `now` is always passed in.

import { DURATIONS, MIN_SAVE_DURATION, type NoiseChannel, type PomodoroMode, type PomodoroSession } from "./types.ts";

export interface ActiveTimer {
  v: 1;
  /** Becomes the work_sessions row id — the same id on every retry (CODE-F09). */
  sessionId: string;
  mode: PomodoroMode;
  plannedMs: number;
  /** ISO instant of the period's FIRST start; null while idle. */
  startedAt: string | null;
  /** Epoch ms the current run began; null while paused or idle. */
  segmentStartedAt: number | null;
  /** Active ms from runs before the current one. */
  accumulatedMs: number;
  /** Epoch ms of the last pause; null otherwise. */
  pausedAt: number | null;
  taskId: string | null;
  taskTitle: string;
}

export type TimerPhase = "idle" | "running" | "paused";

export interface TaskLink {
  id: string | null;
  title: string;
}

export function idleTimer(mode: PomodoroMode, sessionId: string, link: TaskLink = { id: null, title: "" }): ActiveTimer {
  return {
    v: 1,
    sessionId,
    mode,
    plannedMs: DURATIONS[mode] * 1000,
    startedAt: null,
    segmentStartedAt: null,
    accumulatedMs: 0,
    pausedAt: null,
    taskId: link.id,
    taskTitle: link.title,
  };
}

export function phaseOf(t: ActiveTimer): TimerPhase {
  if (t.segmentStartedAt !== null) return "running";
  if (t.startedAt !== null) return "paused";
  return "idle";
}

/** Active (not paused) ms spent in the period at `now`, capped at the plan. */
export function activeMs(t: ActiveTimer, now: number): number {
  const run = t.segmentStartedAt !== null ? Math.max(0, now - t.segmentStartedAt) : 0;
  return Math.min(t.plannedMs, t.accumulatedMs + run);
}

export function remainingMs(t: ActiveTimer, now: number): number {
  return Math.max(0, t.plannedMs - activeMs(t, now));
}

/** Whole seconds left, rounded UP so 24:59.4 shows 25:00 → 24:59 at the right moment. */
export function remainingSec(t: ActiveTimer, now: number): number {
  return Math.ceil(remainingMs(t, now) / 1000);
}

export function start(t: ActiveTimer, now: number): ActiveTimer {
  if (t.segmentStartedAt !== null) return t;
  return {
    ...t,
    startedAt: t.startedAt ?? new Date(now).toISOString(),
    segmentStartedAt: now,
    pausedAt: null,
  };
}

export function pause(t: ActiveTimer, now: number): ActiveTimer {
  if (t.segmentStartedAt === null) return t;
  return { ...t, accumulatedMs: activeMs(t, now), segmentStartedAt: null, pausedAt: now };
}

/** The epoch ms the period ran out, or null if it has not (yet) — only a running period can. */
export function completionAt(t: ActiveTimer, now: number): number | null {
  if (t.segmentStartedAt === null) return null;
  const at = t.segmentStartedAt + (t.plannedMs - t.accumulatedMs);
  return at <= now ? at : null;
}

/** The finished period as a log entry — ended exactly when it ran out. */
export function completedSession(t: ActiveTimer, endedAtMs: number, noises: NoiseChannel[]): PomodoroSession {
  return {
    id: t.sessionId,
    mode: t.mode,
    startedAt: t.startedAt ?? new Date(endedAtMs - t.plannedMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    taskId: t.taskId,
    taskTitle: t.taskTitle || undefined,
    completed: true,
    durationMin: Math.round(t.plannedMs / 60000),
    noises: [...noises],
  };
}

/**
 * The period closed early, as a log entry — or null when it is too short to
 * keep (under MIN_SAVE_DURATION active minutes) or never started. Works the
 * same from running and from paused: the old engine saved nothing when paused.
 */
export function partialSession(t: ActiveTimer, now: number, noises: NoiseChannel[]): PomodoroSession | null {
  if (t.startedAt === null) return null;
  const minutes = Math.floor(activeMs(t, now) / 60000);
  if (minutes < MIN_SAVE_DURATION) return null;
  const endedAt = t.segmentStartedAt !== null ? now : (t.pausedAt ?? now);
  return {
    id: t.sessionId,
    mode: t.mode,
    startedAt: t.startedAt,
    endedAt: new Date(Math.max(endedAt, Date.parse(t.startedAt))).toISOString(),
    taskId: t.taskId,
    taskTitle: t.taskTitle || undefined,
    completed: false,
    durationMin: minutes,
    noises: [...noises],
  };
}

const MODES: readonly PomodoroMode[] = ["focus", "short", "long"];

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * A stored record back into an ActiveTimer — or null for anything malformed
 * or from another version, so a corrupt key starts a fresh idle timer instead
 * of crashing the page.
 */
export function parseStoredTimer(raw: unknown): ActiveTimer | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return null;
  if (typeof r.sessionId !== "string" || !r.sessionId) return null;
  if (typeof r.mode !== "string" || !MODES.includes(r.mode as PomodoroMode)) return null;
  if (!isNum(r.plannedMs) || r.plannedMs <= 0) return null;
  if (r.startedAt !== null && (typeof r.startedAt !== "string" || Number.isNaN(Date.parse(r.startedAt)))) return null;
  if (r.segmentStartedAt !== null && !isNum(r.segmentStartedAt)) return null;
  if (!isNum(r.accumulatedMs) || r.accumulatedMs < 0) return null;
  if (r.pausedAt !== null && !isNum(r.pausedAt)) return null;
  if (r.taskId !== null && typeof r.taskId !== "string") return null;
  if (typeof r.taskTitle !== "string") return null;
  if (r.startedAt === null && r.segmentStartedAt !== null) return null;
  return {
    v: 1,
    sessionId: r.sessionId,
    mode: r.mode as PomodoroMode,
    plannedMs: r.plannedMs,
    startedAt: r.startedAt as string | null,
    segmentStartedAt: r.segmentStartedAt as number | null,
    accumulatedMs: r.accumulatedMs,
    pausedAt: r.pausedAt as number | null,
    taskId: r.taskId as string | null,
    taskTitle: r.taskTitle,
  };
}
