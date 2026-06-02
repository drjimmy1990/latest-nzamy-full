// ─── Pomodoro Pro — localStorage Persistence ────────────────────────────────

import type { PomodoroSession } from "./types";

const KEY = "nzamy_pomodoro_sessions";
const MAX = 500; // max sessions stored

export function loadSessions(): PomodoroSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PomodoroSession[];
  } catch {
    return [];
  }
}

export function saveSession(session: PomodoroSession): PomodoroSession[] {
  const existing = loadSessions();
  const updated = [session, ...existing].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(updated));
  } catch {
    // storage full — trim and retry
    const trimmed = [session, ...existing].slice(0, Math.floor(MAX / 2));
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  }
  return updated;
}

export function clearSessions(): void {
  localStorage.removeItem(KEY);
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
      title: "معدل إتمام الجلسات",
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
      sub: `${week.reduce((a, d) => a + d.sessions, 0)} جلسة`,
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
