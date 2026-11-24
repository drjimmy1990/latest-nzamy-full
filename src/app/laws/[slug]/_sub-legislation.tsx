"use client";

/**
 * «التشريعات الفرعية» — the options of the tab (owner spec 06, 23 Nov, batch
 * l14). The permanent «التشريعات الفرعية (N)» box that stood in the middle
 * column and in the sidebar is gone: the sub-legislation is counted on the
 * law's card in the library («+N»), and inside the law page it lives in the
 * «التشريعات الفرعية» tab. When that tab is chosen this row sits directly
 * under the tabs: «الكل», then each sub-legislation by name (merged ones
 * first, then the linked files — see _regulation-options.ts), the first three
 * then «عرض المزيد». A merged one filters the view; a linked one opens its own
 * page; one whose every article is withheld opens the upgrade.
 *
 * Titles, kinds and status are public like the catalogue. No text of any
 * child is sent.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowSquareOut, Lock } from "@phosphor-icons/react";
import { lawStatusPresentation } from "../law-status";
import {
  REG_OPTIONS_SHOWN,
  hasAllOption,
  visibleRegulationOptions,
  type RegulationOption,
} from "./_regulation-options";

export function SubLegislationOptions({
  options,
  selectedKey,
  onSelect,
  onLocked,
  isDark,
  isRTL = true,
}: {
  options: readonly RegulationOption[];
  /** The merged instrument the view is filtered on; null = «الكل». */
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  /** A sub-legislation whose every article is behind the paywall. */
  onLocked: () => void;
  isDark: boolean;
  isRTL?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = visibleRegulationOptions(options, showAll, selectedKey);
  const more = options.length - REG_OPTIONS_SHOWN;

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
      active
        ? isDark ? "bg-[#C8A762] text-[#0B3D2E]" : "bg-amber-100 text-amber-800 border border-amber-300"
        : isDark ? "text-zinc-400 hover:text-zinc-200" : "text-slate-500 hover:text-slate-700"
    }`;

  return (
    <nav
      data-testid="law-sub-legislation-options"
      aria-label={isRTL ? "اختيار التشريع الفرعي" : "Choose a sub-legislation"}
      className={`flex flex-wrap gap-1.5 p-2 rounded-xl border print:hidden ${isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm"}`}
    >
      {hasAllOption(options) && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-pressed={selectedKey === null}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            selectedKey === null
              ? isDark ? "bg-[#0B3D2E] text-[#C8A762]" : "bg-[#0B3D2E] text-white shadow-sm"
              : isDark ? "text-zinc-400 hover:text-zinc-200" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {isRTL ? "الكل" : "All"}
        </button>
      )}
      {shown.map((o) => {
        if (o.kind === "merged") {
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onSelect(o.key)}
              aria-pressed={selectedKey === o.key}
              className={chip(selectedKey === o.key)}
            >
              {o.label}
            </button>
          );
        }
        if (o.kind === "locked") {
          return (
            <button
              key={o.key}
              type="button"
              onClick={onLocked}
              title={isRTL ? "نصّه للمشتركين" : "Subscribers only"}
              className={`inline-flex items-center gap-1 ${chip(false)}`}
            >
              <Lock size={11} weight="bold" aria-hidden />
              {o.label}
            </button>
          );
        }
        const status = lawStatusPresentation(o.status);
        // As on the catalogue card: only a status that is not «ساري» is called out.
        const statusTone = status && status.tone !== "effective" ? status.tone : null;
        return (
          <Link
            key={o.key}
            href={`/laws/${encodeURIComponent(o.slug)}`}
            title={isRTL ? "ملف مستقل في المكتبة" : "A separate file in the library"}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-dashed ${
              isDark ? "border-white/[0.12] text-zinc-400 hover:text-zinc-200" : "border-slate-300 text-slate-500 hover:text-slate-800"
            }`}
          >
            {o.label}
            {statusTone && status && (
              <span
                data-child-status={o.status}
                className={`text-[10.5px] font-bold ${statusTone === "repealed" ? "text-red-500" : "text-amber-500"}`}
              >
                ({isRTL ? status.labelAr : status.labelEn})
              </span>
            )}
            <ArrowSquareOut size={11} weight="bold" aria-hidden />
          </Link>
        );
      })}
      {!showAll && more > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold underline-offset-2 hover:underline ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}
        >
          {isRTL ? `عرض المزيد (${more})` : `Show more (${more})`}
        </button>
      )}
    </nav>
  );
}
