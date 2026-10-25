"use client";

/**
 * N2.1 — the law's موجز as a toggle above the preamble and the articles
 * (`<details open>`: the reader closes or opens it with one click). The text
 * is lifted out of library.laws.preamble by the law route, which sends it only
 * to the viewers LAW_SUMMARY_AUDIENCE admits (owner ٢٦٠ open: subscribers);
 * the preamble the page shows no longer contains it.
 *
 * The label is the file's own («📝 موجز المستند (خلاصة سريعة)», «📝 موجز
 * الذكاء الاصطناعي»): it says what kind of summary this is.
 */

import { MD } from "./_components";

export const LAW_SUMMARY_FALLBACK_LABEL = "📝 موجز الوثيقة";

export function LawSummaryBox({
  summary,
  label,
  isDark,
  isRTL = true,
}: {
  summary?: string;
  label?: string;
  isDark: boolean;
  isRTL?: boolean;
}) {
  if (!summary || !summary.trim()) return null;
  return (
    <details
      open
      data-testid="law-document-summary-box"
      // Not printed, like the preamble: a printout carries the statute, not an
      // editorial summary («… وليس ترجمة رسمية»).
      className={`group rounded-2xl border overflow-hidden print:hidden ${
        isDark ? "bg-zinc-900 border-[#C8A762]/20" : "bg-amber-50/40 border-amber-200/70 shadow-sm"
      }`}
    >
      <summary
        className={`list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center gap-2 px-4 py-3 transition ${
          isDark ? "hover:bg-white/[0.03]" : "hover:bg-amber-50"
        }`}
      >
        <span className={`flex-1 ${isRTL ? "text-right" : "text-left"} text-[12px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
          {label?.trim() || LAW_SUMMARY_FALLBACK_LABEL}
        </span>
        <span aria-hidden="true" className={`text-[9px] transition-transform duration-200 group-open:rotate-180 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
          ▼
        </span>
      </summary>
      <div className={`px-4 pb-4 pt-3 border-t text-[12.5px] leading-loose ${isDark ? "border-white/[0.05] text-zinc-300" : "border-amber-200/60 text-slate-700"}`}>
        <MD text={summary} isDark={isDark} isRTL={isRTL} fontClass="text-[12.5px] leading-loose" />
      </div>
    </details>
  );
}
