"use client";

/**
 * N2.6 — «البحث داخل هذا المستند»: one search box inside the law reader, the
 * judicial collection reader and the fiqh book reader. It searches the whole
 * document — every volume of a multi-volume series — with the library's
 * operators (+ / - "…" *), through POST /api/library/scoped-search, and stacks
 * the matching texts on the page: no navigation, each hit with its location
 * badge, «📋 نسخ النص بالتوثيق» and «➕ إضافة لمسودة التجميع».
 *
 * A locked hit (the global search's paywall, applied by the route) shows its
 * opening — or, for a fiqh block, only its place — and a subscription prompt;
 * it never has the copy or draft buttons, and the route sends it no text.
 *
 * Owner note ٠٦: the matches are coloured by the platform's one engine —
 * Arabic and digit folding, one colour per term of the query, the legend bar
 * (chips, counts, ↑ ↓) over the results — and a principle hit has
 * «الانتقال للموضع», a link carrying ?q= into its collection reader (or, for
 * this collection, handled in place by the reader's onOpenHit).
 */

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowSquareOut, Check, Copy, Lock, MagnifyingGlass, MapPin, Plus, X } from "@phosphor-icons/react";
import type { CartEntry } from "@/components/laws/DraftDrawer";
import type { ArticleBody, BlockBody, PrincipleBody, ScopedHit } from "@/app/api/library/scoped-search/scopedSearch";
import { highlightSegments, hitCartEntry, hitCopy, scopedHitHref, scopedPanelTitle, type ScopeInfo } from "@/lib/library/scopedHitActions";
import { paletteFor } from "@/lib/search/multiColorSearch";
import { HighlightProvider, SearchLegendBar, useHighlight } from "@/components/search/MultiColorHighlight";
import { cleanPrincipleText } from "@/app/precedents/[slug]/_principle-text";

const PAGE_SIZE = 20;

const OPERATORS: Array<{ token: string; label: string; insert: string }> = [
  { token: "+", label: "جمع إلزامي", insert: " +" },
  { token: "/", label: "تخيير (أو)", insert: " / " },
  { token: "-", label: "استبعاد", insert: " -" },
  { token: "\"…\"", label: "عبارة مطابقة", insert: " \"\"" },
  { token: "*", label: "جذر أو بادئة", insert: "*" },
];

interface SearchResponse {
  scope: ScopeInfo;
  /** The query as the server read it. */
  query: string;
  terms: string[];
  results: ScopedHit[];
  count: number;
  page: number;
  hasMore: boolean;
}

async function copyRich(html: string, plain: string): Promise<void> {
  try {
    const full = `<html><body><p dir="rtl" style="font-family:'Arial';font-size:14pt;line-height:1.8">${html}</p></body></html>`;
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([full], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      }),
    ]);
  } catch {
    await navigator.clipboard.writeText(plain);
  }
}

/** The text with the panel's query coloured (the nearest HighlightProvider: the panel's own). */
function Highlighted({ text }: { text: string }) {
  const ctx = useHighlight();
  const terms = ctx?.parsed.terms ?? [];
  const focus = ctx?.focus ?? null;
  return (
    <>
      {highlightSegments(text, terms).map((seg, i) =>
        seg.term === null || (focus !== null && focus !== seg.term) ? (
          <span key={i}>{seg.text}</span>
        ) : (
          <mark key={i} data-hl-term={seg.term} className={`${paletteFor(terms[seg.term].color).mark} rounded px-0.5`}>
            {seg.text}
          </mark>
        ),
      )}
    </>
  );
}

