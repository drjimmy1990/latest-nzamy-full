"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { CaretDown, Info, MagnifyingGlass, Warning } from "@phosphor-icons/react";
import { HighlightProvider, Hl } from "@/components/search/MultiColorHighlight";
import { toArabicDigits } from "@/lib/services/arabicCount";
import type { NajizClass, NajizClassifications, NajizCourt, NajizNote, NajizType } from "@/lib/murshid/najizClassifications";
import { searchRows, SEARCH_SYNTAX_HINT } from "./_circuitsSearch";
import { arabicDate, tone, useMurshidJson } from "./_murshidShared";

/**
 * «دليل ناجز» — the owner's corrected najiz guide (2026-10-28): the six filing
 * steps on najiz and all 243 claim/request types in 7 main and 43 sub
 * classifications. GET /api/v1/murshid/najiz-guide returns them as data
 * (src/lib/murshid/najizClassifications.ts), without the PDF's tables or its
 * «ص N» page references (owner package 13 Nov, N06-4 / N06-5): each court
 * opens to its classes, each class to its types. Text only — no HTML from the
 * file is ever injected.
 *
 * The search keeps only the types that match (with their court and class),
 * using the page's search grammar.
 */

interface GuideResponse extends NajizClassifications { sourceDate: string }
interface TypeRow { court: NajizCourt; klass: NajizClass; type: NajizType }

const typesCount = (court: NajizCourt) => court.classes.reduce((n, k) => n + k.types.length, 0);
const rowFields = (r: TypeRow) => [r.type.name, r.type.description, r.klass.title, r.court.title];

