"use client";

import { useTheme } from "@/components/ThemeProvider";

// ─── Base shimmer block ────────────────────────────────────────────────────────

function Shimmer({ className = "" }: { className?: string }) {
  const { isDark } = useTheme();
  return (
    <div
      className={`rounded-xl animate-pulse ${
        isDark ? "bg-white/[0.05]" : "bg-slate-100"
      } ${className}`}
    />
  );
}

// ─── KPI Stats row (4 cards) ──────────────────────────────────────────────────

export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-slate-100 dark:border-white/[0.06] p-5 space-y-3"
        >
          <div className="flex items-start justify-between">
            <Shimmer className="w-10 h-10 rounded-xl" />
            <Shimmer className="w-14 h-5 rounded-full" />
          </div>
          <Shimmer className="w-24 h-3" />
          <Shimmer className="w-20 h-7" />
          <Shimmer className="w-16 h-3" />
        </div>
      ))}
    </div>
  );
}

// ─── Table rows skeleton ───────────────────────────────────────────────────────

export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-0">
      {/* header */}
      <div className="flex gap-4 pb-3 border-b border-slate-100 dark:border-white/[0.06]">
        {[40, 16, 14, 14, 16].map((w, i) => (
          <Shimmer key={i} className={`h-3 w-${w}`} />
        ))}
      </div>
      {/* rows */}
      {[...Array(rows)].map((_, i) => (
        <div
          key={i}
          className="flex gap-4 py-3.5 border-b border-slate-50 dark:border-white/[0.03]"
        >
          <Shimmer className="h-4 flex-[2]" />
          <Shimmer className="h-4 w-16 rounded-full" />
          <Shimmer className="h-4 w-14 rounded-full" />
          <Shimmer className="h-4 w-20" />
          <Shimmer className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

// ─── Single card skeleton ──────────────────────────────────────────────────────

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-2xl border border-slate-100 dark:border-white/[0.06] p-5 space-y-3">
      <div className="flex items-center justify-between mb-4">
        <Shimmer className="h-4 w-28" />
        <Shimmer className="h-3 w-14" />
      </div>
      {[...Array(lines)].map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-100 dark:border-white/[0.04] p-3 space-y-2">
          <Shimmer className="h-3.5 w-3/4" />
          <Shimmer className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ─── Timeline / Activity skeleton ─────────────────────────────────────────────

export function TimelineSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-0">
      {[...Array(items)].map((_, i) => (
        <div key={i} className="flex items-start gap-3 py-2.5">
          <Shimmer className="w-7 h-7 flex-shrink-0 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Shimmer className="h-3 w-4/5" />
            <Shimmer className="h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── AI Quick Access skeleton ──────────────────────────────────────────────────

export function AIQuickSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="flex flex-col items-center gap-2 px-4 py-4 rounded-xl border border-slate-100 dark:border-white/[0.06] space-y-2"
        >
          <Shimmer className="w-10 h-10 rounded-xl" />
          <Shimmer className="h-3.5 w-20" />
          <Shimmer className="h-2.5 w-16" />
        </div>
      ))}
    </div>
  );
}

// ─── Full lawyer dashboard skeleton ───────────────────────────────────────────

export function LawyerDashboardSkeleton() {
  return (
    <div className="max-w-[1400px] mx-auto space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <Shimmer className="h-7 w-48" />
          <Shimmer className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Shimmer className="h-10 w-28 rounded-xl" />
          <Shimmer className="h-10 w-28 rounded-xl" />
        </div>
      </div>

      {/* KPI */}
      <StatsSkeleton />

      {/* Tasks + Hearings + Deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={3} />
        <CardSkeleton lines={3} />
      </div>

      {/* Timeline + Cases */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="rounded-2xl border border-slate-100 dark:border-white/[0.06] p-5">
          <div className="flex justify-between mb-4">
            <Shimmer className="h-4 w-24" />
            <Shimmer className="h-7 w-20 rounded-lg" />
          </div>
          <TimelineSkeleton items={6} />
        </div>
        <div className="lg:col-span-2 rounded-2xl border border-slate-100 dark:border-white/[0.06] p-5">
          <div className="flex justify-between mb-4">
            <Shimmer className="h-4 w-28" />
            <Shimmer className="h-3 w-16" />
          </div>
          <TableSkeleton rows={4} />
        </div>
      </div>

      {/* AI Quick Access */}
      <div className="rounded-2xl border border-slate-100 dark:border-white/[0.06] p-5 space-y-3">
        <Shimmer className="h-3 w-36" />
        <AIQuickSkeleton />
      </div>
    </div>
  );
}

// ─── Generic compact skeleton for sub-pages ───────────────────────────────────

export function PageSkeleton() {
  return (
    <div className="max-w-[1400px] mx-auto space-y-5" dir="rtl">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Shimmer className="h-7 w-40" />
          <Shimmer className="h-4 w-52" />
        </div>
        <Shimmer className="h-10 w-32 rounded-xl" />
      </div>
      <div className="rounded-2xl border border-slate-100 dark:border-white/[0.06] p-5">
        <div className="flex justify-between mb-4">
          <Shimmer className="h-4 w-32" />
          <Shimmer className="h-8 w-24 rounded-xl" />
        </div>
        <TableSkeleton rows={6} />
      </div>
    </div>
  );
}