export default function ScopedSearchPanel({
  scope,
  documentLabel,
  volumeCount = 1,
  isDark,
  onAddToDraft,
  inDraft,
  onLocked,
  onOpenHit,
}: {
  /** "law:<slug>" | "collection:<id>" | "book:<id>" — the open document, from its own API data. */
  scope: string;
  /** «هذا النظام» / «هذه المجموعة» / «هذا الكتاب». */
  documentLabel: string;
  volumeCount?: number;
  isDark: boolean;
  onAddToDraft?: (entry: CartEntry) => void;
  inDraft?: (id: string) => boolean;
  /** Opens the subscription prompt; without it a locked hit links to /laws/subscribe. */
  onLocked?: () => void;
  /**
   * «الانتقال للموضع» on a hit: return true when the reader handled it in
   * place (a principle of the open collection); otherwise the link navigates.
   */
  onOpenHit?: (hit: ScopedHit, query: string) => boolean;
}) {
  const inputId = useId();
  const statusId = useId();
  const [query, setQuery] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [results, setResults] = useState<ScopedHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef("");

  // A different document starts over: the readers mount the panel with
  // key={scope}. On unmount, an answer still in flight is dropped.
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(
    async (q: string, page: number) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/library/scoped-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope, query: q, page, limit: PAGE_SIZE }),
          signal: ctrl.signal,
        });
        const body = await res.json().catch(() => null);
        if (ctrl.signal.aborted) return;
        if (!res.ok || !body || !Array.isArray(body.results)) {
          setError(typeof body?.error === "string" ? body.error : "تعذّر البحث في هذا المستند. حاول مجدداً.");
          if (page === 1) {
            setData(null);
            setResults([]);
          }
          return;
        }
        const resp = body as SearchResponse;
        setData(resp);
        setResults((prev) => (page === 1 ? resp.results : [...prev, ...resp.results]));
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        setError("تعذّر الاتصال. تحقق من الشبكة وحاول مجدداً.");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    [scope],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setError("اكتب حرفين على الأقل للبحث.");
      return;
    }
    lastQueryRef.current = q;
    void run(q, 1);
  };

  const clear = () => {
    abortRef.current?.abort();
    setQuery("");
    setData(null);
    setResults([]);
    setError(null);
    setLoading(false);
  };

  const copy = async (hit: ScopedHit) => {
    if (!data) return;
    const c = hitCopy(hit, data.scope);
    if (!c) return;
    await copyRich(c.html, c.plain);
    setCopiedId(hit.id);
    setTimeout(() => setCopiedId((id) => (id === hit.id ? null : id)), 1800);
  };

  const add = (hit: ScopedHit) => {
    if (!data || !onAddToDraft) return;
    const entry = hitCartEntry(hit, data.scope);
    if (entry) onAddToDraft(entry);
  };

  const card = isDark ? "bg-zinc-900 border-white/[0.07]" : "bg-white border-slate-200 shadow-sm";
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const chip = "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762]";

  return (
    <section
      aria-labelledby={`${inputId}-title`}
      className={`rounded-2xl border p-4 mb-6 print:hidden ${card}`}
      data-testid="scoped-search-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h2 id={`${inputId}-title`} className={`text-sm font-black flex items-center gap-1.5 ${isDark ? "text-white" : "text-gray-900"}`}>
            <MagnifyingGlass size={15} aria-hidden="true" />
            {scopedPanelTitle(scope, volumeCount)}
          </h2>
          {/* Apart from the reader's own filter / jump boxes, which act on
              what is loaded on the page: this asks the server for the whole
              document. */}
          <p className={`text-[11px] mt-0.5 ${muted}`}>
            يبحث في {documentLabel} كله{volumeCount > 1 ? ` بكل مجلداته (${volumeCount})` : ""}، لا في الصفحة المعروضة وحدها.
          </p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${isDark ? "bg-[#0B3D2E]/40 text-emerald-300" : "bg-emerald-50 text-[#0B3D2E]"}`}>
          {volumeCount > 1 ? `شامل كل المجلدات (${volumeCount})` : `داخل ${documentLabel} فقط`}
        </span>
      </div>

      <form onSubmit={onSubmit} className="flex gap-2" role="search">
        <label htmlFor={inputId} className="sr-only">{scopedPanelTitle(scope, volumeCount)}: نص البحث</label>
        <input
          id={inputId}
          type="search"
          dir="rtl"
          value={query}
          maxLength={300}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='مثال: "غرامة تأخير" + سحب / فسخ -تحكيم'
          aria-describedby={statusId}
          className={`flex-1 min-w-0 rounded-xl border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762] ${
            isDark ? "bg-zinc-950 border-white/[0.1] text-zinc-100 placeholder:text-zinc-500" : "bg-white border-slate-300 text-gray-900 placeholder:text-slate-400"
          }`}
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0B3D2E] text-white hover:opacity-90 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762]"
        >
          {loading ? "جارٍ البحث…" : "بحث"}
        </button>
        {(data || query) && (
          <button
            type="button"
            onClick={clear}
            aria-label="مسح البحث"
            className={`px-2 rounded-xl border ${isDark ? "border-white/[0.1] text-zinc-400 hover:text-white" : "border-slate-200 text-slate-500 hover:text-slate-800"}`}
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-1.5 mt-2" role="group" aria-label="معاملات البحث">
        <span className={`text-[10px] font-bold ${muted}`}>المعاملات:</span>
        {OPERATORS.map((op) => (
          <button
            key={op.token}
            type="button"
            onClick={() => setQuery((q) => (q + op.insert).slice(0, 300))}
            className={`${chip} ${isDark ? "border-white/[0.07] text-zinc-300 hover:text-[#C8A762]" : "border-slate-200 text-slate-600 hover:text-[#0B3D2E]"}`}
            title={`أضف «${op.token}» إلى البحث`}
          >
            <span dir="ltr">{op.token}</span> {op.label}
          </button>
        ))}
      </div>

      <p id={statusId} role="status" aria-live="polite" className={`text-[11px] font-bold mt-3 ${error ? (isDark ? "text-red-400" : "text-red-600") : muted}`}>
        {error
          ? error
          : data
            ? data.count === 0
              ? `لا نتائج لـ «${data.query}» داخل ${documentLabel}.`
              : `${data.count} نتيجة${volumeCount > 1 ? " في كل المجلدات" : ""} — معروضة أدناه بترتيب القراءة${results.length < data.count ? ` (${results.length} منها حتى الآن)` : ""}.${
                  !data.hasMore && results.length < data.count ? " تُعرض أول النتائج فقط؛ أضف كلمات أدق لتضييق البحث." : ""
                }`
            : ""}
      </p>

      <HighlightProvider query={data?.query ?? ""}>
      {results.length > 0 && (
        <SearchLegendBar partial={data ? results.length < data.count : false} className="mt-3" />
      )}
      {results.length > 0 && (
        <ol className="mt-3 flex flex-col gap-4">
          {results.map((hit) => {
            const added = inDraft?.(hit.id) ?? false;
            return (
              <li key={hit.id} className={`rounded-xl border p-4 ${isDark ? "border-white/[0.07] bg-white/[0.02]" : "border-slate-200 bg-slate-50/50"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold ${isDark ? "bg-[#0B3D2E]/50 text-emerald-200" : "bg-[#0B3D2E] text-white"}`}>
                    <MapPin size={12} weight="fill" aria-hidden="true" />
                    {hit.place}
                    {hit.kind === "block" && hit.meta.chapter ? ` — ${hit.meta.chapter}` : ""}
                    {hit.kind === "principle" && hit.meta.sessionDate ? ` — ${hit.meta.sessionDate}` : ""}
                  </span>
                  {(() => {
                    const href = data ? scopedHitHref(hit, data.query) : null;
                    if (!href || !data) return null;
                    return (
                      <Link
                        href={href}
                        onClick={(e) => { if (onOpenHit?.(hit, data.query)) e.preventDefault(); }}
                        className={`${chip} ${isDark ? "border-white/[0.1] text-zinc-300 hover:text-[#C8A762]" : "border-slate-200 text-slate-600 hover:text-[#0B3D2E] bg-white"}`}
                      >
                        <ArrowSquareOut size={11} aria-hidden="true" />
                        الانتقال للموضع
                      </Link>
                    );
                  })()}
                  </div>
                  {hit.locked ? (
                    onLocked ? (
                      <button
                        type="button"
                        onClick={onLocked}
                        className={`${chip} ${isDark ? "border-[#C8A762]/40 text-[#C8A762]" : "border-amber-300 text-amber-700"}`}
                      >
                        <Lock size={11} weight="fill" aria-hidden="true" />
                        اشترك لعرض النص كاملاً
                      </button>
                    ) : (
                      <Link
                        href="/laws/subscribe"
                        className={`${chip} ${isDark ? "border-[#C8A762]/40 text-[#C8A762]" : "border-amber-300 text-amber-700"}`}
                      >
                        <Lock size={11} weight="fill" aria-hidden="true" />
                        اشترك لعرض النص كاملاً
                      </Link>
                    )
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => void copy(hit)}
                        className={`${chip} ${isDark ? "border-white/[0.1] text-zinc-300 hover:text-white" : "border-slate-200 text-slate-600 hover:text-slate-900 bg-white"}`}
                      >
                        {copiedId === hit.id ? <Check size={11} aria-hidden="true" /> : <Copy size={11} aria-hidden="true" />}
                        {copiedId === hit.id ? "تم النسخ" : "📋 نسخ النص بالتوثيق"}
                      </button>
                      {onAddToDraft && (
                        <button
                          type="button"
                          onClick={() => add(hit)}
                          disabled={added}
                          aria-pressed={added}
                          className={`${chip} ${added ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : "border-[#0B3D2E] bg-[#0B3D2E] text-white hover:opacity-90"}`}
                        >
                          {added ? <Check size={11} aria-hidden="true" /> : <Plus size={11} aria-hidden="true" />}
                          {added ? "في المسودة" : "إضافة لمسودة التجميع"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <HitBody hit={hit} isDark={isDark} />
              </li>
            );
          })}
        </ol>
      )}
      </HighlightProvider>

      {data?.hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => void run(lastQueryRef.current, (data.page ?? 1) + 1)}
            className={`${chip} px-4 py-2 ${isDark ? "border-white/[0.1] text-zinc-300" : "border-slate-200 text-slate-600 bg-white"}`}
          >
            {loading ? "جارٍ التحميل…" : "تحميل المزيد من النتائج"}
          </button>
        </div>
      )}
    </section>
  );
}

function HitBody({ hit, isDark }: { hit: ScopedHit; isDark: boolean }) {
  const text = isDark ? "text-zinc-200" : "text-gray-800";
  const label = `text-[11px] font-black mb-1 ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`;
  const para = `text-sm leading-loose whitespace-pre-line select-text ${text}`;

  if (hit.locked || !hit.body) {
    return hit.snippet ? (
      <p className={`text-sm leading-loose ${isDark ? "text-zinc-400" : "text-slate-600"}`}><Highlighted text={hit.snippet} /></p>
    ) : (
      <p className={`text-xs ${isDark ? "text-zinc-500" : "text-slate-500"}`}>النص متاح للمشتركين.</p>
    );
  }

  if (hit.kind === "article") {
    const b = hit.body as ArticleBody;
    return (
      <div className="flex flex-col gap-3">
        {b.title && <p className={`text-xs font-bold ${text}`}>{b.title}</p>}
        <p className={para}><Highlighted text={b.text} /></p>
        {b.regulation && (
          <div className={`rounded-lg border-s-4 p-3 ${isDark ? "border-[#C8A762]/60 bg-white/[0.03]" : "border-amber-400 bg-amber-50/60"}`}>
            <p className={label}>نص اللائحة التنفيذية تحت المادة</p>
            <p className={para}><Highlighted text={b.regulation} /></p>
          </div>
        )}
      </div>
    );
  }

  if (hit.kind === "principle") {
    const b = hit.body as PrincipleBody;
    const parts: Array<[string, string | null]> = [
      ["💎 نص المبدأ القضائي", b.text],
      ["📌 أساس الحكم", b.rulingBasis],
      ["📋 الوقائع", b.facts],
      ["⚖️ الأسباب والحيثيات", b.reasons],
      ["🏛️ منطوق الحكم", b.ruling],
    ];
    return (
      <div className="flex flex-col gap-3">
        {parts.filter(([, v]) => v && v.trim()).map(([title, v]) => (
          <div key={title}>
            <p className={label}>{title}</p>
            <p className={para}><Highlighted text={cleanPrincipleText(v as string)} /></p>
          </div>
        ))}
      </div>
    );
  }

  const b = hit.body as BlockBody;
  return (
    <div className="flex flex-col gap-3">
      {hit.meta.topic && <p className={`text-xs font-bold ${text}`}>{String(hit.meta.topic)}</p>}
      {b.matn && (
        <div className={`rounded-lg p-3 ${isDark ? "bg-[#C8A762]/[0.08]" : "bg-amber-50"}`}>
          <p className={label}>📜 المتن</p>
          <p className={para}><Highlighted text={b.matn} /></p>
        </div>
      )}
      {b.sharh && (
        <div>
          <p className={label}>📖 الشرح</p>
          <p className={para}><Highlighted text={b.sharh} /></p>
        </div>
      )}
      {b.hashiyah.length > 0 && (
        <div className={`rounded-lg border-s-4 p-3 ${isDark ? "border-white/[0.15] bg-white/[0.03]" : "border-slate-300 bg-slate-50"}`}>
          <p className={label}>📑 الحاشية</p>
          <ol className={`list-decimal ps-5 ${para}`}>
            {b.hashiyah.map((h, i) => (
              <li key={i}><Highlighted text={h} /></li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
