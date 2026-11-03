"use client";

/**
 * SearchHitGroupCard — owner note ١٢-١ (2026-10-30): one search card per
 * parent document (a judicial collection, a fiqh book) with its matching
 * hits as highlighted sub-rows. Each row opens the matching place
 * (`?target=<id>&q=…#<id>`, searchHitGroups.ts); the card title opens the
 * parent with `?q=`. Highlight only: the card hides nothing of the parent.
 *
 * Locks: `locked` (the parent is not open to this viewer) turns every link
 * into the paywall; a locked ROW shows its label and a lock, never text the
 * server withheld (the row's snippet is already "").
 */

import type { MouseEvent } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BookmarkSimple, BookOpen, Gavel, Lock } from "@phosphor-icons/react";
import { Hl } from "@/components/search/MultiColorHighlight";
import type { GroupedHitRow } from "../searchHitGroups";

export interface SearchHitGroupCardProps {
  kind: "principle" | "feqh";
  title: string;
  /** The court (collections) or the author (books); "" leaves the line out. */
  subtitle: string;
  /** The parent's own excerpt, when the search matched its title. */
  excerpt?: string;
  rows: GroupedHitRow[];
  more: number;
  href: string;
  /** The parent is closed to this viewer: every link opens the paywall. */
  locked: boolean;
  setShowPaywall: (show: boolean) => void;
  isDark: boolean;
  muted: string;
  layoutMode: "grid" | "list";
  index: number;
  /** ٠٤-C04: save the parent to a folder; absent → no button. */
  onSaveToFolder?: () => void;
}

export function SearchHitGroupCard({
  kind, title, subtitle, excerpt, rows, more, href, locked, setShowPaywall,
  isDark, muted, layoutMode, index, onSaveToFolder,
}: SearchHitGroupCardProps) {
  const Icon = kind === "principle" ? Gavel : BookOpen;
  const openLabel = kind === "principle" ? "فتح المجموعة" : "فتح الكتاب";
  const moreLabel = kind === "principle" ? "مبادئ أخرى مطابقة في هذه المجموعة" : "مواضع أخرى مطابقة في هذا الكتاب";
  const guard = (e: MouseEvent) => {
    if (locked || !href) {
      e.preventDefault();
      if (locked) setShowPaywall(true);
    }
  };
  const linkHref = (h: string) => (locked || !h ? "#" : h);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.04 }}
      data-testid={`search-group-${kind}`}
      className={`relative rounded-2xl border p-5 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"} ${
        layoutMode === "grid" ? "h-full flex flex-col" : ""
      }`}
    >
      {onSaveToFolder && (
        <button
          type="button"
          onClick={onSaveToFolder}
          aria-label="حفظ في مجلد"
          title="حفظ في مجلد"
          className={`absolute top-3 left-3 z-20 p-1.5 rounded-lg border transition-colors ${
            isDark ? "border-[#2d3748] text-gray-400 hover:text-[#C8A762]" : "border-gray-200 text-gray-500 hover:text-[#0B3D2E]"
          }`}
        >
          <BookmarkSimple size={15} />
        </button>
      )}
      <div className="flex items-center gap-2 mb-2 flex-wrap pl-8">
        <Icon size={14} className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
        {subtitle && (
          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-lg ${isDark ? "bg-white/5 text-gray-300" : "bg-gray-100 text-gray-700"}`}>
            {subtitle}
          </span>
        )}
        {locked && <Lock size={13} color="#C8A762" weight="fill" aria-label="يتطلب اشتراكاً" />}
      </div>
      <Link href={linkHref(href)} onClick={guard} className="block">
        <h3 className={`text-base font-black leading-snug mb-1 hover:text-[#0B3D2E] dark:hover:text-[#C8A762] ${isDark ? "text-white" : "text-gray-900"}`}>
          <Hl text={title || (kind === "principle" ? "مبادئ قضائية" : "مرجع فقهي")} />
        </h3>
      </Link>
      {excerpt && !locked && (
        <p className={`text-xs line-clamp-2 leading-relaxed mb-2 ${muted}`}>
          <Hl text={excerpt} />
        </p>
      )}
      {rows.length > 0 && (
        <ul className={`mt-2 flex flex-col gap-2 ${layoutMode === "grid" ? "flex-1" : ""}`}>
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={linkHref(row.href)}
                onClick={(e) => {
                  if (locked || !row.href) {
                    e.preventDefault();
                    if (locked) setShowPaywall(true);
                  }
                }}
                data-testid="search-group-row"
                className={`block rounded-xl border px-3 py-2 transition-colors ${
                  isDark ? "border-[#2d3748] bg-white/5 hover:border-[#C8A762]/50" : "border-gray-100 bg-gray-50/60 hover:border-[#0B3D2E]/30"
                }`}
              >
                {(row.label || row.locked) && (
                  <span className={`flex items-center gap-1 text-[11px] font-bold mb-0.5 ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                    {row.locked && <Lock size={11} weight="fill" />}
                    {row.label || "نص للمشتركين"}
                  </span>
                )}
                {row.snippet ? (
                  <span className={`block text-xs leading-relaxed line-clamp-3 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                    <Hl text={row.snippet} />
                  </span>
                ) : row.locked ? (
                  <span className={`block text-[11px] ${muted}`}>النص متاح للمشتركين</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
        {more > 0 ? (
          <Link href={linkHref(href)} onClick={guard} className={`text-[11px] font-semibold ${muted} hover:underline`}>
            + {more} {moreLabel}
          </Link>
        ) : <span />}
        {href && (
          <Link
            href={linkHref(href)}
            onClick={guard}
            className={`text-xs flex items-center gap-1 font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}
          >
            {openLabel}
            <ArrowRight size={14} className="rotate-180" />
          </Link>
        )}
      </div>
    </motion.div>
  );
}
