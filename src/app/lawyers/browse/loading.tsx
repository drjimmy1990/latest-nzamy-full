import { CardSkeleton, Shimmer } from "@/components/ui/Skeleton";

/**
 * /lawyers/browse loading screen — the owner's shimmer screens (4 Oct item
 * 130). While BETA_MONOPOLY_MODE is on, ./layout.tsx redirects before this
 * can show; it is ready for the day the directory opens. pt-28 matches the
 * page's own top padding under the fixed navbar.
 */
export default function LawyersBrowseLoading() {
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-6xl px-4 pt-28 pb-16">
      <span className="sr-only">جارٍ التحميل…</span>
      <div className="space-y-3">
        <Shimmer className="h-8 w-72 max-w-full" />
        <Shimmer className="h-4 w-80 max-w-full" />
      </div>
      <Shimmer className="mt-6 h-12 w-full" />
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <CardSkeleton key={i} lines={2} />
        ))}
      </div>
    </div>
  );
}
