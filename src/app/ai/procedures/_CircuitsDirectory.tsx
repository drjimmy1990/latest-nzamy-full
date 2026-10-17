"use client";

import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlass, MapPin } from "@phosphor-icons/react";
import { CircuitEmail } from "./_data";

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

const norm = (s: string) =>
  s.normalize("NFC").replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").toLowerCase();

export function CircuitsDirectory({ isDark }: { isDark: boolean }) {
  const [rows, setRows] = useState<CircuitRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    import("@/data/circuits-directory.json")
      .then((m) => {
        const data = (m.default ?? m) as { circuits: CircuitRecord[] };
        if (!cancelled) setRows(data.circuits);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const regions = useMemo(
    () => (rows ? [...new Set(rows.map((r) => r.region))].filter(Boolean).sort((a, b) => a.localeCompare(b, "ar")) : []),
    [rows],
  );

  const matches = useMemo(() => {
    if (!rows) return [];
    const terms = norm(q.trim()).split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (region && r.region !== region) return false;
      if (terms.length === 0) return true;
      const hay = norm(`${r.name} ${r.category} ${r.city} ${r.region} ${r.email}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [rows, q, region]);

  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const field = `rounded-xl border px-3 py-2 text-[12px] outline-none ${isDark ? "bg-zinc-900 border-white/[0.08] text-zinc-200" : "bg-white border-slate-200 text-slate-700"}`;

  if (failed) {
    return <p className={`text-[12px] ${muted}`}>تعذّر تحميل دليل الدوائر — أعد تحميل الصفحة.</p>;
  }
  if (!rows) {
    return <p className={`text-[12px] ${muted}`}>جارٍ تحميل دليل الدوائر…</p>;
  }

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
            className={`${field} w-full ps-9`}
          />
        </label>
        <select
          value={region}
          onChange={(e) => { setRegion(e.target.value); setShown(PAGE_SIZE); }}
          aria-label="المنطقة"
          className={field}
        >
          <option value="">كل المناطق</option>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <p className={`text-[11px] ${muted}`}>
        {matches.length === 0 ? "لا توجد نتائج مطابقة." : `${matches.length.toLocaleString("ar-SA")} نتيجة`}
      </p>
      <ul className="space-y-2">
        {matches.slice(0, shown).map((r) => (
          <li key={r.id} className={`rounded-2xl border p-3.5 ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-100 bg-white shadow-sm"}`}>
            <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{r.name}</p>
            <p className={`mt-0.5 mb-2 text-[11px] flex items-center gap-1 ${muted}`}>
              <MapPin size={11} className="text-amber-500 flex-shrink-0" />
              {[r.category, r.city, r.region].filter(Boolean).join(" · ")}
            </p>
            <CircuitEmail email={r.email} isDark={isDark} verified={!r.needsVerification} />
          </li>
        ))}
      </ul>
      {matches.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE_SIZE)}
          className={`w-full rounded-xl border py-2 text-[12px] font-bold ${isDark ? "border-white/[0.08] text-zinc-300 hover:bg-white/[0.04]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
        >
          عرض المزيد
        </button>
      )}
    </div>
  );
}
