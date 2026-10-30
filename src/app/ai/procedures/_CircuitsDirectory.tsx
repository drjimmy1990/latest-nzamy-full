"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { MagnifyingGlass, MapPin, Star } from "@phosphor-icons/react";
import { HighlightProvider, Hl } from "@/components/search/MultiColorHighlight";
import { getPreferences, patchPreferences, type CircuitFavorite } from "@/lib/services/preferencesService";
import { CircuitEmail } from "./_data";
import { circuitFields, searchRows, SEARCH_SYNTAX_HINT } from "./_circuitsSearch";
import { ProsecutionChannels } from "./_ProsecutionChannels";

/**
 * The circuits tab of /ai/procedures: the Ministry of Justice e-mail directory
 * (src/data/circuits-directory.json, 2,192 entries, parsed by
 * scripts/parsers/parse-circuits-directory.mjs with the owner's 52 corrections
 * and his answer ١٩٢ adopting the 36 once-flagged rows). It replaces a
 * 14-entry sample with placeholder addresses («c.court.r1@moj.gov.sa»,
 * sequential phones) that carried «غير مُتحقَّق» on every row.
 *
 * The JSON is about 1 MB, so it is imported when this tab renders, not with
 * the page; the list shows PAGE_SIZE matches at a time.
 *
 * Search (owner notes ١٩ / ٢٠, live test LIVE-F13, 2026-10-30): the platform's
 * one operator grammar — `+`/space AND, `/` OR, `"…"` phrase, `*` prefix,
 * `-` exclude — over name, category, city, region and e-mail
 * (_circuitsSearch.ts), every typed word in its own colour. «التجارية +
 * الرياض» used to return nothing because the `+` was searched as a word.
 * With no match: the words no row holds, «هل تقصد؟» (10 closest rows), and —
 * when the words point at the public prosecution — its own channels card,
 * which is also a category of its own in the filter (NOTE-19-C03).
 *
 * «المفضلة» (owner note ١٥ §٥): the signed-in user's own starred circuits,
 * each with a private note, stored in user_settings.preferences.circuitFavorites
 * through PATCH /api/v1/settings/preferences. Hidden where preferences cannot
 * be read (demo mode, no session).
 */

interface CircuitRecord {
  id: string;
  name: string;
  category: string;
  region: string;
  city: string;
  email: string;
  needsVerification: boolean;
}

const PAGE_SIZE = 30;
/** The filter value that switches the list to the public prosecution card. */
const PROSECUTION = "__public_prosecution";

