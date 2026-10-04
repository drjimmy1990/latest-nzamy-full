"use client";

/**
 * ResultsSkeleton — card-shaped pulse placeholders for /laws while a search
 * request is still in flight (owner test 2026-10-01: «جاري البحث...» and
 * «لا توجد نتائج تطابق بحثك» showed together). A tab shows these instead of
 * its cards AND instead of its empty state; the empty state appears only
 * once the request settled with zero rows.
 */
export function ResultsSkeleton({
  isDark,
  layoutMode,
  count = 6,
  label = "جارٍ تحميل النتائج",
  className = "mb-8",
}: {
  isDark: boolean;
  layoutMode: "grid" | "list";
  count?: number;
  /** Screen-reader text; the cards themselves are aria-hidden. */
  label?: string;
  className?: string;
}) {
  const block = isDark ? "bg-white/[0.04]" : "bg-slate-100";
  const frame = isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200";
  const isGrid = layoutMode === "grid";
  return (
    <div
      role="status"
      aria-busy="true"
      className={`${isGrid ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" : "flex flex-col gap-4"} ${className}`}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`rounded-2xl border p-5 animate-pulse ${frame} ${isGrid ? "min-h-[200px] flex flex-col" : ""}`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className={`h-4 w-16 rounded-lg ${block}`} />
            <div className={`h-4 w-10 rounded-lg ${block}`} />
          </div>
          <div className={`h-4 w-4/5 rounded ${block} mb-2`} />
          <div className={`h-4 w-3/5 rounded ${block} mb-4`} />
          <div className={`h-3 w-full rounded ${block} mb-2`} />
          <div className={`h-3 w-11/12 rounded ${block} ${isGrid ? "mb-2" : ""}`} />
          {isGrid && <div className={`h-3 w-2/3 rounded ${block} mt-auto`} />}
        </div>
      ))}
    </div>
  );
}
