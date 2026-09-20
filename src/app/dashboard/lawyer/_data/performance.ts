import type { UserSession } from "@/hooks/useUser";

export type StatRange = "today" | "week" | "month" | "quarter" | "year";
export type PerformanceContext = "solo_lawyer" | "firm_lawyer" | "firm";
export type BenchmarkScope = "city" | "country" | "firm_peers" | "similar_firms";

export interface PerformanceLevel {
  label: string;
  description: string;
  color: string;
}

export interface PerformanceSnapshot {
  range: StatRange;
  hours: number;
  tasks: number;
  tasksDone: number;
  tasksOverdue: number;
  cases: number;
  pomodoros: number;
  productivity: number;
  previousHours: number;
  previousTasks: number;
  previousCases: number;
  previousPomodoros: number;
  streak: number;
  level: PerformanceLevel;
  /** true = computed from real task data; false = unavailable (show "—") */
  isLive: boolean;
  /** work distribution computed from real task categories */
  distribution: { label: string; pct: number; color: string }[];
}

export interface BenchmarkItem {
  id: string;
  label: string;
  scope: BenchmarkScope;
  avgHours: number;
  avgTasks: number;
  description: string;
}

export const PERFORMANCE_RANGE_LABELS: Record<StatRange, string> = {
  today: "اليوم",
  week: "أسبوع",
  month: "شهر",
  quarter: "ربع",
  year: "سنة",
};

// ─── Minimal task shape needed for performance computation ───────────────────
export interface TaskForPerf {
  status: "todo" | "in_progress" | "done" | "archived";
  category: "case" | "document" | "admin" | "deadline" | "client";
  dueDate?: string;
  createdAt?: string;
}

/**
 * Compute a PerformanceSnapshot from REAL task data.
 * Hours and streak are intentionally 0 (no time-tracking in the system yet).
 * The UI should render "—" wherever isLive=true but the value is 0.
 */
export function buildLiveSnapshot(
  range: StatRange,
  tasks: TaskForPerf[],
  live?: { pomodoroBonus?: number }
): PerformanceSnapshot {
  const today = new Date().toISOString().slice(0, 10);
  const rangeStart = getRangeStart(range);

  // Filter to the selected time range (by createdAt if available, else include all)
  const inRange = tasks.filter(t => {
    if (!t.createdAt) return true; // no date → always include
    return t.createdAt.slice(0, 10) >= rangeStart;
  });

  const active   = inRange.filter(t => t.status !== "archived");
  const done     = active.filter(t => t.status === "done");
  const overdue  = active.filter(t =>
    t.dueDate && t.dueDate < today && t.status !== "done"
  );
  const cases    = active.filter(t => t.category === "case").length;

  const totalActive = active.length;
  const donePct  = totalActive > 0 ? Math.round((done.length / totalActive) * 100) : 0;

  const pomodoros = live?.pomodoroBonus ?? 0;

  // Work distribution — computed from real categories
  const dist = computeDistribution(active);

  return {
    range,
    hours:            0,       // not tracked — UI shows "—"
    tasks:            totalActive,
    tasksDone:        done.length,
    tasksOverdue:     overdue.length,
    cases,
    pomodoros,
    productivity:     donePct,
    previousHours:    0,
    previousTasks:    0,
    previousCases:    0,
    previousPomodoros: 0,
    streak:           0,       // not tracked — UI shows "—"
    level:            getPerformanceLevel(donePct),
    isLive:           true,
    distribution:     dist,
  };
}

function getRangeStart(range: StatRange): string {
  const d = new Date();
  if (range === "today")   return d.toISOString().slice(0, 10);
  if (range === "week")    { d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); }
  if (range === "month")   { d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); }
  if (range === "quarter") { d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); }
  if (range === "year")    { d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); }
  return "1970-01-01";
}

