"use client";

/**
 * «التشريعات الفرعية» — the law's sub-legislation, linked by the CHILD's
 * `parent_law_id` (library agent's request of 19 Nov §1.8; our file 18 بند 5).
 * The law route sends `subLegislation: {count, children}` already in the
 * owner's order (the executive regulation first, then the newest; see
 * src/app/api/library/laws/[slug]/_children.ts). This box shows the first
 * SUB_LEGISLATION_SHOWN and «عرض المزيد (N)» for the rest; each title opens
 * the child's own page. Nothing is shown when the law has no child.
 *
 * Titles, kinds and status are public like the catalogue; the issue date is
 * in the payload for a subscriber only. No text of any child is sent.
 */

import { useState } from "react";
import Link from "next/link";
import { lawStatusPresentation } from "../law-status";
import type { LawSystem } from "../data";

/** Owner §1.8 / file 16 §7: two or three entries, then «عرض المزيد». */
export const SUB_LEGISLATION_SHOWN = 3;

type SubLegislation = NonNullable<LawSystem["subLegislation"]>;

export function SubLegislationSection({
  subLegislation,
  isDark,
  isRTL = true,
}: {
  subLegislation?: SubLegislation | null;
  isDark: boolean;
  isRTL?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const children = subLegislation?.children ?? [];
  if (children.length === 0) return null;
  const shown = showAll ? children : children.slice(0, SUB_LEGISLATION_SHOWN);
  const more = children.length - SUB_LEGISLATION_SHOWN;
  const muted = isDark ? "text-zinc-400" : "text-slate-500";

  return (
    <section
      data-testid="law-sub-legislation"
      aria-label={isRTL ? "التشريعات الفرعية" : "Sub-legislation"}
      className={`rounded-2xl border px-4 py-3 print:hidden ${
        isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-slate-200 shadow-sm"
      }`}
    >
      <h2 className={`text-[12px] font-bold mb-2 ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
        {isRTL ? `التشريعات الفرعية (${children.length})` : `Sub-legislation (${children.length})`}
      </h2>
      <ul className="space-y-1.5">
        {shown.map((child) => {
          const status = lawStatusPresentation(child.status);
          // As on the catalogue card: only a status that is not «ساري» is called out.
          const statusTone = status && status.tone !== "effective" ? status.tone : null;
          const statusClass = statusTone === "repealed"
            ? "text-red-500"
            : statusTone === "caution"
              ? "text-amber-500"
              : muted;
          return (
            <li key={child.slug} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px] leading-relaxed">
              <Link
                href={`/laws/${encodeURIComponent(child.slug)}`}
                className={`font-semibold hover:underline underline-offset-2 ${isDark ? "text-zinc-300" : "text-slate-800"}`}
              >
                {child.title || child.slug}
              </Link>
              {child.type && <span className={`text-[10.5px] ${muted}`}>{child.type}</span>}
              {child.issueDate && <span className={`text-[10.5px] ${muted}`}>{child.issueDate}</span>}
              {statusTone && status && (
                <span className={`text-[10.5px] font-bold ${statusClass}`} data-child-status={child.status}>
                  {isRTL ? status.labelAr : status.labelEn}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {!showAll && more > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className={`mt-2 text-[11.5px] font-bold underline-offset-2 hover:underline ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}
        >
          {isRTL ? `عرض المزيد (${more})` : `Show more (${more})`}
        </button>
      )}
    </section>
  );
}
