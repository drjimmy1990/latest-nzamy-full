"use client";

/**
 * «التشريعات الفرعية» — owner file 16 §7 (19 Nov): under every law, its
 * sub-legislation («لائحة تنفيذية، قرارات وزارية…»), two or three, then
 * «عرض المزيد». Acceptance: نظام القضاء shows its first 2–3 with «عرض المزيد».
 *
 * Two kinds, listed in this order:
 *   1. the regulations MERGED into this file (the names of the law route's
 *      `regulationIndex`, for every viewer) — each opens the regulation view
 *      on that instrument;
 *   2. the documents LINKED by their own `parent_law_id` (library agent's
 *      request of 19 Nov §1.8): `subLegislation.children`, already in the
 *      owner's order (the executive regulation first, then the newest; see
 *      src/app/api/library/laws/[slug]/_children.ts), without the ones that
 *      are one of the merged regulations — each opens its own page.
 * The first SUB_LEGISLATION_SHOWN, then «عرض المزيد (N)». Nothing is shown
 * when the law has neither.
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

type Entry =
  | { kind: "merged"; name: string }
  | { kind: "linked"; child: SubLegislation["children"][number] };

export function SubLegislationSection({
  subLegislation,
  mergedNames = [],
  onOpenMerged,
  isDark,
  isRTL = true,
}: {
  subLegislation?: SubLegislation | null;
  /** The names of the regulations merged into this file (regulationIndex). */
  mergedNames?: readonly string[];
  /** Opens the regulation view on one merged instrument. */
  onOpenMerged?: (name: string) => void;
  isDark: boolean;
  isRTL?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const entries: Entry[] = [
    ...Array.from(new Set(mergedNames.map((n) => n.trim()).filter(Boolean))).map((name): Entry => ({ kind: "merged", name })),
    ...(subLegislation?.children ?? []).map((child): Entry => ({ kind: "linked", child })),
  ];
  if (entries.length === 0) return null;
  const shown = showAll ? entries : entries.slice(0, SUB_LEGISLATION_SHOWN);
  const more = entries.length - SUB_LEGISLATION_SHOWN;
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const linkClass = `font-semibold hover:underline underline-offset-2 ${isDark ? "text-zinc-300" : "text-slate-800"}`;

  return (
    <section
      data-testid="law-sub-legislation"
      aria-label={isRTL ? "التشريعات الفرعية" : "Sub-legislation"}
      className={`rounded-2xl border px-4 py-3 print:hidden ${
        isDark ? "bg-zinc-900 border-white/[0.06]" : "bg-white border-slate-200 shadow-sm"
      }`}
    >
      <h2 className={`text-[12px] font-bold mb-2 ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
        {isRTL ? `التشريعات الفرعية (${entries.length})` : `Sub-legislation (${entries.length})`}
      </h2>
      <ul className="space-y-1.5">
        {shown.map((entry) => {
          if (entry.kind === "merged") {
            return (
              <li key={`merged:${entry.name}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px] leading-relaxed">
                <button type="button" onClick={() => onOpenMerged?.(entry.name)} className={`${linkClass} ${isRTL ? "text-right" : "text-left"}`}>
                  {entry.name}
                </button>
                <span className={`text-[10.5px] ${muted}`}>{isRTL ? "مدمجة في هذا الملف" : "Merged in this file"}</span>
              </li>
            );
          }
          const child = entry.child;
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
              <Link href={`/laws/${encodeURIComponent(child.slug)}`} className={linkClass}>
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