export function MurshidNajizGuide({ isDark }: { isDark: boolean }) {
  const t = tone(isDark);
  const { data, failed } = useMurshidJson<GuideResponse>("/api/v1/murshid/najiz-guide");
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());

  const rows = useMemo<TypeRow[]>(
    () => (data?.courts ?? []).flatMap((court) => court.classes.flatMap((klass) => klass.types.map((type) => ({ court, klass, type })))),
    [data],
  );
  const matches = useMemo(() => (query ? searchRows(rows, query, rowFields).matches : null), [rows, query]);

  if (failed) return <p className={`text-[12px] ${t.muted}`}>تعذّر تحميل دليل ناجز — أعد تحميل الصفحة.</p>;
  if (!data) return <p className={`text-[12px] ${t.muted}`}>جارٍ تحميل دليل ناجز…</p>;

  const line = isDark ? "border-white/[0.06]" : "border-slate-100";
  const summary = `flex items-center justify-between gap-2 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden`;
  const caret = `flex-shrink-0 transition-transform group-open:rotate-180 ${t.muted}`;

  const renderNote = (n: NajizNote, key: number) => {
    const warn = n.kind === "warning" || n.kind === "important" || n.kind === "caution";
    return (
      <div key={key} className={`rounded-xl border px-3 py-2 flex gap-2 text-[11px] leading-relaxed ${
        warn
          ? isDark ? "border-amber-500/20 bg-amber-500/5 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-900"
          : isDark ? "border-white/[0.08] bg-zinc-900/60 text-zinc-300" : "border-slate-200 bg-slate-50 text-slate-700"
      }`}>
        {warn ? <Warning size={13} className="flex-shrink-0 mt-0.5 text-amber-500" /> : <Info size={13} className="flex-shrink-0 mt-0.5" />}
        <div className="space-y-1">{n.lines.map((l, i) => <p key={i}><Hl text={l} /></p>)}</div>
      </div>
    );
  };

  const renderType = (type: NajizType) => (
    <li key={type.no} className={`py-2 border-t first:border-t-0 ${line}`}>
      <p className={`text-[12px] font-bold ${t.strong}`}>
        <span className={`me-1.5 text-[10px] font-semibold ${t.muted}`}>{toArabicDigits(type.no)}</span>
        <Hl text={type.name} />
      </p>
      {type.description && <p className={`mt-0.5 text-[11px] leading-relaxed ${t.body}`}><Hl text={type.description} /></p>}
    </li>
  );

  return (
    <div className="space-y-3">
      <div>
        <h2 className={`text-[14px] font-bold ${t.strong}`}>دليل ناجز</h2>
        <p className={`mt-0.5 text-[12px] leading-relaxed ${t.muted}`}>
          خطوات رفع صحيفة الدعوى في ناجز، وجميع أنواع الدعاوى والطلبات والإنهاءات بتصنيفاتها الرئيسية والفرعية كما تظهر في البوابة —
          من دليل ناجز المنقح ({arabicDate(data.sourceDate)}). تصنيفات ناجز تتغير بقرارات وزارة العدل؛ تأكّد منها في البوابة قبل القيد.
        </p>
      </div>

      {data.steps.length > 0 && (
        <details className={`group ${t.card} px-4 py-3`}>
          <summary className={summary}>
            <span className={`text-[13px] font-bold ${t.strong}`}>خطوات رفع صحيفة الدعوى في ناجز ({toArabicDigits(data.steps.length)})</span>
            <CaretDown size={14} className={caret} />
          </summary>
          <ol className="mt-3 space-y-2.5">
            {data.steps.map((s) => (
              <li key={s.no} className="flex gap-2.5">
                <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${t.chip}`}>{toArabicDigits(s.no)}</span>
                <div className="min-w-0">
                  <p className={`text-[12px] font-bold ${t.strong}`}>{s.title}</p>
                  {s.lines.map((l, i) => <p key={i} className={`text-[11px] leading-relaxed ${t.body}`}>{l}</p>)}
                </div>
              </li>
            ))}
          </ol>
        </details>
      )}

      <label className="relative block">
        <MagnifyingGlass size={14} className={`absolute top-1/2 -translate-y-1/2 start-3 ${t.muted}`} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث عن نوع الدعوى أو الطلب (مثل: نفقة، شيك، أجرة)"
          aria-label="البحث في دليل ناجز"
          aria-describedby="najiz-search-syntax"
          className={`${t.field} w-full ps-9`}
        />
      </label>
      <p id="najiz-search-syntax" className={`text-[11px] ${t.muted}`}>{SEARCH_SYNTAX_HINT}</p>

      <HighlightProvider query={query}>
        {matches ? (
          <div className="space-y-2" aria-live="polite">
            <p className={`text-[11px] ${t.muted}`}>{matches.length === 0 ? "لا توجد نتائج مطابقة." : `${toArabicDigits(matches.length)} نتيجة`}</p>
            {matches.length > 0 && (
              <ul className={`${t.card} px-4 py-1`}>
                {matches.map((r) => (
                  <li key={r.type.no} className={`py-2 border-t first:border-t-0 ${line}`}>
                    <p className={`text-[10px] ${t.muted}`}>
                      <Hl text={r.court.title} /> ◂ <Hl text={r.klass.title} />
                    </p>
                    <p className={`mt-0.5 text-[12px] font-bold ${t.strong}`}><Hl text={r.type.name} /></p>
                    {r.type.description && <p className={`mt-0.5 text-[11px] leading-relaxed ${t.body}`}><Hl text={r.type.description} /></p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {data.courts.map((court) => (
              <details key={court.no} className={`group ${t.card} px-4 py-3`}>
                <summary className={summary}>
                  <span className="min-w-0">
                    <span className={`block text-[13px] font-bold ${t.strong}`}>{court.title}</span>
                    <span className={`block text-[11px] ${t.muted}`}>
                      {toArabicDigits(court.classes.length)} تصنيفات فرعية · {toArabicDigits(typesCount(court))} نوعاً
                    </span>
                  </span>
                  <CaretDown size={14} className={caret} />
                </summary>
                <div className="mt-3 space-y-2">
                  {(court.scopeIntro || court.scope.length > 0) && (
                    <div className={`text-[11px] leading-relaxed ${t.body}`}>
                      {court.scopeIntro && <p className="font-semibold">{court.scopeIntro}</p>}
                      {court.scope.length > 0 && (
                        <ul className="mt-1 space-y-0.5 list-disc ps-5">
                          {court.scope.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      )}
                    </div>
                  )}
                  {court.notes.map(renderNote)}
                  {court.classes.map((klass) => (
                    <details key={klass.no} className={`group/klass rounded-xl border px-3 py-2 ${line}`}>
                      <summary className={summary}>
                        <span className={`text-[12px] font-bold ${t.strong}`}>
                          {klass.title} <span className={`font-normal ${t.muted}`}>({toArabicDigits(klass.types.length)})</span>
                        </span>
                        <CaretDown size={12} className={`flex-shrink-0 transition-transform group-open/klass:rotate-180 ${t.muted}`} />
                      </summary>
                      <div className="mt-2 space-y-2">
                        {klass.notes.map(renderNote)}
                        <ul>{klass.types.map(renderType)}</ul>
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </HighlightProvider>
    </div>
  );
}
