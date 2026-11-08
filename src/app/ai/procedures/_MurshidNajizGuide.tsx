"use client";

import { Fragment, useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { Info, MagnifyingGlass, Warning } from "@phosphor-icons/react";
import { HighlightProvider, Hl } from "@/components/search/MultiColorHighlight";
import { toArabicDigits } from "@/lib/services/arabicCount";
import { parseInline, plainText, type GuideBlock } from "@/lib/murshid/guideBlocks";
import { searchRows, SEARCH_SYNTAX_HINT } from "./_circuitsSearch";
import { arabicDate, tone, useMurshidJson } from "./_murshidShared";

/**
 * «دليل ناجز» — the owner's corrected najiz guide (2026-10-28): the six filing
 * steps on najiz and all 243 claim/request types in 7 main and 43 sub
 * classifications. GET /api/v1/murshid/najiz-guide returns it as plain blocks
 * (src/lib/murshid/guideBlocks.ts); this renders them as React elements that
 * hold text — no HTML from the file is ever injected.
 *
 * The filter keeps only the table rows that match (with the heading they sit
 * under), using the page's search grammar.
 */

interface GuideResponse { sourceDate: string; blocks: GuideBlock[] }
type Table = Extract<GuideBlock, { type: "table" }>;

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((s, i) => {
        if (s.t === "strong") return <strong key={i} className="font-bold"><Hl text={s.v} /></strong>;
        if (s.t === "em") return <em key={i}><Hl text={s.v} /></em>;
        if (s.t === "code") return <span key={i} className="font-semibold"><Hl text={s.v} /></span>;
        return <Fragment key={i}><Hl text={s.v} /></Fragment>;
      })}
    </>
  );
}

function Lines({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((l, i) => (
        <span key={i} className="block"><Inline text={l} /></span>
      ))}
    </>
  );
}

const rowText = (row: string[][]) => row.flat().map(plainText);

export function MurshidNajizGuide({ isDark }: { isDark: boolean }) {
  const t = tone(isDark);
  const { data, failed } = useMurshidJson<GuideResponse>("/api/v1/murshid/najiz-guide");
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());

  const filtered = useMemo(() => {
    if (!data || !query) return null;
    const out: { heading: string; table: Table }[] = [];
    let heading = "";
    let total = 0;
    for (const b of data.blocks) {
      if (b.type === "heading" && b.level <= 4) heading = b.text;
      if (b.type !== "table") continue;
      const rows = searchRows(b.rows, query, rowText).matches;
      if (rows.length) {
        out.push({ heading, table: { ...b, rows } });
        total += rows.length;
      }
    }
    return { groups: out, total };
  }, [data, query]);

  if (failed) return <p className={`text-[12px] ${t.muted}`}>تعذّر تحميل دليل ناجز — أعد تحميل الصفحة.</p>;
  if (!data) return <p className={`text-[12px] ${t.muted}`}>جارٍ تحميل دليل ناجز…</p>;

  const renderTable = (b: Table, key: string | number) => (
    <div key={key} className={`overflow-x-auto rounded-xl border ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
      <table className="w-full min-w-[560px] text-[11px] leading-relaxed border-collapse">
        {b.header.length > 0 && (
          <thead className={isDark ? "bg-zinc-800 text-zinc-300" : "bg-slate-100 text-slate-700"}>
            <tr>{b.header.map((c, i) => <th key={i} scope="col" className="px-2 py-1.5 text-start font-bold align-bottom"><Lines lines={c} /></th>)}</tr>
          </thead>
        )}
        <tbody>
          {b.rows.map((r, i) => (
            <tr key={i} className={`border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
              {r.map((c, j) => <td key={j} className={`px-2 py-1.5 align-top ${t.body}`}><Lines lines={c} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderBlock = (b: GuideBlock, i: number): ReactNode => {
    switch (b.type) {
      case "heading": {
        const size = b.level <= 2 ? "text-[14px]" : b.level === 3 ? "text-[13px]" : "text-[12px]";
        return <p key={i} role="heading" aria-level={Math.min(6, b.level + 1)} className={`${size} font-bold pt-2 ${t.strong}`}><Inline text={b.text} /></p>;
      }
      case "paragraph":
        return <p key={i} className={`text-[12px] leading-relaxed ${t.body}`}><Inline text={b.text} /></p>;
      case "item":
        return (
          <p key={i} className={`text-[12px] leading-relaxed flex gap-1.5 ${t.body}`} style={{ paddingInlineStart: `${b.depth * 1}rem` }}>
            <span className={`flex-shrink-0 ${t.muted}`}>{b.marker}</span>
            <span><Inline text={b.text} /></span>
          </p>
        );
      case "callout": {
        const warn = b.kind === "warning" || b.kind === "important" || b.kind === "caution";
        return (
          <div key={i} className={`rounded-xl border px-3 py-2 flex gap-2 text-[11px] leading-relaxed ${
            warn
              ? isDark ? "border-amber-500/20 bg-amber-500/5 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-900"
              : isDark ? "border-white/[0.08] bg-zinc-900/60 text-zinc-300" : "border-slate-200 bg-slate-50 text-slate-700"
          }`}>
            {warn ? <Warning size={13} className="flex-shrink-0 mt-0.5 text-amber-500" /> : <Info size={13} className="flex-shrink-0 mt-0.5" />}
            <div className="space-y-1"><Lines lines={b.lines} /></div>
          </div>
        );
      }
      case "table":
        return renderTable(b, i);
      case "code":
        return <p key={i} className={`text-[11px] whitespace-pre-wrap ${t.muted}`}>{b.text}</p>;
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className={`text-[14px] font-bold ${t.strong}`}>دليل ناجز</h2>
        <p className={`mt-0.5 text-[12px] leading-relaxed ${t.muted}`}>
          خطوات رفع صحيفة الدعوى في ناجز، وجميع أنواع الدعاوى والطلبات والإنهاءات بتصنيفاتها الرئيسية والفرعية كما تظهر في البوابة —
          من دليل ناجز المنقح ({arabicDate(data.sourceDate)}). تصنيفات ناجز تتغير بقرارات وزارة العدل؛ تأكّد منها في البوابة قبل القيد.
        </p>
      </div>

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
        {filtered ? (
          <div className="space-y-3" aria-live="polite">
            <p className={`text-[11px] ${t.muted}`}>{filtered.total === 0 ? "لا توجد نتائج مطابقة." : `${toArabicDigits(filtered.total)} نتيجة`}</p>
            {filtered.groups.map((g, i) => (
              <section key={i} className="space-y-1.5">
                {g.heading && <p className={`text-[12px] font-bold ${t.strong}`}><Inline text={g.heading} /></p>}
                {renderTable(g.table, `f${i}`)}
              </section>
            ))}
          </div>
        ) : (
          <div className="space-y-2">{data.blocks.map(renderBlock)}</div>
        )}
      </HighlightProvider>
    </div>
  );
}
