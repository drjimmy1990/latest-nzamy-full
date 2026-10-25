"use client";

/**
 * N2.4 — the volume selector of a multi-volume judicial collection (a tagged
 * series, src/lib/library/precedentVolumes.ts): one chip per volume, the open
 * one marked, and a drop-down with every volume for long series. Each volume
 * keeps its own lock, the same rule as the catalogue's series card: a paid
 * volume is not a link for a viewer without the full library.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Books, Lock } from "@phosphor-icons/react";
import type { CollectionSeriesInfo } from "@/lib/library/precedentVolumes";
import { volumesCountLabel } from "@/lib/library/bookVolumes";

/** Chips shown before the reader has to use the drop-down. */
const CHIP_LIMIT = 8;

export default function VolumeSelector({
  series,
  hasFullAccess,
  isDark,
}: {
  series: CollectionSeriesInfo;
  hasFullAccess: boolean;
  isDark: boolean;
}) {
  const router = useRouter();
  const currentIndex = series.volumes.findIndex((v) => v.id === series.currentId);
  // A window of chips around the open volume.
  const start = Math.max(0, Math.min(currentIndex - Math.floor(CHIP_LIMIT / 2), series.volumes.length - CHIP_LIMIT));
  const chips = series.volumes.slice(start, start + CHIP_LIMIT);
  const isOpen = (v: CollectionSeriesInfo["volumes"][number]) => hasFullAccess || v.free;

  const chip = "inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762]";
  return (
    <nav
      aria-label="مجلدات المجموعة"
      className={`rounded-2xl border p-3 mb-4 flex flex-wrap items-center gap-2 print:hidden ${
        isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"
      }`}
      data-testid="precedent-volume-selector"
    >
      <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
        <Books size={14} weight="fill" aria-hidden="true" />
        {volumesCountLabel(series.volumes.length)} في هذه المجموعة
      </span>
      <ul className="flex flex-wrap gap-1.5">
        {chips.map((v) => {
          const current = v.id === series.currentId;
          const count = v.rulingCount !== null ? ` (${v.rulingCount})` : "";
          if (current) {
            return (
              <li key={v.id}>
                <span aria-current="page" className={`${chip} bg-[#0B3D2E] border-[#0B3D2E] text-white`}>
                  {v.label}{count} ✓
                </span>
              </li>
            );
          }
          if (!isOpen(v)) {
            return (
              <li key={v.id}>
                <span
                  aria-disabled="true"
                  title="يتطلب اشتراكاً"
                  className={`${chip} cursor-not-allowed ${isDark ? "border-white/[0.07] text-zinc-500" : "border-slate-200 text-slate-400"}`}
                >
                  <Lock size={10} weight="fill" color="#C8A762" aria-hidden="true" />
                  {v.label}
                  <span className="sr-only">— يتطلب اشتراكاً</span>
                </span>
              </li>
            );
          }
          return (
            <li key={v.id}>
              <Link
                href={`/precedents/${v.id}`}
                className={`${chip} ${isDark ? "border-white/[0.07] text-zinc-300 hover:border-[#C8A762]/60 hover:text-[#C8A762]" : "border-slate-200 text-slate-600 hover:border-[#0B3D2E]/40 hover:text-[#0B3D2E]"}`}
              >
                {v.label}{count}
              </Link>
            </li>
          );
        })}
      </ul>
      {series.volumes.length > CHIP_LIMIT && (
        <label className={`inline-flex items-center gap-1.5 text-[11px] font-bold ms-auto ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
          اختر المجلد
          <select
            value={series.currentId}
            onChange={(e) => router.push(`/precedents/${e.target.value}`)}
            className={`rounded-lg border px-2 py-1 text-[11px] ${isDark ? "bg-zinc-900 border-white/[0.07] text-zinc-200" : "bg-white border-slate-200 text-slate-700"}`}
          >
            {series.volumes.map((v) => (
              <option key={v.id} value={v.id} disabled={!isOpen(v) && v.id !== series.currentId}>
                {v.label}{!isOpen(v) ? " (للمشتركين)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
    </nav>
  );
}
