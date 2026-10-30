"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { MagnifyingGlass, ArrowSquareOut, Warning, Phone } from "@phosphor-icons/react";
import { HighlightProvider, Hl } from "@/components/search/MultiColorHighlight";
import { CircuitEmail } from "./_data";
import { searchRows, SEARCH_SYNTAX_HINT } from "./_circuitsSearch";

/**
 * «الجهات الحكومية» tab of /ai/procedures (owner notes ١٥ / ٢٠, NOTE-20-C02/C03).
 * src/data/gov-agencies-directory.json: the 363 agencies of the owner's
 * «دليل الجهات وبوصلة التظلم المنقح 2026-10-28» (Part 4, pulled from
 * my.gov.sa on 2026-10-28) less its two test records — 361 rows. Every row
 * links to its own my.gov.sa page as the source, with the pull date.
 *
 * Phones and e-mails are shown exactly as my.gov.sa publishes them and are
 * all marked «غير مُتحقَّق»: the package carries no per-address mail check
 * (owner note ١٩ §٦ found dead domains in this same data), so an address is
 * shown as text to copy by hand — no mailto, no «معتمد».
 *
 * The JSON is ~390 KB, imported when the tab opens.
 */

interface Agency {
  id: string;
  category: string;
  name: string;
  shortName: string | null;
  description: string;
  hq: string | null;
  phones: string[];
  emails: string[];
  website: { label: string; url: string } | null;
  sourceUrl: string;
  retrievedAt: string;
  contactsVerified: boolean;
}

const PAGE_SIZE = 30;
const RETRIEVED_AR = "٢٨ أكتوبر ٢٠٢٦";

const agencyFields = (a: Agency) => [a.name, a.shortName, a.category, a.description, a.hq, ...a.emails, ...a.phones];

