"use client";

/**
 * MultiColorHighlight — the React side of src/lib/search/multiColorSearch.ts
 * (owner notes ٠٦ / ٠٧).
 *
 *   <HighlightProvider query={q}>          one per reader / list
 *     <SearchLegendBar />                  chips + counts + ↑ ↓ + ✕
 *     … <Hl text={article.text} /> …

 *   </HighlightProvider>
 *
 * - <Hl> renders plain text with <mark> runs — React nodes, never
 *   dangerouslySetInnerHTML. With no provider (or an empty query) it renders
 *   the text unchanged, so a component can use it unconditionally.
 * - Every mark carries data-hl-term="<index>"; the legend counts and walks the
 *   marks rendered inside the provider, in document order.
 *   Counts are of what is rendered: a reader that loads in batches counts the
 *   loaded part (the bar says so with «في المعروض»).
 * - Clicking a chip focuses that term: the others render uncoloured and ↑ ↓
 *   walk only its marks; clicking it again shows every colour.
 * - ✕ clears the highlight (onClear, e.g. dropping ?q= from the URL).
 * - BUG-LIB-01: <HighlightScope active={false}> makes every <Hl> inside it
 *   render plain text — a long reader colours only the blocks near the
 *   viewport (useNearViewport). Such a reader passes the legend its own
 *   `counts` (over everything loaded) and an `onStep` that walks blocks.
 *   With no HighlightScope and no new props nothing changes.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  highlightMultiColorSegments,
  paletteFor,
  parseHighlightQuery,
  type HighlightTerm,
  type ParsedHighlightQuery,
} from "@/lib/search/multiColorSearch";

interface HighlightState {
  parsed: ParsedHighlightQuery;
  focus: number | null;
  setFocus: (term: number | null) => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
}

const HighlightContext = createContext<HighlightState | null>(null);

export function HighlightProvider({ query, children }: { query: string | null | undefined; children: ReactNode }) {
  const parsed = useMemo(() => parseHighlightQuery(query), [query]);
  const [focus, setFocus] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => setFocus(null), [query]);
  const value = useMemo(() => ({ parsed, focus, setFocus, rootRef }), [parsed, focus]);
  return (
    <HighlightContext.Provider value={value}>
      <div ref={rootRef} className="contents">
        {children}
      </div>
    </HighlightContext.Provider>
  );
}

export function useHighlight(): HighlightState | null {
  return useContext(HighlightContext);
}

/** The coloured terms of the nearest provider ([] outside one). */
export function useHighlightTerms(): readonly HighlightTerm[] {
  return useContext(HighlightContext)?.parsed.terms ?? [];
}

/** Does `text` contain any coloured term of the nearest provider? (e.g. open a collapsed «الوقائع» when it does). */
export function useTextHasHighlight(text: string | null | undefined): boolean {
  const terms = useHighlightTerms();
  return useMemo(
    () => terms.length > 0 && highlightMultiColorSegments(text, terms).some((s) => s.term !== null),
    [text, terms],
  );
}

/** Active unless a HighlightScope says otherwise: every reader without one is unchanged. */
const HighlightScopeContext = createContext<boolean>(true);

/** BUG-LIB-01: inside `active={false}`, <Hl> renders plain text (no <mark>, no matching work). */
export function HighlightScope({ active, children }: { active: boolean; children: ReactNode }) {
  return <HighlightScopeContext.Provider value={active}>{children}</HighlightScopeContext.Provider>;
}

export function Hl({ text, terms: ownTerms }: { text: string | null | undefined; terms?: readonly HighlightTerm[] }) {
  const ctx = useContext(HighlightContext);
  const inScope = useContext(HighlightScopeContext);
  const terms = ownTerms ?? ctx?.parsed.terms ?? [];
  const focus = ownTerms ? null : (ctx?.focus ?? null);
  const segments = useMemo(() => (inScope ? highlightMultiColorSegments(text, terms) : null), [inScope, text, terms]);
  if (!inScope) return <>{text ?? ""}</>;
  if (!segments || (segments.length === 1 && segments[0].term === null)) return <>{segments?.[0]?.text ?? text ?? ""}</>;
  return (
    <>
      {segments.map((s, i) =>
        s.term === null || (focus !== null && focus !== s.term) ? (
          <span key={i}>{s.text}</span>
        ) : (
          <mark key={i} data-hl-term={s.term} className={`${paletteFor(terms[s.term].color).mark} rounded px-0.5`}>
            {s.text}
          </mark>
        ),
      )}
    </>
  );
}

function marksIn(root: HTMLElement | null, term: number | null): HTMLElement[] {
  if (!root) return [];
  const selector = term === null ? "mark[data-hl-term]" : `mark[data-hl-term="${term}"]`;
  return Array.from(root.querySelectorAll<HTMLElement>(selector));
}

export interface SearchLegendBarProps {
  /** Drops the highlight (e.g. removes ?q= from the URL). No ✕ when absent. */
  onClear?: () => void;
  /** «في المعروض» after the counts when the reader shows only part of the document. */
  partial?: boolean;
  className?: string;
  /**
   * Per-term counts computed by the reader (over everything it holds); they
   * replace the recount of rendered marks, which a viewport-scoped reader
   * cannot use (most of its marks are not rendered).
   */
  counts?: readonly number[];
  /**
   * ↑/↓ for such a reader: called with the direction and the focused term;
   * when it returns true it has moved, and the bar does not walk the marks.
   */
  onStep?: (dir: 1 | -1, term: number | null) => boolean;
}

