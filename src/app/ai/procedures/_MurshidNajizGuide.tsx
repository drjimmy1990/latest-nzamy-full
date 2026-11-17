"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight, BookOpen, CaretDown, CaretLeft, Certificate, Check, Copy, HandCoins, HardHat,
  Info, MagnifyingGlass, PencilLine, Scales, Siren, Storefront, Users, Warning, X,
} from "@phosphor-icons/react";
import { Hl } from "@/components/search/MultiColorHighlight";
import { toArabicDigits } from "@/lib/services/arabicCount";
import type { HighlightTerm } from "@/lib/search/multiColorSearch";
import type { NajizClass, NajizClassifications, NajizCourt, NajizNote, NajizType } from "@/lib/murshid/najizClassifications";
import { classWideNotes, groupHitsByClass, najizBreadcrumb, najizRows, searchNajiz, typeNotes } from "@/lib/murshid/najizSearch";
import { NAJIZ_SYNONYMS } from "@/lib/murshid/najizSynonyms";
import { najizDraftHref } from "@/lib/murshid/najizDraftLink";
import { SEARCH_SYNTAX_HINT } from "./_circuitsSearch";
import { arabicDate, tone, useMurshidJson } from "./_murshidShared";

/**
 * «دليل ناجز» — the owner's corrected najiz guide (2026-10-28) as the page's
 * main tab (owner package 13 Nov, N06-6..10):
 *
 *   1. the six steps of filing a claim on najiz, as a numbered strip — the
 *      guide's own six steps (src/data/murshid/najiz-guide-2026-10-28.md
 *      «الباب الثاني»), nothing added;
 *   2. the 7 courts as cards with their real counts → a court's classes →
 *      a class's types (buttons, focus follows the drill-down);
 *   3. a search over every type, its class and its court, with the page's
 *      grammar, Arabic folding and a small synonyms list
 *      (src/lib/murshid/najizSearch.ts, najizSynonyms.ts), matches coloured;
 *   4. a card per type: its Najiz path (المحكمة › التصنيف › النوع) with a copy
 *      button, and «ابدأ صياغة هذه الدعوى» → /ai/draft with the three passed
 *      (src/lib/murshid/najizDraftLink.ts).
 *
 * GET /api/v1/murshid/najiz-guide returns the data (najizClassifications.ts),
 * without the PDF's tables or page references. Text only — no HTML from the
 * file is ever injected. The guide has no per-type filing requirements; the
 * card shows what it has (the type's description) and the class and court
 * notes sit above the types they govern.
 */

interface GuideResponse extends Partial<NajizClassifications> { sourceDate: string }

/**
 * `?v=2`: the route's body changed from `{ blocks }` to `{ steps, courts }`, and
 * murshid responses are publicly cached (an hour, stale for a day), so the new
 * page asks a new URL instead of reading an old cached body.
 */
const NAJIZ_GUIDE_URL = "/api/v1/murshid/najiz-guide?v=2";

type Icon = ComponentType<{ size?: number; weight?: "duotone" | "regular" | "fill"; className?: string }>;

/** An icon per court, by the guide's own title (an unknown title gets the book). */
const COURT_ICONS: readonly [RegExp, Icon][] = [
  [/الأحوال الشخصية/, Users],
  [/التجارية/, Storefront],
  [/العمالية/, HardHat],
  [/الجزائية/, Siren],
  [/العامة/, Scales],
  [/التنفيذ/, HandCoins],
  [/الإنهاءات/, Certificate],
];
const courtIcon = (court: NajizCourt): Icon => COURT_ICONS.find(([re]) => re.test(court.title))?.[1] ?? BookOpen;
const typesCount = (court: NajizCourt) => court.classes.reduce((n, k) => n + k.types.length, 0);
/** «نوع واحد»، «نوعان»، «٨ أنواع»، «١٢ نوعاً». */
const typesLabel = (n: number) =>
  n === 1 ? "نوع واحد" : n === 2 ? "نوعان" : n <= 10 ? `${toArabicDigits(n)} أنواع` : `${toArabicDigits(n)} نوعاً`;

interface View { court: number | null; klass: string | null }