export function GovAgenciesDirectory({ isDark }: { isDark: boolean }) {
  const [rows, setRows] = useState<Agency[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const query = useDeferredValue(q);
  const [category, setCategory] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@/data/gov-agencies-directory.json")
      .then((m) => {
        const data = (m.default ?? m) as { agencies: Agency[] };
        if (!cancelled) setRows(data.agencies);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const categories = useMemo(
    () => (rows ? [...new Set(rows.map((r) => r.category))].sort((a, b) => a.localeCompare(b, "ar")) : []),
    [rows],
  );
  const scope = useMemo(() => (rows ? rows.filter((r) => !category || r.category === category) : []), [rows, category]);
  const result = useMemo(() => searchRows(scope, query, agencyFields), [scope, query]);

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const strong = isDark ? "text-zinc-100" : "text-slate-800";
  const field = `rounded-xl border px-3 py-2 text-[12px] outline-none ${isDark ? "bg-zinc-900 border-white/[0.08] text-zinc-200" : "bg-white border-slate-200 text-slate-700"}`;
  const link = `${isDark ? "text-emerald-400" : "text-[#0B3D2E]"} underline underline-offset-2`;

  if (failed) return <p className={`text-[12px] ${muted}`}>تعذّر تحميل دليل الجهات — أعد تحميل الصفحة.</p>;
  if (!rows) return <p className={`text-[12px] ${muted}`}>جارٍ تحميل دليل الجهات…</p>;

  const renderRow = (a: Agency) => {
    const expanded = open === a.id;
    return (
      <li key={a.id} className={`rounded-2xl border p-3.5 ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-100 bg-white shadow-sm"}`}>
        <p className={`text-[13px] font-bold ${strong}`}>
          <Hl text={a.name} />
          {a.shortName && <span className={`ms-1.5 text-[11px] font-normal ${muted}`}>(<Hl text={a.shortName} />)</span>}
        </p>
        <p className={`mt-0.5 text-[11px] ${muted}`}>
          <Hl text={a.category} />{a.hq && <> · <Hl text={a.hq} /></>}
        </p>
        {a.description && (
          <p className={`mt-1.5 text-[12px] leading-relaxed ${isDark ? "text-zinc-300" : "text-slate-600"} ${expanded ? "" : "line-clamp-2"}`}>
            <Hl text={a.description} />
          </p>
        )}
        {a.description.length > 140 && (
          <button type="button" onClick={() => setOpen(expanded ? null : a.id)} className={`mt-0.5 text-[11px] font-bold ${link}`}>
            {expanded ? "أقل" : "المزيد"}
          </button>
        )}
        {(a.phones.length > 0 || a.emails.length > 0) && (
          <div className="mt-2 space-y-1.5">
            {a.phones.map((p) => (
              <p key={p} className={`flex items-center gap-1.5 text-[12px] ${strong}`}>
                <Phone size={12} className={muted} />
                <span dir="ltr" className="font-mono select-all"><Hl text={p} /></span>
              </p>
            ))}
            {a.emails.map((e) => <CircuitEmail key={e} email={e} isDark={isDark} verified={false} />)}
            <p className={`inline-flex items-center gap-1 text-[10px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
              <Warning size={10} weight="fill" /> غير مُتحقَّق — كما نشرته المنصة الوطنية الموحدة؛ تأكّد منه قبل الاعتماد عليه
            </p>
          </div>
        )}
        <p className={`mt-2 text-[10px] flex flex-wrap gap-x-3 gap-y-1 ${muted}`}>
          {a.website && (
            <a href={a.website.url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-0.5 ${link}`}>
              الموقع: {a.website.label} <ArrowSquareOut size={10} />
            </a>
          )}
          <span>
            المصدر:{" "}
            <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className={link}>my.gov.sa</a>
            {" "}· سُحب في {RETRIEVED_AR}
          </span>
        </p>
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <p className={`text-[12px] leading-relaxed ${muted}`}>
        دليل الجهات الحكومية كما نشرته المنصة الوطنية الموحدة (my.gov.sa) — {rows.length.toLocaleString("ar-SA")} جهة في {categories.length.toLocaleString("ar-SA")} فئة، سُحب في {RETRIEVED_AR}.
        الهواتف وعناوين البريد لم يُتحقَّق من عملها.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <label className="relative flex-1">
          <MagnifyingGlass size={14} className={`absolute top-1/2 -translate-y-1/2 start-3 ${muted}`} />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setShown(PAGE_SIZE); }}
            placeholder="ابحث باسم الجهة أو اختصارها أو اختصاصها أو بريدها"
            aria-label="البحث في دليل الجهات الحكومية"
            aria-describedby="agencies-search-syntax"
            className={`${field} w-full ps-9`}
          />
        </label>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setShown(PAGE_SIZE); }} aria-label="فئة الجهة" className={field}>
          <option value="">كل الفئات</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <p id="agencies-search-syntax" className={`text-[11px] ${muted}`}>{SEARCH_SYNTAX_HINT}</p>

      <HighlightProvider query={query}>
        <div className="space-y-3">
          <p className={`text-[11px] ${muted}`} aria-live="polite">
            {result.matches.length === 0 ? "لا توجد نتائج مطابقة." : `${result.matches.length.toLocaleString("ar-SA")} نتيجة`}
          </p>
          {result.matches.length === 0 && result.parsed.terms.length > 0 && (
            <div className="space-y-2">
              <p className={`text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                {result.unmatchedTerms.length > 0
                  ? <>لم نجد أي جهة تحوي: {result.unmatchedTerms.map((t) => `«${t.label}»`).join("، ")}</>
                  : "لا توجد جهة واحدة تجمع كل الكلمات المطلوبة."}
              </p>
              {result.suggestions.length > 0 && (
                <>
                  <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>هل تقصد؟</p>
                  <ul className="space-y-2">{result.suggestions.map(renderRow)}</ul>
                </>
              )}
            </div>
          )}
          <ul className="space-y-2">{result.matches.slice(0, shown).map(renderRow)}</ul>
          {result.matches.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE_SIZE)}
              className={`w-full rounded-xl border py-2 text-[12px] font-bold ${isDark ? "border-white/[0.08] text-zinc-300 hover:bg-white/[0.04]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              عرض المزيد
            </button>
          )}
        </div>
      </HighlightProvider>
    </div>
  );
}
