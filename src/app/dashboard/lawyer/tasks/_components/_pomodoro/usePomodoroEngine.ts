"use client";
// ─── Pomodoro Pro — Timer Engine Hook ───────────────────────────────────────
//
// CODE-F07 / CODE-F08 / CODE-F09 / LIVE-F17. This hook is called by the tasks
// PAGE, not by PomodoroPanel: the panel mounts only while «مؤقت التركيز» is
// open, so an engine living inside it died with every close (and every
// reload). The page passes the engine down to the panel and to every
// TaskCard, whose «تتبع الوقت» button now starts this same engine for that
// task instead of flipping a local flag.
//
// What it holds:
//   • the active period as timestamps (`./timerClock.ts` — read its header for
//     the pause / finish / close POLICY), persisted on every transition under
//     the signed-in user's id, so a reload restores the same period, value
//     and task;
//   • the outbox of finished periods (`./sessionQueue.ts`), persisted the same
//     way and flushed to the server with retries; a period is only "saved"
//     once the server answered with its row.
//
// The engine's interval only checks for completion; the seconds on screen are
// read by `usePomodoroClock` in the views that show them. Every number is
// computed from timestamps, so a throttled background tab cannot drift the
// clock.

import { useState, useRef, useCallback, useEffect } from "react";
import type { PomodoroMode, PomodoroSession, ActiveNoise } from "./types";
import {
  loadSessions, saveSession, postSessionIdempotent, readStoredJson, writeStoredJson,
  workSessionToPomodoroSession,
} from "./storage";
import {
  idleTimer, start, pause, phaseOf, remainingSec, completionAt, completedSession, partialSession,
  parseStoredTimer, type ActiveTimer, type TaskLink, type TimerPhase,
} from "./timerClock";
import {
  enqueueSession, entriesToSend, markAttempt, markFailed, markSynced, isPermanentFailure,
  parseStoredQueue, queueStorageKey, activeTimerStorageKey, type QueueEntry,
} from "./sessionQueue";

