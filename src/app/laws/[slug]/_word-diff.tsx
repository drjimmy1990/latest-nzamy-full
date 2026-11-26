"use client";

/**
 * «إظهار الفروق الملونة» — the text of one previous version inside an amended
 * article's «الإصدارات السابقة», with a toggle that shows it word by word
 * against the article's CURRENT text (owner note ١٢ §٣, 2026-10-30) — or,
 * since batch l16 (owner package 25-Nov §2.4), against the version that
 * followed it, the newest one against today's text: deleted words red and
 * struck through, added words green. Never hidden for length: diffTexts
 * falls back to lines, then to the whole texts. The diff is computed in
 * the browser (src/lib/library/wordDiff.ts) from texts the reader already has
 * — amendments reach the page only for unlocked articles (the law API's
 * `if (!isLocked)`), so nothing new is exposed.
 *
 * The strike-through lives here, not in _article-components.tsx: it marks a
 * DELETED WORD of a diff, never a repealed text (repealed-texts.test.ts keeps
 * repealed articles un-struck).
 */

import { useEffect, useMemo, useState } from "react";
import { Hl } from "@/components/search/MultiColorHighlight";
import { diffSourceText, diffTexts } from "@/lib/library/wordDiff";

export function PreviousVersionText({
  oldText,
  currentText,
  isDark,
  isRTL = true,
  className = "",
  openDiffSignal = 0,
  against = "current",
}: {
  /** The previous version (an amendment card's fullText). */
  oldText: string;
  /**
   * File 03 L5 (batch l12): the «إظهار الفروق» button beside the line under
   * the article bumps this number; each new value turns the diff on.
   */
  openDiffSignal?: number;
  /**
   * What the version is compared with (batch l16, B-10): the article's current
   * text for the newest version, else the version that followed it. No toggle
   * when empty.
   */
  currentText?: string | null;
  /** «current» (today's text) or «next» (the version that followed this one). */
  against?: "current" | "next";
  isDark: boolean;
  isRTL?: boolean;
  className?: string;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const canDiff = !!currentText && diffSourceText(currentText) !== "";
  useEffect(() => {
    if (openDiffSignal > 0 && canDiff) setShowDiff(true);
  }, [openDiffSignal, canDiff]);
  const diff = useMemo(
    () => (showDiff && canDiff ? diffTexts(diffSourceText(oldText), diffSourceText(currentText)) : undefined),
    [showDiff, canDiff, oldText, currentText],
  );

  return (
    <div className={className}>
      {canDiff && (
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowDiff((v) => !v); }}
            aria-pressed={showDiff}
            className={`text-[10.5px] font-bold px-2.5 py-1 rounded-lg border transition ${
              isDark
                ? "border-amber-400/30 text-amber-300 hover:bg-amber-500/10"
                : "border-amber-300 text-amber-800 hover:bg-amber-100"
            }`}
          >
            {showDiff
              ? (isRTL ? "إخفاء الفروق الملونة" : "Hide coloured changes")
              : (isRTL ? "إظهار الفروق الملونة" : "Show coloured changes")}
          </button>
          {showDiff && diff && (
            <span className={`text-[10px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
              {against === "next"
                ? (isRTL ? "مقارنةً بالصيغة التي تلتها:" : "Compared with the wording that followed it:")
                : (isRTL ? "مقارنةً بالنص الحالي:" : "Compared with the current text:")}{" "}
              <span className={isDark ? "text-red-300" : "text-red-700"}>{isRTL ? `${diff.removed} كلمة محذوفة` : `${diff.removed} removed`}</span>
              {" · "}
              <span className={isDark ? "text-emerald-300" : "text-emerald-700"}>{isRTL ? `${diff.added} كلمة مضافة` : `${diff.added} added`}</span>
            </span>
          )}
        </div>
      )}

      {showDiff && diff ? (
        <p className={`text-[12px] leading-relaxed whitespace-pre-line ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
          {diff.runs.map((run, i) =>
            run.op === "del" ? (
              <del
                key={i}
                title={against === "next" ? (isRTL ? "محذوف في الصيغة التالية" : "Removed in the next wording") : (isRTL ? "محذوف من النص الحالي" : "Removed in the current text")}
                className={`line-through rounded-sm ${isDark ? "bg-red-500/25 text-red-200" : "bg-red-200/70 text-red-900"}`}
              >
                <Hl text={run.text} />
              </del>
            ) : run.op === "add" ? (
              <ins
                key={i}
                title={against === "next" ? (isRTL ? "مضاف في الصيغة التالية" : "Added in the next wording") : (isRTL ? "مضاف في النص الحالي" : "Added in the current text")}
                className={`no-underline rounded-sm ${isDark ? "bg-emerald-500/25 text-emerald-200" : "bg-emerald-200/70 text-emerald-900"}`}
              >
                <Hl text={run.text} />
              </ins>
            ) : (
              <span key={i}><Hl text={run.text} /></span>
            ),
          )}
        </p>
      ) : (
        <p className={`text-[12px] leading-relaxed whitespace-pre-line ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
          <Hl text={oldText} />
        </p>
      )}
    </div>
  );
}
