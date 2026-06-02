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
  cases: number;
  pomodoros: number;
  productivity: number;
  previousHours: number;
  previousTasks: number;
  previousCases: number;
  previousPomodoros: number;
  streak: number;
  level: PerformanceLevel;
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

const BASE_STATS: Record<StatRange, Omit<PerformanceSnapshot, "range" | "level">> = {
  today: {
    hours: 4.7,
    tasks: 3,
    cases: 2,
    pomodoros: 6,
    productivity: 75,
    previousHours: 3.9,
    previousTasks: 2,
    previousCases: 1,
    previousPomodoros: 5,
    streak: 5,
  },
  week: {
    hours: 23.3,
    tasks: 12,
    cases: 5,
    pomodoros: 31,
    productivity: 78,
    previousHours: 20.4,
    previousTasks: 9,
    previousCases: 4,
    previousPomodoros: 26,
    streak: 5,
  },
  month: {
    hours: 89.1,
    tasks: 47,
    cases: 11,
    pomodoros: 98,
    productivity: 82,
    previousHours: 77.6,
    previousTasks: 39,
    previousCases: 9,
    previousPomodoros: 84,
    streak: 5,
  },
  quarter: {
    hours: 241.6,
    tasks: 134,
    cases: 29,
    pomodoros: 287,
    productivity: 84,
    previousHours: 218.2,
    previousTasks: 121,
    previousCases: 25,
    previousPomodoros: 249,
    streak: 5,
  },
  year: {
    hours: 712.4,
    tasks: 389,
    cases: 73,
    pomodoros: 841,
    productivity: 80,
    previousHours: 641.5,
    previousTasks: 344,
    previousCases: 66,
    previousPomodoros: 758,
    streak: 5,
  },
};

export const WEEK_ACTIVITY = [
  { day: "أح", hours: 4.1 },
  { day: "إث", hours: 6.2 },
  { day: "ث", hours: 3.8 },
  { day: "أر", hours: 5.9 },
  { day: "خ", hours: 2.6 },
  { day: "ج", hours: 1.3 },
  { day: "س", hours: 0 },
];

export const WORK_DISTRIBUTION = [
  { label: "قضايا", pct: 41, color: "#0B3D2E" },
  { label: "مستندات", pct: 28, color: "#10b981" },
  { label: "عملاء", pct: 17, color: "#C8A762" },
  { label: "إداري", pct: 14, color: "#94a3b8" },
];

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
  return { label: "يحتاج متابعة", description: "يفضل مراجعة توزيع الوقت", color: "#ef4444" };
}

export function getPerformanceSnapshot(
  range: StatRange,
  live?: { pomodoroBonus?: number; taskBonus?: number }
): PerformanceSnapshot {
  const base = BASE_STATS[range];
  const pomodoroBonus = range === "today" ? live?.pomodoroBonus ?? 0 : 0;
  const taskBonus = range === "today" ? live?.taskBonus ?? 0 : 0;
  const pomodoros = base.pomodoros + pomodoroBonus;
  const tasks = base.tasks + taskBonus;
  const productivity = Math.min(100, Math.round(base.productivity + pomodoroBonus * 2 + taskBonus * 1.5));

  return {
    range,
    ...base,
    tasks,
    pomodoros,
    productivity,
    level: getPerformanceLevel(productivity),
  };
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

export function getBenchmarks(
  context: PerformanceContext,
  opts?: { city?: string; firmName?: string }
): BenchmarkItem[] {
  const city = opts?.city ?? "الرياض";
  const firmName = opts?.firmName ?? "المكتب";

  if (context === "firm") {
    return [
      { id: "team", label: "متوسط الفريق", scope: "firm_peers", avgHours: 5.9, avgTasks: 4, description: "داخل المكتب" },
      { id: "similar", label: "مكاتب مشابهة", scope: "similar_firms", avgHours: 5.4, avgTasks: 3, description: "نفس الحجم والمدينة" },
    ];
  }

  if (context === "firm_lawyer") {
    return [
      { id: "firm", label: `زملاء ${firmName}`, scope: "firm_peers", avgHours: 6.2, avgTasks: 4, description: "محامون بنفس المكتب" },
      { id: "city", label: `محامو ${city}`, scope: "city", avgHours: 5.1, avgTasks: 3, description: "نفس المدينة" },
      { id: "country", label: "محامو المملكة", scope: "country", avgHours: 4.8, avgTasks: 3, description: "على مستوى المملكة" },
    ];
  }

  return [
    { id: "city", label: `محامو ${city}`, scope: "city", avgHours: 5.1, avgTasks: 3, description: "نفس المدينة" },
    { id: "country", label: "محامو المملكة", scope: "country", avgHours: 4.8, avgTasks: 3, description: "على مستوى المملكة" },
  ];
}

export function getBenchmarkSummary(snapshot: PerformanceSnapshot, benchmarks: BenchmarkItem[]): string {
  const country = benchmarks.find(item => item.scope === "country") ?? benchmarks[benchmarks.length - 1];
  if (!country) return "لا توجد مقارنة كافية حالياً";
  const percentile = Math.max(1, Math.min(99, Math.round(((snapshot.hours - country.avgHours) / country.avgHours) * 45 + 55)));
  return `أنت في أعلى ${percentile}% ضمن ${country.label}`;
}