/** Owner note ٠٦: [🟡 "عزل الوكيل" (4)] [🟢 المحكمة (3)] [🚫 تحكيم] — [↑] [↓] [✕]. */
export function SearchLegendBar({ onClear, partial = false, className = "", counts: countsProp, onStep }: SearchLegendBarProps) {
  const ctx = useContext(HighlightContext);
  const [counts, setCounts] = useState<number[]>([]);
  const countsGiven = countsProp !== undefined;
  const [cursor, setCursor] = useState(-1);
  const terms = ctx?.parsed.terms ?? [];
  const excluded = ctx?.parsed.excluded ?? [];
  const focus = ctx?.focus ?? null;
  const rootRef = ctx?.rootRef;

  // Recount after every render of the highlighted content (batches load, filters change).
  useEffect(() => {
    const root = rootRef?.current;
    if (countsGiven || !root || terms.length === 0) return;
    const recount = () => {
      const next = terms.map(() => 0);
      for (const m of marksIn(root, null)) {
        const t = Number(m.dataset.hlTerm);
        if (Number.isInteger(t) && t >= 0 && t < next.length) next[t] += 1;
      }
      setCounts((prev) => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next));
    };
    recount();
    const obs = new MutationObserver(recount);
    obs.observe(root, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [rootRef, terms, countsGiven]);

  useEffect(() => setCursor(-1), [focus, terms]);

  const go = useCallback(
    (step: 1 | -1) => {
      if (onStep?.(step, focus)) return;
      const marks = marksIn(rootRef?.current ?? null, focus);
      if (marks.length === 0) return;
      const next = (cursor + step + marks.length) % marks.length;
      setCursor(next);
      const el = marks[next];
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-offset-1", "ring-royal");
      window.setTimeout(() => el.classList.remove("ring-2", "ring-offset-1", "ring-royal"), 1200);
    },
    [rootRef, focus, cursor, onStep],
  );

  if (!ctx || (terms.length === 0 && excluded.length === 0)) return null;
  const shown = countsProp ?? counts;
  const total = focus === null ? shown.reduce((a, b) => a + b, 0) : (shown[focus] ?? 0);

  return (
    <div
      role="toolbar"
      aria-label="مفاتيح ألوان البحث"
      dir="rtl"
      className={`flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white/95 px-2.5 py-2 text-xs dark:border-white/10 dark:bg-[#161b22]/95 ${className}`}
    >
      {terms.map((t, i) => {
        const active = focus === i;
        const dimmed = focus !== null && !active;
        return (
          <button
            key={`${t.kind}-${t.label}`}
            type="button"
            onClick={() => ctx.setFocus(active ? null : i)}
            aria-pressed={active}
            title={active ? "عرض جميع الألوان" : "التنقّل بين مواضع هذا المصطلح وحده"}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium transition ${
              active ? "border-royal bg-royal/10 dark:border-gold dark:bg-gold/10" : "border-slate-200 dark:border-white/10"
            } ${dimmed ? "opacity-50" : ""} text-slate-800 dark:text-slate-800`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${paletteFor(t.color).dot}`} aria-hidden />
            <span>{t.kind === "phrase" ? `"${t.label}"` : t.kind === "prefix" ? `${t.label}*` : t.label}</span>
            <span className="tabular-nums text-slate-600 dark:text-slate-600">({shown[i] ?? 0})</span>
          </button>
        );
      })}
      {excluded.map((t) => (
        <span
          key={`ex-${t.label}`}
          title="مستبعد من النتائج"
          className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-red-700 line-through dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-300"
        >
          <span aria-hidden>🚫</span>
          {t.label}
        </span>
      ))}
      <span className="ms-auto inline-flex items-center gap-1">
        {partial && <span className="text-slate-600 dark:text-slate-600">في المعروض</span>}
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={total === 0}
          aria-label="الموضع السابق"
          className="rounded-md border border-slate-200 px-2 py-0.5 text-slate-800 disabled:opacity-40 dark:border-white/10 dark:text-slate-800"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={total === 0}
          aria-label="الموضع التالي"
          className="rounded-md border border-slate-200 px-2 py-0.5 text-slate-800 disabled:opacity-40 dark:border-white/10 dark:text-slate-800"
        >
          ↓
        </button>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label="مسح الألوان"
            className="rounded-md border border-slate-200 px-2 py-0.5 text-slate-800 dark:border-white/10 dark:text-slate-800"
          >
            ✕ مسح الألوان
          </button>
        )}
      </span>
    </div>
  );
}

/** Scroll to the first mark once content holding one has rendered (arrival from search with ?q=). */
export function useScrollToFirstMark(enabled: boolean, deps: readonly unknown[] = []) {
  const ctx = useContext(HighlightContext);
  const done = useRef(false);
  useEffect(() => {
    if (!enabled || done.current || !ctx) return;
    const first = marksIn(ctx.rootRef.current, null)[0];
    if (first) {
      done.current = true;
      first.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ctx, ...deps]);
}