/** A v4 uuid — it becomes the work_sessions row id, so it must be one. */
function newSessionId(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && "randomUUID" in c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const linkOf = (t: ActiveTimer): TaskLink => ({ id: t.taskId, title: t.taskTitle });
/** The initial render has no id yet (ids are minted in the browser, never during SSR). */
const withId = (t: ActiveTimer): ActiveTimer => (t.sessionId ? t : { ...t, sessionId: newSessionId() });
const RETRY_EVERY_MS = 60_000;

export type StartForTaskResult = "started" | "toggled" | "busy";

export interface UsePomodoroEngineOptions {
  /** Storage scope: the signed-in user's id, "demo" in demo mode, null while unknown (nothing is restored or saved until then). */
  scope: string | null;
  /** Send finished periods to /api/v1/lawyer/work-sessions (signed in, supabase mode). */
  useServer: boolean;
  onFocusComplete?: () => void;
}

export function usePomodoroEngine({ scope, useServer, onFocusComplete }: UsePomodoroEngineOptions) {
  const [timer, setTimer]       = useState<ActiveTimer>(() => idleTimer("focus", ""));
  const [ready, setReady]       = useState(false);
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
  const [queue, setQueue]       = useState<QueueEntry[]>([]);
  const [recentlySynced, setRecentlySynced] = useState<PomodoroSession[]>([]);
  const [pomCount, setPomCount] = useState(0);
  const [notif, setNotif]       = useState<PomodoroMode | null>(null);
  const [noises, setNoises]     = useState<ActiveNoise[]>([]);

  const timerRef     = useRef(timer);
  const queueRef     = useRef<QueueEntry[]>([]);
  const scopeRef     = useRef(scope);
  const useServerRef = useRef(useServer);
  const noisesRef    = useRef(noises);
  const onCompleteRef = useRef(onFocusComplete);
  const flushingRef  = useRef(false);
  const notifTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  scopeRef.current = scope;
  useServerRef.current = useServer;
  noisesRef.current = noises;
  onCompleteRef.current = onFocusComplete;

  // ── persistence ────────────────────────────────────────────────────────────
  const commitTimer = useCallback((next: ActiveTimer) => {
    timerRef.current = next;
    setTimer(next);
    const s = scopeRef.current;
    if (s) writeStoredJson(activeTimerStorageKey(s), next);
  }, []);

  const commitQueue = useCallback((next: QueueEntry[]) => {
    queueRef.current = next;
    setQueue(next);
    const s = scopeRef.current;
    if (s) writeStoredJson(queueStorageKey(s), next.length ? next : null);
  }, []);

  // ── outbox flush ───────────────────────────────────────────────────────────
  // One pass at a time per tab; another tab flushing the same entry is safe
  // because the route is idempotent by session id.
  const flush = useCallback(async (manual: boolean) => {
    if (!useServerRef.current || flushingRef.current) return;
    flushingRef.current = true;
    try {
      for (const entry of entriesToSend(queueRef.current, { manual })) {
        const id = entry.session.id;
        commitQueue(markAttempt(queueRef.current, id, Date.now()));
        const res = await postSessionIdempotent(entry.session);
        if (res.ok) {
          commitQueue(markSynced(queueRef.current, id));
          const row = workSessionToPomodoroSession(res.saved);
          setRecentlySynced(prev => [row, ...prev.filter(s => s.id !== row.id)].slice(0, 50));
        } else {
          commitQueue(markFailed(queueRef.current, id, res.error, isPermanentFailure(res.status), Date.now()));
          if (res.status === null) break; // offline — the rest would fail the same way
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [commitQueue]);

  /** A finished period: to the outbox when signed in, to the demo log otherwise. */
  const recordSession = useCallback((session: PomodoroSession) => {
    if (useServerRef.current) {
      commitQueue(enqueueSession(queueRef.current, session, Date.now()));
      void flush(false);
    } else {
      setSessions(saveSession(session));
    }
  }, [commitQueue, flush]);

  const finishCompleted = useCallback((t: ActiveTimer, at: number) => {
    recordSession(completedSession(t, at, noisesRef.current.map(n => n.channel)));
    if (t.mode === "focus") {
      setPomCount(c => c + 1);
      onCompleteRef.current?.();
    }
    setNotif(t.mode);
    if (notifTimer.current) clearTimeout(notifTimer.current);
    notifTimer.current = setTimeout(() => setNotif(null), 4000);
    commitTimer(idleTimer(t.mode, newSessionId(), linkOf(t)));
  }, [recordSession, commitTimer]);

  /** Close the period early — partial saved if long enough (see timerClock POLICY). */
  const closePartial = useCallback((t: ActiveTimer, at: number) => {
    const partial = partialSession(t, at, noisesRef.current.map(n => n.channel));
    if (partial) recordSession(partial);
  }, [recordSession]);

  /** Re-read the clock; finish the period if it ran out (also after a long sleep). */
  const tick = useCallback(() => {
    const at = Date.now();
    const t = timerRef.current;
    const done = completionAt(t, at);
    if (done !== null) finishCompleted(t, done);
  }, [finishCompleted]);

  // ── restore on load / account change (LIVE-F17) ────────────────────────────
  useEffect(() => {
    setSessions(loadSessions());
  }, []);

  useEffect(() => {
    if (!scope) return;
    queueRef.current = parseStoredQueue(readStoredJson(queueStorageKey(scope)));
    setQueue(queueRef.current);
    setRecentlySynced([]);
    const stored = parseStoredTimer(readStoredJson(activeTimerStorageKey(scope)));
    const t = stored ?? idleTimer("focus", newSessionId());
    const at = Date.now();
    const done = completionAt(t, at);
    if (done !== null) finishCompleted(t, done); // ran out while the page was closed
    else commitTimer(t);
    setReady(true);
    void flush(false);
    // Restores once per scope; the callbacks are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // Sign-in resolved after the scope (or the reverse) — flush what is waiting.
  useEffect(() => {
    if (useServer && ready) void flush(false);
  }, [useServer, ready, flush]);

  // ── the clock: check, never count ──────────────────────────────────────────
  // This interval only looks for the moment the period runs out (through
  // refs — no state is set unless it did), so the tasks board this hook lives
  // on is NOT re-rendered every second. The seconds on screen come from
  // `usePomodoroClock` inside the two small views that show them.
  const phase: TimerPhase = phaseOf(timer);
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, tick]);

  // A background tab's interval is throttled; coming back re-reads at once.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
    };
  }, [tick]);

  // Retry the outbox when the connection returns and once a minute while it holds anything.
  const hasQueued = queue.some(e => !e.permanent);
  useEffect(() => {
    const onOnline = () => { void flush(false); };
    window.addEventListener("online", onOnline);
    const id = hasQueued ? setInterval(() => { void flush(false); }, RETRY_EVERY_MS) : undefined;
    return () => {
      window.removeEventListener("online", onOnline);
      if (id) clearInterval(id);
    };
  }, [hasQueued, flush]);

  // Another tab of the same account changed the period or the outbox.
  useEffect(() => {
    if (!scope) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === activeTimerStorageKey(scope)) {
        let parsed: ActiveTimer | null = null;
        try { parsed = parseStoredTimer(e.newValue ? JSON.parse(e.newValue) : null); } catch { parsed = null; }
        if (parsed) { timerRef.current = parsed; setTimer(parsed); }
      } else if (e.key === queueStorageKey(scope)) {
        let parsed: QueueEntry[] = [];
        try { parsed = parseStoredQueue(e.newValue ? JSON.parse(e.newValue) : []); } catch { parsed = []; }
        queueRef.current = parsed;
        setQueue(parsed);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [scope]);

  useEffect(() => () => { if (notifTimer.current) clearTimeout(notifTimer.current); }, []);

  // ── actions ────────────────────────────────────────────────────────────────
  const toggleRun = useCallback(() => {
    const at = Date.now();
    const t = timerRef.current;
    commitTimer(phaseOf(t) === "running" ? pause(t, at) : start(withId(t), at));
  }, [commitTimer]);

  /** «إنهاء الفترة»: close it (partial saved if ≥ MIN_SAVE_DURATION) and start fresh in the same mode. */
  const reset = useCallback(() => {
    const at = Date.now();
    const t = timerRef.current;
    closePartial(t, at);
    commitTimer(idleTimer(t.mode, newSessionId(), linkOf(t)));
  }, [closePartial, commitTimer]);

  /** Switching mode closes the current period the same way «إنهاء الفترة» does — it is never just dropped. */
  const setMode = useCallback((m: PomodoroMode) => {
    const at = Date.now();
    const t = timerRef.current;
    if (m === t.mode && phaseOf(t) === "idle") return;
    closePartial(t, at);
    commitTimer(idleTimer(m, newSessionId(), linkOf(t)));
  }, [closePartial, commitTimer]);

  /** The task is fixed for the life of a period; returns false while one is open. */
  const setLinkedTask = useCallback((link: TaskLink | null) => {
    const t = timerRef.current;
    if (phaseOf(t) !== "idle") return false;
    commitTimer({ ...withId(t), taskId: link?.id ?? null, taskTitle: link?.title ?? "" });
    return true;
  }, [commitTimer]);

  /**
   * CODE-F07 — a TaskCard's «تتبع الوقت»: start a focus period on that task;
   * on the task already being timed, pause/resume it; with another task's
   * period open, refuse ("busy") rather than silently re-labelling it.
   */
  const startForTask = useCallback((task: { id: string; title: string }): StartForTaskResult => {
    const at = Date.now();
    const t = timerRef.current;
    const p = phaseOf(t);
    if (p !== "idle") {
      if (t.taskId !== task.id) return "busy";
      commitTimer(p === "running" ? pause(t, at) : start(t, at));
      return "toggled";
    }
    const base = t.mode === "focus" ? withId(t) : idleTimer("focus", newSessionId());
    commitTimer(start({ ...base, taskId: task.id, taskTitle: task.title }, at));
    return "started";
  }, [commitTimer]);

  const retrySync = useCallback(() => { void flush(true); }, [flush]);

  return {
    ready,
    /** The period's record — read the seconds left from it with `usePomodoroClock`. */
    timer,
    mode: timer.mode,
    phase,
    running: phase === "running",
    totalSec: Math.round(timer.plannedMs / 1000),
    linkedTaskId: timer.taskId,
    linkedTaskTitle: timer.taskTitle,
    sessions,
    queue,
    recentlySynced,
    pomCount,
    notif,
    noises,
    setMode, toggleRun, reset, setLinkedTask, startForTask, setNoises, retrySync,
  };
}

export type PomodoroEngine = ReturnType<typeof usePomodoroEngine>;

/**
 * Seconds left in the engine's period, re-rendering ONLY the component that
 * calls it — once a second while the period runs, never while it is paused
 * or idle. Derived from timestamps each time (CODE-F08), so a late tick shows
 * the true value, not one second less.
 */
export function usePomodoroClock(engine: Pick<PomodoroEngine, "timer" | "running">): number {
  const { timer, running } = engine;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const read = () => setNow(Date.now());
    const first = setTimeout(read, 0); // the period may have (re)started since the last read
    const id = setInterval(read, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [running, timer]);
  return remainingSec(timer, Math.max(now, timer.segmentStartedAt ?? 0));
}
