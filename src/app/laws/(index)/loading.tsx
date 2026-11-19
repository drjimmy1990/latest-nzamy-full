import { CardSkeleton, Shimmer } from "@/components/ui/Skeleton";

/**
 * /laws loading screen — the owner's shimmer screens (4 Oct item 130). It also
 * covers the pages under /laws (a law, an order, the fiqh preview) while they
 * load. pt-32 keeps the fixed navbar's place, as the page itself does.
 */
export default function LawsLoading() {
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-6xl px-4 pt-32 pb-16">
      <span className="sr-only">جارٍ التحميل…</span>
      <div className="space-y-3">
        <Shimmer className="h-8 w-64 max-w-full" />
        <Shimmer className="h-4 w-96 max-w-full" />
      </div>
      <Shimmer className="mt-6 h-12 w-full" />
      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <CardSkeleton key={i} lines={2} />
        ))}
      </div>
    </div>
  );
}
