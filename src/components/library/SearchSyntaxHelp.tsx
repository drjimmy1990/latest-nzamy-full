"use client";

/**
 * BUG-LIB-04 (S1 Task 12): «ⓘ» beside a library search bar. It opens a small
 * panel listing what the operators do, with one example each
 * (SEARCH_SYNTAX_EXAMPLES — every one parsed by the real engine in its test).
 * Clicking an example puts it in the bar (onPick). Escape or a click outside
 * closes the panel, and focus returns to the ⓘ.
 * A disclosure, not a dialog: the ⓘ carries aria-expanded / aria-controls,
 * focus stays on it, and Tab reaches the examples next (they follow it in the DOM).
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { SEARCH_SYNTAX_EXAMPLES } from "./searchSyntaxExamples";

export default function SearchSyntaxHelp({
  onPick,
  isDark = false,
  panelPosition = "start-0",
  className = "",
}: {
  onPick?: (query: string) => void;
  isDark?: boolean;
  /** Where the panel sits under the ⓘ. The default lines it up with the ⓘ's
   *  inline start, so it grows leftward in RTL; pass literal Tailwind classes
   *  (e.g. "start-0 md:start-auto md:end-0") for a bar near the left edge. */
  panelPosition?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  const panel = isDark ? "bg-zinc-900 border-white/[0.1] shadow-black/40" : "bg-white border-slate-200";
  const strong = isDark ? "text-white" : "text-gray-900";
  const muted = isDark ? "text-zinc-300" : "text-slate-600";
  const code = isDark ? "bg-zinc-950 border-white/[0.08] text-[#C8A762]" : "bg-slate-50 border-slate-200 text-[#0B3D2E]";
  const row = isDark ? "hover:bg-white/[0.05] focus-visible:bg-white/[0.05]" : "hover:bg-slate-50 focus-visible:bg-slate-50";

  return (
    <div ref={wrapRef} className={`relative inline-flex ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="شرح معادلات البحث"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center justify-center w-7 h-7 rounded-full border text-sm font-bold leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762] ${
          isDark ? "border-white/[0.12] text-zinc-300 hover:text-[#C8A762]" : "border-slate-300 text-slate-600 hover:text-[#0B3D2E]"
        }`}
      >
        <span aria-hidden="true">ⓘ</span>
      </button>
      {open && (
        <div
          id={panelId}
          dir="rtl"
          className={`absolute top-full mt-2 ${panelPosition} z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border p-3 shadow-xl text-right ${panel}`}
        >
          <p className={`text-xs font-black mb-1 ${strong}`}>معادلات البحث</p>
          <p className={`text-[11px] mb-2 ${muted}`}>
            {onPick ? "اضغط مثالاً لتجربته في خانة البحث." : "أمثلة على ما تفهمه خانة البحث."}
          </p>
          <ul className="space-y-1">
            {SEARCH_SYNTAX_EXAMPLES.map(({ query, explainAr }) => {
              const body = (
                <>
                  <code dir="rtl" className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${code}`}>{query}</code>
                  <span className={`text-[11px] ${muted}`}>{explainAr}</span>
                </>
              );
              return (
                <li key={query}>
                  {onPick ? (
                    <button
                      type="button"
                      onClick={() => {
                        onPick(query);
                        close(true);
                      }}
                      className={`w-full flex items-center gap-2 rounded-lg px-1.5 py-1 text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762] ${row}`}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 px-1.5 py-1">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