function computeDistribution(tasks: TaskForPerf[]): { label: string; pct: number; color: string }[] {
  const total = tasks.length;
  if (total === 0) return [];
  const counts: Record<string, number> = {};
  tasks.forEach(t => { counts[t.category] = (counts[t.category] ?? 0) + 1; });
  const MAP: Record<string, { label: string; color: string }> = {
    case:     { label: "قضايا",    color: "#0B3D2E" },
    document: { label: "مستندات", color: "#10b981" },
    client:   { label: "عملاء",   color: "#C8A762" },
    admin:    { label: "إداري",   color: "#94a3b8" },
    deadline: { label: "مواعيد",  color: "#ef4444" },
  };
  return Object.entries(counts)
    .map(([k, v]) => ({ label: MAP[k]?.label ?? k, pct: Math.round((v / total) * 100), color: MAP[k]?.color ?? "#94a3b8" }))
    .filter(x => x.pct > 0)
    .sort((a, b) => b.pct - a.pct);
}

// ─── Legacy export kept for backward compatibility ────────────────────────────
// Used in pages that don't yet pass real task data.
// Returns isLive=false so the UI knows to show "—" for unavailable metrics.
export function getPerformanceSnapshot(
  range: StatRange,
  live?: { pomodoroBonus?: number; taskBonus?: number }
): PerformanceSnapshot {
  const pomodoros = live?.pomodoroBonus ?? 0;
  return {
    range,
    hours:            0,
    tasks:            0,
    tasksDone:        0,
    tasksOverdue:     0,
    cases:            0,
    pomodoros,
    productivity:     0,
    previousHours:    0,
    previousTasks:    0,
    previousCases:    0,
    previousPomodoros: 0,
    streak:           0,
    level:            getPerformanceLevel(0),
    isLive:           false,
    distribution:     [],
  };
}

export const WEEK_ACTIVITY = [
  { day: "أح", hours: 0 },
  { day: "إث", hours: 0 },
  { day: "ث",  hours: 0 },
  { day: "أر", hours: 0 },
  { day: "خ",  hours: 0 },
  { day: "ج",  hours: 0 },
  { day: "س",  hours: 0 },
];

export const WORK_DISTRIBUTION: { label: string; pct: number; color: string }[] = [];

export function getPerformanceLevel(productivity: number): PerformanceLevel {
  if (productivity >= 85) {
    return { label: "ممتاز", description: "أعلى من الإيقاع المهني المتوقع", color: "#0B3D2E" };
  }
  if (productivity >= 70) {
    return { label: "متقدم", description: "قريب من أعلى شريحة أداء", color: "#C8A762" };
  }
  if (productivity >= 50) {
    return { label: "مستقر", description: "إيقاع جيد يحتاج تثبيتاً", color: "#10b981" };
  }
  if (productivity === 0) {
    return { label: "—", description: "أضف مهام لتفعيل الملخص", color: "#94a3b8" };
  }
  return { label: "يحتاج متابعة", description: "يفضل مراجعة توزيع الوقت", color: "#ef4444" };
}

export function getPerformanceContext(user: Pick<UserSession, "userType" | "affiliation">): PerformanceContext {
  if (user.userType === "firm") return "firm";
  if (user.affiliation?.entityType === "firm") return "firm_lawyer";
  return "solo_lawyer";
}

export function getPerformanceContextLabel(context: PerformanceContext): string {
  if (context === "firm") return "مكتب محاماة";
  if (context === "firm_lawyer") return "محامٍ ضمن مكتب";
  return "محامي فرد";
}

// ─── getBenchmarks / getBenchmarkSummary — DELETED ──────────────────────────
//
// They returned hardcoded national and city averages (5.1س / 4.8س / 4 مهام) and
// turned them into «أنت في أعلى N% ضمن محامو المملكة» via
// `((hours - 4.8) / 4.8) * 45 + 55`. There is no hours-worked table, no peer
// population and no published lawyer directory behind any of it — the platform
// cannot compare a lawyer to anyone, so it must not print a rank.
//
// Their only caller was TaskGamification in ../tasks/_components/TaskCard.tsx,
// deleted in the same pass. `BenchmarkItem` and `BenchmarkScope` stay: they are
// the shape a REAL benchmark would take once there is a source to fill it.
