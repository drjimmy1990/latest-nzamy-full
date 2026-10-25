"use client";

/**
 * N2.2 — a card's موجز in two lines (line-clamp-2) with an in-place toggle:
 * «... قراءة المزيد ▾» opens the whole text inside the card, «طي الموجز ▴»
 * folds it back. The toggle appears only when two lines really cut the text,
 * and it never opens the card (the cards navigate on click).
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { clampOverflows, summaryToggleLabel } from "./summaryClamp";

export function ClampedSummary({
  text,
  isDark,
  isRTL = true,
  className = "",
  textClassName = "text-[11.5px]",
  children,
}: {
  text: string;
  isDark: boolean;
  isRTL?: boolean;
  className?: string;
  textClassName?: string;
  /** Rendered in place of `text` (a highlighted copy of it). */
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(clampOverflows(el.scrollHeight, el.clientHeight));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, expanded]);

  if (!text.trim()) return null;

  return (
    <div className={className}>
      <p
        ref={ref}
        id={id}
        className={`${textClassName} leading-relaxed whitespace-pre-line ${expanded ? "" : "line-clamp-2"} ${
          isDark ? "text-gray-400" : "text-gray-600"
        }`}
      >
        {children ?? text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className={`mt-1 text-[11px] font-bold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762]/60 rounded ${
            isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"
          }`}
        >
          {summaryToggleLabel(expanded, isRTL)}
        </button>
      )}
    </div>
  );
}