export function CircuitsDirectory({ isDark }: { isDark: boolean }) {
  const [rows, setRows] = useState<CircuitRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const query = useDeferredValue(q);
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [favorites, setFavorites] = useState<CircuitFavorite[] | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [favError, setFavError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@/data/circuits-directory.json")
      .then((m) => {
        const data = (m.default ?? m) as { circuits: CircuitRecord[] };
        if (!cancelled) setRows(data.circuits);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    getPreferences().then((prefs) => {
      if (!cancelled && prefs) setFavorites(Array.isArray(prefs.circuitFavorites) ? prefs.circuitFavorites : []);
    });
    return () => { cancelled = true; };
  }, []);

  const regions = useMemo(
    () => (rows ? [...new Set(rows.map((r) => r.region))].filter(Boolean).sort((a, b) => a.localeCompare(b, "ar")) : []),
    [rows],
  );
  const categories = useMemo(
    () => (rows ? [...new Set(rows.map((r) => r.category))].filter(Boolean).sort((a, b) => a.localeCompare(b, "ar")) : []),
    [rows],
  );
  const favIds = useMemo(() => new Set((favorites ?? []).map((f) => f.id)), [favorites]);

  const scope = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) =>
      (!region || r.region === region) &&
      (!category || r.category === category) &&
      (!favOnly || favIds.has(r.id)));
  }, [rows, region, category, favOnly, favIds]);

  const result = useMemo(() => searchRows(scope, query, circuitFields), [scope, query]);

  async function saveFavorites(next: CircuitFavorite[]) {
    const previous = favorites;
    setFavorites(next);
    setFavError(null);
    try {
      const saved = await patchPreferences({ circuitFavorites: next });
      setFavorites(saved.circuitFavorites ?? next);
    } catch (e) {
      setFavorites(previous);
      setFavError(e instanceof Error && e.message ? e.message : "تعذّر حفظ المفضلة.");
    }
  }

  function toggleFavorite(id: string) {
    if (!favorites) return;
    saveFavorites(favIds.has(id) ? favorites.filter((f) => f.id !== id) : [{ id }, ...favorites]);
  }

  function saveNote(id: string, note: string) {
    if (!favorites) return;
    const current = favorites.find((f) => f.id === id);
    if (!current || (current.note ?? "") === note.trim()) return;
    saveFavorites(favorites.map((f) => (f.id === id ? (note.trim() ? { id, note: note.trim() } : { id }) : f)));
  }

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const field = `rounded-xl border px-3 py-2 text-[12px] outline-none ${isDark ? "bg-zinc-900 border-white/[0.08] text-zinc-200" : "bg-white border-slate-200 text-slate-700"}`;
  const cardCls = `rounded-2xl border p-3.5 ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-100 bg-white shadow-sm"}`;

  if (failed) {
    return <p className={`text-[12px] ${muted}`}>تعذّر تحميل دليل الدوائر — أعد تحميل الصفحة.</p>;
  }
  if (!rows) {
    return <p className={`text-[12px] ${muted}`}>جارٍ تحميل دليل الدوائر…</p>;
  }

  const prosecutionOnly = category === PROSECUTION;

  const renderRow = (r: CircuitRecord) => {
    const fav = favorites?.find((f) => f.id === r.id);
    return (
      <li key={r.id} className={cardCls}>
        <div className="flex items-start gap-2">
          <p className={`flex-1 text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}><Hl text={r.name} /></p>
          {favorites && (
            <button
              type="button"
              onClick={() => toggleFavorite(r.id)}
              aria-pressed={Boolean(fav)}
              aria-label={fav ? `إزالة ${r.name} من المفضلة` : `إضافة ${r.name} إلى المفضلة`}
              title={fav ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
              className={`flex-shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-lg ${isDark ? "hover:bg-white/[0.06]" : "hover:bg-slate-50"}`}
            >
              <Star size={15} weight={fav ? "fill" : "regular"} className={fav ? "text-amber-500" : muted} />
            </button>
          )}
        </div>
        <p className={`mt-0.5 mb-2 text-[11px] flex items-center gap-1 flex-wrap ${muted}`}>
          <MapPin size={11} className="text-amber-500 flex-shrink-0" />
          {[r.category, r.city, r.region].filter(Boolean).map((part, i) => (
            <span key={i}>{i > 0 && " · "}<Hl text={part} /></span>
          ))}
        </p>
        <CircuitEmail email={r.email} isDark={isDark} verified={!r.needsVerification} />
        {fav && favOnly && (
          <label className="block mt-2">
            <span className="sr-only">ملاحظتي على {r.name}</span>
            <input
              defaultValue={fav.note ?? ""}
              maxLength={300}
              placeholder="ملاحظة خاصة بك على هذه الدائرة (لا يراها غيرك)"
              onBlur={(e) => saveNote(r.id, e.target.value)}
              className={`${field} w-full`}
            />
          </label>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <p className={`text-[12px] leading-relaxed ${muted}`}>
        دليل البريد الإلكتروني للجهات والإدارات والدوائر القضائية — وزارة العدل ({rows.length.toLocaleString("ar-SA")} عنواناً).
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <label className="relative flex-1">
          <MagnifyingGlass size={14} className={`absolute top-1/2 -translate-y-1/2 start-3 ${muted}`} />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setShown(PAGE_SIZE); }}
            placeholder="ابحث باسم المحكمة أو الدائرة أو المدينة أو البريد"
            aria-label="البحث في دليل الدوائر"
            aria-describedby="circuits-search-syntax"
            className={`${field} w-full ps-9`}
          />
        </label>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setShown(PAGE_SIZE); }}
          aria-label="الفئة"
          className={field}
        >
          <option value="">كل الفئات</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          <option value={PROSECUTION}>النيابة العامة (جهة مستقلة)</option>
        </select>
        {!prosecutionOnly && (
          <select
            value={region}
            onChange={(e) => { setRegion(e.target.value); setShown(PAGE_SIZE); }}
            aria-label="المنطقة"
            className={field}
          >
            <option value="">كل المناطق</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </div>
      <p id="circuits-search-syntax" className={`text-[11px] ${muted}`}>{SEARCH_SYNTAX_HINT}</p>

      {favorites && !prosecutionOnly && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setFavOnly((v) => !v); setShown(PAGE_SIZE); }}
            aria-pressed={favOnly}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-bold ${
              favOnly
                ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
                : isDark ? "border-white/[0.08] text-zinc-300" : "border-slate-200 text-slate-600"
            }`}
          >
            <Star size={12} weight={favOnly ? "fill" : "regular"} /> المفضلة ({favorites.length.toLocaleString("ar-SA")})
          </button>
          {favError && <span role="alert" className="text-[11px] text-red-500">{favError}</span>}
        </div>
      )}

      {prosecutionOnly ? (
        <ProsecutionChannels isDark={isDark} lead="النيابة العامة جهة مستقلة عن وزارة العدل، فلا تظهر في دليل الوزارة. هذه قنواتها الموثقة بمصدر وتاريخ تحقق." />
      ) : (
        <HighlightProvider query={query}>
          <div className="space-y-3">
          {result.mentionsProsecution && <ProsecutionChannels isDark={isDark} />}

          <p className={`text-[11px] ${muted}`} aria-live="polite">
            {result.matches.length === 0
              ? favOnly && favIds.size === 0 ? "لم تُضف أي دائرة إلى المفضلة بعد — اضغط النجمة بجانب الدائرة." : "لا توجد نتائج مطابقة."
              : `${result.matches.length.toLocaleString("ar-SA")} نتيجة`}
          </p>

          {result.matches.length === 0 && result.parsed.terms.length > 0 && (
            <div className="space-y-2">
              {result.unmatchedTerms.length > 0 ? (
                <p className={`text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                  لم نجد أي جهة تحوي:{" "}
                  {result.unmatchedTerms.map((t, i) => (
                    <span key={t.label}>
                      {i > 0 && "، "}«<span className="font-bold">{t.label}</span>»
                    </span>
                  ))}
                </p>
              ) : (
                <p className={`text-[12px] ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                  لا توجد جهة واحدة تجمع كل الكلمات المطلوبة.
                </p>
              )}
              {result.suggestions.length > 0 && (
                <>
                  <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>هل تقصد؟</p>
                  <ul className="space-y-2">{result.suggestions.map(renderRow)}</ul>
                </>
              )}
            </div>
          )}

          <ul className="space-y-2">
            {result.matches.slice(0, shown).map(renderRow)}
          </ul>
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
      )}
    </div>
  );
}