export function MurshidNajizGuide({ isDark }: { isDark: boolean }) {
  const t = tone(isDark);
  const { data, failed } = useMurshidJson<GuideResponse>(NAJIZ_GUIDE_URL);
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const [view, setView] = useState<View>({ court: null, klass: null });

  // Focus follows the drill-down (not on first render): the new view's heading.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const navigated = useRef(false);
  useEffect(() => {
    if (!navigated.current) return;
    navigated.current = false;
    headingRef.current?.focus();
  }, [view]);
  const go = (next: View) => {
    navigated.current = true;
    setView(next);
  };

  const rows = useMemo(() => najizRows(data?.courts ?? []), [data]);
  const result = useMemo(() => (query ? searchNajiz(rows, query, NAJIZ_SYNONYMS) : null), [rows, query]);

  if (failed) return <p className={`text-[12px] ${t.muted}`}>تعذّر تحميل دليل ناجز — أعد تحميل الصفحة.</p>;
  if (!data) return <p className={`text-[12px] ${t.muted}`}>جارٍ تحميل دليل ناجز…</p>;
  const steps = data.steps ?? [];
  const courts = data.courts ?? [];
  const court = view.court === null ? null : courts.find((c) => c.no === view.court) ?? null;
  const klass = court && view.klass !== null ? court.classes.find((k) => k.no === view.klass) ?? null : null;

  const line = isDark ? "border-white/[0.06]" : "border-slate-100";
  const focusRing = `outline-none focus-visible:ring-2 ${isDark ? "focus-visible:ring-emerald-400/60" : "focus-visible:ring-[#0B3D2E]/40"}`;
  const tile = `${t.card} ${focusRing} w-full text-start p-4 transition-colors ${isDark ? "hover:border-emerald-400/30" : "hover:border-[#0B3D2E]/25"}`;
  const crumbBtn = `${focusRing} rounded-md underline-offset-2 hover:underline ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`;

  const renderNote = (n: NajizNote, key: number) => {
    const warn = n.kind === "warning" || n.kind === "important" || n.kind === "caution";
    return (
      <div key={key} className={`rounded-xl border px-3 py-2 flex gap-2 text-[11px] leading-relaxed ${
        warn
          ? isDark ? "border-amber-500/20 bg-amber-500/5 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-900"
          : isDark ? "border-white/[0.08] bg-zinc-900/60 text-zinc-300" : "border-slate-200 bg-slate-50 text-slate-700"
      }`}>
        {warn ? <Warning size={13} className="flex-shrink-0 mt-0.5 text-amber-500" /> : <Info size={13} className="flex-shrink-0 mt-0.5" />}
        <div className="space-y-1">{n.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
      </div>
    );
  };

  const typeCard = (c: NajizCourt, k: NajizClass, type: NajizType, terms?: readonly HighlightTerm[]) => (
    <NajizTypeCard key={`${c.no}-${type.no}`} isDark={isDark} court={c} klass={k} type={type} terms={terms} focusRing={focusRing}
      notes={typeNotes(k, type).map(renderNote)} />
  );

  // ── 1. the six steps ──────────────────────────────────────────────────────
  const stepsStrip = steps.length > 0 && (
    <details open className={`group ${t.card} px-4 py-3`}>
      <summary className={`flex items-center justify-between gap-2 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden rounded-lg ${focusRing}`}>
        <span className={`text-[13px] font-bold ${t.strong}`}>خطوات رفع صحيفة الدعوى في ناجز ({toArabicDigits(steps.length)})</span>
        <CaretDown size={14} className={`flex-shrink-0 transition-transform group-open:rotate-180 ${t.muted}`} />
      </summary>
      {/* A strip that scrolls sideways on a phone (one step per swipe), a grid from sm up. */}
      <ol className="mt-3 -mx-1 px-1 pb-1 flex gap-2 overflow-x-auto snap-x snap-mandatory sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:overflow-visible">
        {steps.map((s) => (
          <li key={s.no} className={`w-[78%] flex-shrink-0 snap-start sm:w-auto rounded-xl border p-3 ${line} ${isDark ? "bg-zinc-900/40" : "bg-slate-50/60"}`}>
            <div className="flex items-center gap-2">
              <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${isDark ? "bg-emerald-500/15 text-emerald-300" : "bg-[#0B3D2E] text-white"}`}>
                {toArabicDigits(s.no)}
              </span>
              <p className={`text-[12px] font-bold ${t.strong}`}>{s.title}</p>
            </div>
            <div className="mt-1.5 space-y-0.5">
              {s.lines.map((l, i) => <p key={i} className={`text-[11px] leading-relaxed ${t.body}`}>{l}</p>)}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );

  // ── 3. search ─────────────────────────────────────────────────────────────
  const searchBox = (
    <div>
      <label className="relative block">
        <MagnifyingGlass size={14} className={`absolute top-1/2 -translate-y-1/2 start-3 ${t.muted}`} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }}
          placeholder="ابحث في المحاكم والتصنيفات والأنواع (مثل: خلع، مقاولة، إخلاء عقار)"
          aria-label="البحث في دليل ناجز"
          aria-describedby="najiz-search-syntax"
          className={`${t.field} w-full ps-9 pe-9 py-2.5`}
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="مسح البحث"
            className={`absolute top-1/2 -translate-y-1/2 end-2 p-1 rounded-md ${focusRing} ${t.muted}`}>
            <X size={13} />
          </button>
        )}
      </label>
      <p id="najiz-search-syntax" className={`mt-1 text-[11px] ${t.muted}`}>
        {SEARCH_SYNTAX_HINT} · يشمل البحث المرادفات الشائعة (طلاق/خلع، إيجار/تأجير، عمالية/عمل…)
      </p>
    </div>
  );

  const searchResults = result && (
    <div className="space-y-3" aria-live="polite">
      <p className={`text-[11px] ${t.muted}`}>
        {result.hits.length === 0 ? "لا توجد نتائج مطابقة." : `${toArabicDigits(result.hits.length)} نوعاً مطابقاً`}
        {result.widened.map((w) => (
          <span key={w.label} className="ms-1">· «{w.label}» يشمل: {w.synonyms.join("، ")}</span>
        ))}
      </p>
      {groupHitsByClass(result.hits).map((g) => (
        <section key={`${g.court.no}-${g.klass.no}`} className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={`text-[12px] font-bold ${t.strong}`}>
              <Hl text={g.court.title} terms={result.highlightTerms} />
              <span className={`mx-1 ${t.muted}`}>›</span>
              <Hl text={g.klass.title} terms={result.highlightTerms} />
            </h3>
            <button type="button" onClick={() => { setQ(""); go({ court: g.court.no, klass: g.klass.no }); }}
              className={`text-[11px] font-semibold ${crumbBtn}`}>
              عرض التصنيف كاملاً
            </button>
          </div>
          <div className="space-y-2">{g.rows.map((r) => typeCard(r.court, r.klass, r.type, result.highlightTerms))}</div>
        </section>
      ))}
    </div>
  );

  // ── 2. courts → classes → types ───────────────────────────────────────────
  const crumbs = court && (
    <nav aria-label="موقعك في دليل ناجز" className={`text-[11px] ${t.muted}`}>
      <ol className="flex flex-wrap items-center gap-1">
        <li><button type="button" onClick={() => go({ court: null, klass: null })} className={crumbBtn}>المحاكم</button></li>
        <li aria-hidden>›</li>
        <li>
          {klass
            ? <button type="button" onClick={() => go({ court: court.no, klass: null })} className={crumbBtn}>{court.title}</button>
            : <span aria-current="page">{court.title}</span>}
        </li>
        {klass && (<><li aria-hidden>›</li><li><span aria-current="page">{klass.title}</span></li></>)}
      </ol>
    </nav>
  );

  const backButton = (label: string, to: View) => (
    <button type="button" onClick={() => go(to)}
      className={`inline-flex items-center gap-1.5 text-[12px] px-3 py-2 rounded-xl border transition-colors ${focusRing} ${isDark ? "border-white/[0.08] text-zinc-300 hover:text-zinc-100" : "border-slate-200 text-slate-600 hover:text-slate-800"}`}>
      <ArrowRight size={13} /> {label}
    </button>
  );

  let browse: ReactNode;
  if (!court) {
    browse = (
      <section className="space-y-2">
        <h3 ref={headingRef} tabIndex={-1} className={`text-[13px] font-bold outline-none ${t.strong}`}>
          المحاكم والمسارات ({toArabicDigits(courts.length)})
        </h3>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {courts.map((c) => {
            const CourtIcon = courtIcon(c);
            return (
              <li key={c.no}>
                <button type="button" onClick={() => go({ court: c.no, klass: null })} className={`${tile} flex items-center gap-3`}>
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-emerald-500/10 text-emerald-300" : "bg-[#0B3D2E]/5 text-[#0B3D2E]"}`}>
                    <CourtIcon size={20} weight="duotone" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-[13px] font-bold ${t.strong}`}>{c.title}</span>
                    <span className={`block text-[11px] ${t.muted}`}>
                      {toArabicDigits(c.classes.length)} تصنيفات فرعية · {typesLabel(typesCount(c))}
                    </span>
                  </span>
                  <CaretLeft size={14} className={`flex-shrink-0 ${t.muted}`} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  } else if (!klass) {
    browse = (
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">{backButton("كل المحاكم", { court: null, klass: null })}{crumbs}</div>
        <h3 ref={headingRef} tabIndex={-1} className={`text-[14px] font-bold outline-none ${t.strong}`}>{court.title}</h3>
        {(court.scopeIntro || court.scope.length > 0) && (
          <div className={`text-[11px] leading-relaxed ${t.body}`}>
            {court.scopeIntro && <p className="font-semibold">{court.scopeIntro}</p>}
            {court.scope.length > 0 && (
              <ul className="mt-1 space-y-0.5 list-disc ps-5">{court.scope.map((s, i) => <li key={i}>{s}</li>)}</ul>
            )}
          </div>
        )}
        {court.notes.map(renderNote)}
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {court.classes.map((k) => (
            <li key={k.no}>
              <button type="button" onClick={() => go({ court: court.no, klass: k.no })} className={`${tile} flex items-center gap-3`}>
                <span className="flex-1 min-w-0">
                  <span className={`block text-[12px] font-bold ${t.strong}`}>{k.title}</span>
                  <span className={`block text-[11px] ${t.muted}`}>
                    {typesLabel(k.types.length)}
                    {k.notes.length > 0 && <span className={`ms-1 ${t.warn}`}>· فيه ملاحظة</span>}
                  </span>
                </span>
                <CaretLeft size={14} className={`flex-shrink-0 ${t.muted}`} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  } else {
    browse = (
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">{backButton(court.title, { court: court.no, klass: null })}{crumbs}</div>
        <h3 ref={headingRef} tabIndex={-1} className={`text-[14px] font-bold outline-none ${t.strong}`}>
          {klass.title} <span className={`text-[12px] font-normal ${t.muted}`}>({toArabicDigits(klass.types.length)})</span>
        </h3>
        {classWideNotes(klass).map(renderNote)}
        {court.notes.map(renderNote)}
        <div className="space-y-2">{klass.types.map((type) => typeCard(court, klass, type))}</div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className={`text-[14px] font-bold ${t.strong}`}>دليل ناجز</h2>
        <p className={`mt-0.5 text-[12px] leading-relaxed ${t.muted}`}>
          خطوات رفع صحيفة الدعوى في ناجز، وجميع أنواع الدعاوى والطلبات والإنهاءات بتصنيفاتها الرئيسية والفرعية كما تظهر في البوابة —
          من دليل ناجز المنقح ({arabicDate(data.sourceDate)}). تصنيفات ناجز تتغير بقرارات وزارة العدل؛ تأكّد منها في البوابة قبل القيد.
        </p>
      </div>
      {stepsStrip}
      {searchBox}
      {result ? searchResults : browse}
    </div>
  );
}

/** ── 4. one najiz type: path + copy, description, «ابدأ صياغة هذه الدعوى». */
function NajizTypeCard({
  isDark, court, klass, type, terms, focusRing, notes,
}: {
  isDark: boolean;
  court: NajizCourt;
  klass: NajizClass;
  type: NajizType;
  terms?: readonly HighlightTerm[];
  focusRing: string;
  /** The class notes that cite this type's row («الصف N»), already rendered. */
  notes: ReactNode[];
}) {
  const t = tone(isDark);
  const crumb = najizBreadcrumb(court, klass, type);
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  useEffect(() => {
    if (copy === "idle") return;
    const id = setTimeout(() => setCopy("idle"), 2000);
    return () => clearTimeout(id);
  }, [copy]);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(crumb.text);
      setCopy("done");
    } catch {
      setCopy("failed");
    }
  };
  const h = (text: string) => (terms ? <Hl text={text} terms={terms} /> : text);

  return (
    <article className={`${t.card} p-4 space-y-2`} aria-label={type.name}>
      <div className="flex items-start gap-2">
        <nav aria-label="مسار التصنيف في ناجز" className={`flex-1 min-w-0 text-[11px] ${t.muted}`}>
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
            {crumb.parts.map((p, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 && <span aria-hidden>›</span>}
                <span className={i === 2 ? `font-semibold ${t.body}` : undefined}>{h(p)}</span>
              </li>
            ))}
          </ol>
        </nav>
        <button type="button" onClick={onCopy}
          aria-label={`نسخ مسار التصنيف: ${crumb.text}`}
          className={`flex-shrink-0 inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold ${focusRing} ${isDark ? "border-white/[0.08] text-zinc-300 hover:text-zinc-100" : "border-slate-200 text-slate-600 hover:text-slate-800"}`}>
          {copy === "done" ? <Check size={11} /> : <Copy size={11} />}
          {copy === "done" ? "نُسخ" : copy === "failed" ? "تعذّر النسخ" : "نسخ المسار"}
        </button>
      </div>
      <span role="status" className="sr-only">{copy === "done" ? "نُسخ مسار التصنيف" : copy === "failed" ? "تعذّر نسخ المسار" : ""}</span>
      <h4 className={`text-[13px] font-bold ${t.strong}`}>{h(type.name)}</h4>
      {type.description && <p className={`text-[12px] leading-relaxed ${t.body}`}>{h(type.description)}</p>}
      {notes}
      <div className="pt-1">
        <Link href={najizDraftHref(court, klass, type)}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold ${focusRing} ${isDark ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25" : "bg-[#0B3D2E] text-white hover:bg-[#0B3D2E]/90"}`}>
          <PencilLine size={13} /> ابدأ صياغة هذه الدعوى
        </Link>
      </div>
    </article>
  );
}
