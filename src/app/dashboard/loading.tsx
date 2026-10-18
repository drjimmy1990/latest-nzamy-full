import { CardSkeleton, Shimmer, StatsSkeleton } from "@/components/ui/Skeleton";

/**
 * The dashboards' loading screen — the owner's shimmer screens (4 Oct item
 * 130) in place of the spinning square. It covers every /dashboard/* route for
 * every account type, so the skeleton is a generic one (heading, KPI row,
 * three cards), not the lawyer dashboard's own.
 */
export default function DashboardLoading() {
  return (
    <div role="status" aria-busy="true" className="min-h-screen bg-zinc-50 p-4 dark:bg-zinc-950 md:p-8">
      <span className="sr-only">جارٍ تحميل لوحة التحكم…</span>
      <div className="mx-auto max-w-[1400px] space-y-5">
        <div className="space-y-2">
          <Shimmer className="h-7 w-48 max-w-full" />
          <Shimmer className="h-4 w-64 max-w-full" />
        </div>
        <StatsSkeleton />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <CardSkeleton lines={4} />
          <CardSkeleton lines={3} />
          <CardSkeleton lines={3} />
        </div>
      </div>
    </div>
  );
}
