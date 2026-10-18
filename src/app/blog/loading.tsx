import { CardSkeleton, Shimmer } from "@/components/ui/Skeleton";

/**
 * /blog loading screen — the owner's shimmer screens (4 Oct item 130). It also
 * covers an article and a category page while they load. pt-32 keeps the
 * fixed navbar's place, as <BlogList> does.
 */
export default function BlogLoading() {
  return (
    <div role="status" aria-busy="true" className="mx-auto w-full max-w-6xl px-4 pt-32 pb-8">
      <span className="sr-only">جارٍ التحميل…</span>
      <Shimmer className="h-8 w-56 max-w-full" />
      {/* The category tabs; the row clips rather than scrolling sideways. */}
      <div className="mt-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <Shimmer key={i} className="h-8 w-20 flex-shrink-0" />
        ))}
      </div>
      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <CardSkeleton key={i} lines={1} />
        ))}
      </div>
    </div>
  );
}
