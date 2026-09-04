// ─── Pomodoro Pro — Pure session mapping + stats ────────────────────────────
//
// Split out of `storage.ts` so this module can be unit-tested with plain
// `node --test`. `storage.ts` imports live functions (`getWorkSessions`,
// `recordWorkSession`) from `workSessionsService.ts`, which itself
// value-imports `apiGet`/`apiMutate`/`isSupabaseMode` via the "@/" alias —
// an alias `node --test`'s plain ESM loader cannot resolve (no
// tsconfig-paths registration). Loading anything from `storage.ts` in a test
// would therefore always fail, regardless of what THIS file's own imports
// look like. This module takes only `import type` from `workSessionsService`
// (erased by Node's TypeScript stripping before resolution ever runs — safe)
// and zero value imports beyond `./types.ts`, so it loads cleanly under
// `node --test` and stays pure: no `localStorage`, no network, no `window`.
//
// `storage.ts` re-exports every name here, so `PomodoroPanel.tsx`,
// `StatsPanel.tsx`, and `PomodoroExtras.tsx` keep importing from
// "./_pomodoro/storage" exactly as before — this split is invisible to them.

import type { PomodoroMode, PomodoroSession } from "./types";
import type { WorkSession, WorkSessionInput, WorkSessionMode } from "../../../../../../lib/services/workSessionsService.ts";

// ─── Mode mapping ─────────────────────────────────────────────────────────────

export function pomodoroModeToWorkSessionMode(m: PomodoroMode): WorkSessionMode {
  if (m === "short") return "short_break";
  if (m === "long") return "long_break";
  return "focus";
}

export function workSessionModeToPomodoroMode(m: WorkSessionMode): PomodoroMode {
  if (m === "short_break") return "short";
  if (m === "long_break") return "long";
  return "focus";
}

/** Server row → the shape every stats helper and screen in this folder reads. */
export function workSessionToPomodoroSession(ws: WorkSession): PomodoroSession {
  return {
    id: ws.id,
    mode: workSessionModeToPomodoroMode(ws.mode),
    startedAt: ws.startedAt,
    endedAt: ws.endedAt ?? ws.startedAt,
    taskTitle: ws.label || undefined,
    completed: ws.completed,
    durationMin: ws.durationMin,
    noises: [], // not a work_sessions column — an honest omission, not a zero
  };
}

/**
 * Mirrors the checks `validateWorkSessionInput` enforces server-side
 * (duration_min 1..600 integer, parseable startedAt, endedAt >= startedAt).
 * Run BEFORE posting so a genuinely-invalid row is dropped once, up front,
 * instead of read back as an ambiguous server rejection later.
 */
export function isPostableSession(s: PomodoroSession): boolean {
  if (!Number.isInteger(s.durationMin) || s.durationMin < 1 || s.durationMin > 600) return false;
  const startMs = Date.parse(s.startedAt);
  if (Number.isNaN(startMs)) return false;
  if (s.endedAt) {
    const endMs = Date.parse(s.endedAt);
    if (Number.isNaN(endMs) || endMs < startMs) return false;
  }
  return true;
}

/** A completed local session → the POST body. `taskId` is always null: the
 *  engine only ever carries a task TITLE (`taskTitles` on the page is a list
 *  of strings, not ids), never a real task id to attach. */
export function pomodoroSessionToWorkSessionInput(s: PomodoroSession): WorkSessionInput {
  return {
    mode: pomodoroModeToWorkSessionMode(s.mode),
    startedAt: s.startedAt,
    endedAt: s.endedAt || null, // falsy (including "") normalizes to "no end time", not an unparsable string
    durationMin: s.durationMin,
    completed: s.completed,
    taskId: null,
    label: (s.taskTitle ?? "").trim().slice(0, 120),
  };
}

// ─── Analytics helpers ────────────────────────────────────────────────────────

export interface DayStats {
  date:       string;   // "YYYY-MM-DD"
  label:      string;   // "الأحد"
  focusMin:   number;
  sessions:   number;
  completed:  number;
}

const DAY_NAMES_AR = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];

