"use client";

/**
 * N2.4 — one card for a multi-volume judicial collection (a tagged series, or
 * — owner note ٠٣ — untagged volumes of one court whose titles end «— المجلد
 * N», src/lib/library/precedentVolumes.ts): the series title, its court, the
 * number of volumes and principles, the first volume's description in two
 * lines, and one button per volume. The first VISIBLE_VOLUMES buttons show at
 * once; «+N مجلدات» unfolds the rest in place.
 *
 * Every volume keeps its own lock: a paid volume opens the subscription
 * prompt for a viewer without the full library, whatever the other volumes
 * are. The card itself is not a link (each volume button is one).
 */

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Books, Lock } from "@phosphor-icons/react";
import { volumesCountLabel } from "@/lib/library/bookVolumes";
import {
  collectionCardExcerpt,
  collectionVolumeLabel,
  type CollectionSeriesGroup,
  type CollectionVolumeRow,
} from "@/lib/library/precedentVolumes";
import { ClampedSummary } from "./ClampedSummary";
import { resultHref } from "../searchHitGroups";
import { SaveToFolderButton } from "./SaveToFolderButton";
import { collectionSaveDoc, type SaveToFolderDoc } from "../saveToFolder";

const VISIBLE_VOLUMES = 4;

export interface CatalogueCollectionRow extends CollectionVolumeRow {
  court: string;
  track: string;
  year: string | number;
  desc: string;
}

const TRACK_LABEL: Record<string, string> = {
  ordinary: "قضاء عادي",
  admin: "قضاء إداري",
  semi: "شبه قضائي",
};

export function CollectionSeriesCard({
  series,
  isDark,
  muted,
  layoutMode,
  viewerHasFullAccess,
  setShowPaywall,
  index,
  q = "",
  onSaveToFolder,
}: {
  series: CollectionSeriesGroup<CatalogueCollectionRow>;
  isDark: boolean;
  muted: string;
  layoutMode: "grid" | "list";
  viewerHasFullAccess: boolean;
  setShowPaywall: (show: boolean) => void;
  index: number;
  /** The search, carried to the reader as ?q= (owner note ٠٦). */
  q?: string;
  /** Owner note ٠٤: «حفظ في مجلد» (saves the series' first volume). */
  onSaveToFolder?: (doc: SaveToFolderDoc) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const first = series.volumes[0].row;
  // Owner note ٠٣ §٢: never a raw «## ديباجة …» heading on the card.
  const desc = collectionCardExcerpt(series.volumes.find((v) => v.row.desc?.trim())?.row.desc ?? "");
  const shown = showAll ? series.volumes : series.volumes.slice(0, VISIBLE_VOLUMES);
  const hidden = series.count - shown.length;
  const anyFree = viewerHasFullAccess || series.volumes.some((v) => v.row.free !== false);

  const chip = `inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762]`;
  const openChip = isDark
    ? "border-[#2d3748] bg-white/5 text-gray-300 hover:border-[#C8A762]/60 hover:text-[#C8A762]"
    : "border-gray-200 bg-gray-50 text-gray-700 hover:border-[#0B3D2E]/40 hover:text-[#0B3D2E]";
  const lockedChip = isDark
    ? "border-[#2d3748]/60 bg-transparent text-gray-500"
    : "border-gray-200/80 bg-white text-gray-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`relative rounded-2xl border p-5 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"} ${
        layoutMode === "grid" ? "min-h-[340px] h-full flex flex-col" : ""
      }`}
      data-testid="collection-series-card"
    >
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <span
          className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border ${
            isDark ? "bg-[#0B3D2E]/20 text-emerald-400 border-emerald-500/10" : "bg-emerald-50 text-[#0B3D2E] border-emerald-200"
          }`}
        >
          {first.court}
        </span>
        <span
          className={`px-2 py-1 text-[10px] font-bold rounded-lg flex items-center gap-1 ${
            isDark ? "bg-[#C8A762]/10 text-[#C8A762]" : "bg-amber-50 text-amber-700"
          }`}
        >
          <Books size={12} weight="fill" aria-hidden="true" />
          {volumesCountLabel(series.count)}
        </span>
        <SaveToFolderButton doc={collectionSaveDoc({ id: first.id, title: series.title })} onSave={onSaveToFolder} isDark={isDark} />
      </div>

      <h3 className={`text-base font-black mb-1 leading-snug ${isDark ? "text-white" : "text-gray-900"}`}>{series.title}</h3>
      {first.year && first.year !== "—" && (
        <p className="text-[11px] text-amber-600 dark:text-[#C8A762] font-semibold mb-2">إصدار: {first.year}</p>
      )}
      {desc && <ClampedSummary text={desc} isDark={isDark} className="mb-4" textClassName="text-xs" />}

      <div className={`grid grid-cols-2 gap-4 mb-4 p-4 rounded-xl border ${isDark ? "border-[#2d3748] bg-white/5" : "border-gray-100 bg-gray-50/50"}`}>
        <div className="flex flex-col">
          <span className={`text-[9px] tracking-wider ${muted}`}>عدد المبادئ في كل المجلدات</span>
          <span className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-gray-800"}`}>{series.rulingCount}</span>
        </div>
        <div className="flex flex-col">
          <span className={`text-[9px] tracking-wider ${muted}`}>المسار</span>
          <span className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-gray-800"}`}>{TRACK_LABEL[first.track] ?? "—"}</span>
        </div>
      </div>

      <div className={layoutMode === "grid" ? "mt-auto" : ""}>
        <p className={`text-[10px] font-bold mb-2 ${muted}`} id={`series-${series.key}-volumes`}>
          المجلدات
          {!anyFree && <span className="ms-1">(للمشتركين)</span>}
        </p>
        <ul className="flex flex-wrap gap-2" aria-labelledby={`series-${series.key}-volumes`}>
          {shown.map((v) => {
            const label = collectionVolumeLabel(v);
            const open = viewerHasFullAccess || v.row.free !== false;
            const count = typeof v.row.ruling_count === "number" ? ` (${v.row.ruling_count})` : "";
            return (
              <li key={v.row.id}>
                {open ? (
                  <Link href={resultHref(`/precedents/${v.row.id}`, q)} className={`${chip} ${openChip}`} title={v.row.title}>
                    {label}
                    <span className={muted}>{count}</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPaywall(true)}
                    className={`${chip} ${lockedChip}`}
                    aria-label={`${label} — يتطلب اشتراكاً`}
                    title="يتطلب اشتراكاً"
                  >
                    <Lock size={11} weight="fill" color="#C8A762" aria-hidden="true" />
                    {label}
                  </button>
                )}
              </li>
            );
          })}
          {(hidden > 0 || showAll) && series.count > VISIBLE_VOLUMES && (
            <li>
              <button
                type="button"
                onClick={() => setShowAll((s) => !s)}
                aria-expanded={showAll}
                className={`${chip} ${isDark ? "border-[#C8A762]/40 text-[#C8A762] hover:bg-[#C8A762]/10" : "border-amber-300 text-amber-700 hover:bg-amber-50"}`}
              >
                {showAll ? "إظهار أقل ▴" : `+${hidden} ${hidden === 1 ? "مجلد" : hidden === 2 ? "مجلدان" : hidden <= 10 ? "مجلدات" : "مجلدًا"} ▾`}
              </button>
            </li>
          )}
        </ul>
      </div>
    </motion.div>
  );
}
