"use client";
// ─── Pomodoro Pro — Timer Engine Hook ───────────────────────────────────────

import { useState, useRef, useCallback, useEffect } from "react";
import {
  type PomodoroMode, type PomodoroSession, type ActiveNoise,
  DURATIONS, MIN_SAVE_DURATION,
} from "./types";
import { loadSessions, saveSession } from "./storage";

export interface PomodoroEngineState {
  mode:      PomodoroMode;
  timeLeft:  number;
  running:   boolean;
  sessions:  PomodoroSession[];
  pomCount:  number;
  linkedTask:string;
  notif:     boolean;
  noises:    ActiveNoise[];
}

export interface PomodoroEngineActions {
  setMode:       (m: PomodoroMode) => void;
  toggleRun:     () => void;
  reset:         () => void;
  setLinkedTask: (t: string) => void;
  setNoises:     (n: ActiveNoise[]) => void;
}

export function usePomodoroEngine(
  onComplete?: () => void
): PomodoroEngineState & PomodoroEngineActions {
  const [mode,       setModeState] = useState<PomodoroMode>("focus");
  const [timeLeft,   setTimeLeft]  = useState(DURATIONS.focus);
  const [running,    setRunning]   = useState(false);
  const [sessions,   setSessions]  = useState<PomodoroSession[]>([]);
  const [pomCount,   setPomCount]  = useState(0);
  const [linkedTask, setLinked]    = useState("");
  const [notif,      setNotif]     = useState(false);
  const [noises,     setNoises]    = useState<ActiveNoise[]>([]);

  const startRef    = useRef<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load persisted sessions on mount
  useEffect(() => {
    setSessions(loadSessions());
  }, []);

  // Timer loop
  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setTimeLeft(cur => {
        if (cur <= 1) {
          clearInterval(intervalRef.current!);
          setRunning(false);

          const now      = new Date();
          const durMin   = Math.round(
            (now.getTime() - (startRef.current?.getTime() ?? now.getTime())) / 60000
          );
          const session: PomodoroSession = {
            id:          `${Date.now()}`,
            mode,
            startedAt:   (startRef.current ?? now).toISOString(),
            endedAt:     now.toISOString(),
            taskTitle:   linkedTask || undefined,
            completed:   true,
            durationMin: durMin,
            noises:      noises.map(n => n.channel),
          };

          const updated = saveSession(session);
          setSessions(updated);
          if (mode === "focus") { setPomCount(c => c + 1); onComplete?.(); }
          setNotif(true);
          setTimeout(() => setNotif(false), 4000);
          return 0;
        }
        return cur - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, [running, mode, linkedTask, noises, onComplete]);

  const toggleRun = useCallback(() => {
    if (!running) startRef.current = new Date();
    setRunning(v => !v);
  }, [running]);

  const reset = useCallback(() => {
    // Save partial session if ≥ MIN_SAVE_DURATION minutes elapsed
    if (running && startRef.current) {
      const elapsed = Math.round((Date.now() - startRef.current.getTime()) / 60000);
      if (elapsed >= MIN_SAVE_DURATION) {
        const now = new Date();
        const session: PomodoroSession = {
          id:          `${Date.now()}`,
          mode,
          startedAt:   startRef.current.toISOString(),
          endedAt:     now.toISOString(),
          taskTitle:   linkedTask || undefined,
          completed:   false,
          durationMin: elapsed,
          noises:      noises.map(n => n.channel),
        };
        const updated = saveSession(session);
        setSessions(updated);
      }
    }
    clearInterval(intervalRef.current!);
    setRunning(false);
    setTimeLeft(DURATIONS[mode]);
    startRef.current = null;
  }, [running, mode, linkedTask, noises]);

  const setMode = useCallback((m: PomodoroMode) => {
    setModeState(m);
    setRunning(false);
    setTimeLeft(DURATIONS[m]);
    clearInterval(intervalRef.current!);
  }, []);

  const setLinkedTask = useCallback((t: string) => setLinked(t), []);

  return {
    mode, timeLeft, running, sessions, pomCount, linkedTask, notif, noises,
    setMode, toggleRun, reset, setLinkedTask, setNoises,
  };
}