export function getWeekStats(sessions: PomodoroSession[]): DayStats[] {
  const now  = new Date();
  const days: DayStats[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const daySessions = sessions.filter(
      s => s.startedAt.slice(0, 10) === dateStr && s.mode === "focus"
    );
    days.push({
      date:      dateStr,
      label:     DAY_NAMES_AR[d.getDay()],
      focusMin:  daySessions.reduce((a, s) => a + s.durationMin, 0),
      sessions:  daySessions.length,
      completed: daySessions.filter(s => s.completed).length,
    });
  }
  return days;
}

export interface HourStats {
  hour:     number;   // 0-23
  label:    string;   // "09:00"
  focusMin: number;
}

export function getHourStats(sessions: PomodoroSession[]): HourStats[] {
  const buckets: HourStats[] = Array.from({ length: 24 }, (_, h) => ({
    hour:     h,
    label:    `${String(h).padStart(2,"0")}:00`,
    focusMin: 0,
  }));
  sessions
    .filter(s => s.mode === "focus")
    .forEach(s => {
      const h = new Date(s.startedAt).getHours();
      buckets[h].focusMin += s.durationMin;
    });
  return buckets;
}

export interface SmartInsight {
  icon:  string;
  title: string;
  value: string;
  sub?:  string;
  trend?: "up" | "down" | "neutral";
}

export function generateInsights(sessions: PomodoroSession[]): SmartInsight[] {
  if (sessions.length === 0) return [];

  const insights: SmartInsight[] = [];
  const week   = getWeekStats(sessions);
  const hours  = getHourStats(sessions);

  // Best day
  const bestDay = [...week].sort((a, b) => b.focusMin - a.focusMin)[0];
  if (bestDay.focusMin > 0) {
    insights.push({
      icon: "🏆",
      title: "أكثر أيامك إنتاجية",
      value: bestDay.label,
      sub: `${bestDay.focusMin} دقيقة تركيز`,
      trend: "up",
    });
  }

  // Best hour block
  const hoursSorted = [...hours].sort((a, b) => b.focusMin - a.focusMin);
  if (hoursSorted[0].focusMin > 0) {
    insights.push({
      icon: "⏰",
      title: "أكثر أوقاتك إنتاجية",
      value: hoursSorted[0].label,
      sub: `و ${hoursSorted[1]?.label ?? ""}`,
      trend: "neutral",
    });
  }

  // Completion rate
  const focusSessions = sessions.filter(s => s.mode === "focus");
  if (focusSessions.length > 0) {
    const rate = Math.round((focusSessions.filter(s => s.completed).length / focusSessions.length) * 100);
    insights.push({
      icon: "✅",
      title: "معدل إتمام الفترات",
      value: `${rate}%`,
      sub: rate >= 70 ? "ممتاز! استمر" : "يمكن تحسينه",
      trend: rate >= 70 ? "up" : "down",
    });
  }

  // Weekly total
  const weekTotal = week.reduce((a, d) => a + d.focusMin, 0);
  if (weekTotal > 0) {
    insights.push({
      icon: "📊",
      title: "إجمالي تركيزك هذا الأسبوع",
      value: weekTotal >= 60 ? `${Math.round(weekTotal / 60)} ساعة` : `${weekTotal} دقيقة`,
      sub: `${week.reduce((a, d) => a + d.sessions, 0)} فترة`,
      trend: "neutral",
    });
  }

  // Most used noise
  const noiseCounts: Record<string, number> = {};
  sessions.forEach(s => s.noises?.forEach(n => { noiseCounts[n] = (noiseCounts[n] ?? 0) + 1; }));
  const topNoise = Object.entries(noiseCounts).sort((a, b) => b[1] - a[1])[0];
  if (topNoise) {
    const LABELS: Record<string, string> = {
      rain:"مطر خفيف",heavy_rain:"مطر غزير",train:"قطار",cafe:"مقهى",
      ac:"تكييف",fire:"نار",ocean:"أمواج",wind:"هواء",birds:"طيور",
    };
    insights.push({
      icon: "🎵",
      title: "صوت بيئتك المفضل",
      value: LABELS[topNoise[0]] ?? topNoise[0],
      sub: `استُخدم ${topNoise[1]} مرة`,
      trend: "neutral",
    });
  }

  return insights;
}
