"use client";

/**
 * CircuitsDirectory — the ONE directory of Ministry of Justice e-mails
 * (src/data/circuits-directory.json, 2,192 courts, circuits and offices), used
 * by every page that lists them (owner note ٠٧: «مكون مشترك واحد موحّد» in
 * place of three diverging copies).
 *
 * - The search box runs the platform grammar over name + category + city +
 *   region + e-mail at once (filterCircuits): space / `+` AND, `"…"` phrase,
 *   `/` OR, `word*` prefix, `-word` excluded, with hamza / ة-ه / ى-ي and
 *   0-9 / ٠-٩ folding — so «تنفيذ + الرياض», «جده», «الدائرة 1» all find rows.
 * - Matches are coloured per term (<Hl>) in the name, category, city / region
 *   and e-mail, with the legend bar (chips, counts, ↑ ↓, ✕) above the list.
 * - The list grows as the reader scrolls (an IntersectionObserver on a
 *   sentinel), with «تحميل المزيد» as the fallback — no page arrows.
 * - One click copies an e-mail.
 *
 * The page keeps its own header, stats and role / plan gating; this component
 * is only the search, filters and list. The rows come in as a prop, so a page
 * may import the JSON statically or load it lazily.
 */

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Bank, Buildings, Check, Copy, Envelope, FileText, MagnifyingGlass, Scales, ShieldCheck, Warning, X,
} from "@phosphor-icons/react";
import { copyToClipboard } from "@/lib/services/publicProfileLink";
import { filterCircuits, type CircuitVerification } from "@/lib/search/circuitsDirectoryFilter";
import { HighlightProvider, Hl, SearchLegendBar } from "@/components/search/MultiColorHighlight";

export interface CircuitRecord {
  id: string;
  page?: number;
  name: string;
  category: string;
  region: string;
  city: string;
  email: string;
  rawEmail?: string;
  needsVerification: boolean;
  suggestedEmail?: string | null;
  verificationStatus?: string;
}

const ALL = "الكل";

const CATEGORY_COLORS: Record<string, string> = {
  "محكمة عامة": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  "محكمة جزائية": "bg-purple-500/10 text-purple-500 border-purple-500/20",
  "محكمة تنفيذ": "bg-amber-500/10 text-amber-500 border-amber-500/20",
  "كتابة عدل": "bg-teal-500/10 text-teal-500 border-teal-500/20",
  "استئناف": "bg-orange-500/10 text-orange-500 border-orange-500/20",
  "إدارة وفروع الوزارة": "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  "محاكم ودوائر قضائية": "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  "محكمة تجارية": "bg-[#C8A762]/10 text-[#C8A762] border-[#C8A762]/30",
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "محكمة عامة": Scales,
  "محكمة جزائية": Scales,
  "محكمة تنفيذ": FileText,
  "كتابة عدل": Buildings,
  "استئناف": Bank,
  "إدارة وفروع الوزارة": Buildings,
  "محكمة تجارية": Scales,
};

const OPERATOR_HINT = 'مثال: تنفيذ + الرياض · "المحكمة العامة" · جدة / مكة · تجاري* · -كتابة';

const fmt = (n: number) => n.toLocaleString("en-US");

function CircuitCard({ circuit, isDark, card }: { circuit: CircuitRecord; isDark: boolean; card: string }) {
  const [copied, setCopied] = useState(false);
  const Icon = CATEGORY_ICONS[circuit.category] ?? Buildings;

  const handleCopy = async () => {
    const ok = await copyToClipboard(circuit.email);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <li className={`${card} p-5 transition-colors`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${isDark ? "bg-white/[0.05]" : "bg-slate-50"}`}>
            <Icon size={20} className="text-royal" weight="duotone" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
                <Hl text={circuit.name} />
              </h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[circuit.category] || "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"}`}>
                <Hl text={circuit.category} />
              </span>
              {circuit.needsVerification ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full border px-2 py-0.5 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Warning size={11} weight="fill" /> يتطلب تحققاً
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full border px-2 py-0.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck size={11} weight="fill" /> رسمي معتمد
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span><Hl text={circuit.region} /></span>
              {circuit.city && circuit.city !== circuit.region && (
                <>
                  <span aria-hidden>•</span>
                  <span><Hl text={circuit.city} /></span>
                </>
              )}
              {typeof circuit.page === "number" && (
                <>
                  <span aria-hidden>•</span>
                  <span>صفحة {circuit.page} بالدليل الرسمي</span>
                </>
              )}
            </div>

            {circuit.needsVerification && (circuit.rawEmail || circuit.suggestedEmail) && (
              <div className="mt-2 text-[11px] p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <Warning size={13} weight="fill" />
                  <span>تنبيه خطأ طباعي (bidi) في المصدر الرسمي:</span>
                </div>
                <div className="font-mono text-[11px] flex flex-wrap gap-2 text-zinc-600 dark:text-zinc-300">
                  {circuit.rawEmail && (
                    <span>الصيغة في المصدر: <code className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded">{circuit.rawEmail}</code></span>
                  )}
                  {circuit.suggestedEmail && (
                    <span>الصيغة المرجحة: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{circuit.suggestedEmail}</strong></span>
                  )}
                </div>
                {circuit.verificationStatus && <p className="text-[10px] opacity-80">{circuit.verificationStatus}</p>}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${isDark ? "bg-zinc-950/60 border-white/[0.08]" : "bg-slate-50 border-slate-200"}`}>
            <span dir="ltr" className={`font-mono text-[12px] select-all ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
              <Hl text={circuit.email} />
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className={`p-1.5 rounded-lg border transition-colors ${
                copied
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                  : isDark
                  ? "border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.06]"
                  : "border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              }`}
              title={copied ? "تم النسخ" : "نسخ البريد الإلكتروني"}
              aria-label={copied ? "تم نسخ البريد" : "نسخ البريد"}
            >
              {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
            </button>
            <a
              href={`mailto:${circuit.email}`}
              className={`p-1.5 rounded-lg border transition-colors ${
                isDark
                  ? "border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.06]"
                  : "border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              }`}
              title="إرسال بريد"
              aria-label="إرسال بريد"
            >
              <Envelope size={14} className="text-blue-500" />
            </a>
          </div>
        </div>
      </div>
    </li>
  );
}

export interface CircuitsDirectoryProps {
  circuits: readonly CircuitRecord[];
  isDark: boolean;
  /** Region chips; «الكل» is added in front. Default: the regions present in the data. */
  regions?: readonly string[];
  /** Category chips (default off). */
  showCategoryFilter?: boolean;
  /** «معتمد / يتطلب تحققاً» chips (default off). */
  showVerificationFilter?: boolean;
  /** Rows added per scroll step. */
  pageSize?: number;
  searchPlaceholder?: string;
}

export function CircuitsDirectory({
  circuits,
  isDark,
  regions,
  showCategoryFilter = false,
  showVerificationFilter = false,
  pageSize = 30,
  searchPlaceholder = "ابحث باسم المحكمة، الدائرة، المدينة، المنطقة، أو البريد الإلكتروني...",
}: CircuitsDirectoryProps) {
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [verification, setVerification] = useState<CircuitVerification>("all");
  const [shown, setShown] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // The filter runs on the deferred text: typing stays responsive over 2,192 rows.
  const query = useDeferredValue(search);

  const regionChips = useMemo(
    () => [ALL, ...(regions ?? [...new Set(circuits.map((c) => c.region))].filter(Boolean).sort((a, b) => a.localeCompare(b, "ar")))],
    [regions, circuits],
  );
  const categoryChips = useMemo(
    () => [ALL, ...[...new Set(circuits.map((c) => c.category))].filter(Boolean)],
    [circuits],
  );
  const flaggedCount = useMemo(() => circuits.filter((c) => c.needsVerification).length, [circuits]);

  const filtered = useMemo(
    () => filterCircuits(circuits, { query, region, category, verification }),
    [circuits, query, region, category, verification],
  );

  // A new search or filter starts the list from the top.
  useEffect(() => setShown(pageSize), [query, region, category, verification, pageSize]);

  const visible = filtered.slice(0, shown);
  const hasMore = filtered.length > shown;

  // Infinite scroll: the next step loads as the sentinel nears the viewport.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setShown((n) => n + pageSize); },
      { rootMargin: "600px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, pageSize, visible.length]);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const chip = (active: boolean, activeClass = "bg-[#0B3D2E] text-white") =>
    `px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
      active ? activeClass : isDark ? "bg-zinc-800/80 text-zinc-400 hover:text-zinc-200" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
    }`;
  const label = `text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-slate-600"}`;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Search + filters */}
      <div className={`${card} p-5 space-y-4`}>
        <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border ${isDark ? "bg-white/[0.04] border-white/[0.08]" : "bg-zinc-50 border-zinc-200"}`}>
          <MagnifyingGlass size={18} className={isDark ? "text-zinc-500" : "text-slate-400"} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label="البحث في دليل الدوائر والجهات"
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-500"
            dir="rtl"
            maxLength={200}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="مسح البحث" className={isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-700"}>
              <X size={14} />
            </button>
          )}
        </div>
        <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{OPERATOR_HINT}</p>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className={label}>المنطقة:</span>
            {region !== ALL && (
              <button type="button" onClick={() => setRegion(ALL)} className="text-[10px] text-royal underline">
                إعادة ضبط
              </button>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap max-h-24 overflow-y-auto pr-1">
            {regionChips.map((r) => (
              <button key={r} type="button" onClick={() => setRegion(r)} className={chip(region === r)} aria-pressed={region === r}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {(showCategoryFilter || showVerificationFilter) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-zinc-500/10">
            {showCategoryFilter && (
              <div>
                <span className={`${label} block mb-1.5`}>تصنيف الجهة:</span>
                <div className="flex gap-1.5 flex-wrap">
                  {categoryChips.map((cat) => (
                    <button key={cat} type="button" onClick={() => setCategory(cat)} className={chip(category === cat)} aria-pressed={category === cat}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showVerificationFilter && (
              <div>
                <span className={`${label} block mb-1.5`}>حالة الاعتماد:</span>
                <div className="flex gap-1.5 flex-wrap">
                  <button type="button" onClick={() => setVerification("all")} className={chip(verification === "all")} aria-pressed={verification === "all"}>
                    الكل ({fmt(circuits.length)})
                  </button>
                  <button type="button" onClick={() => setVerification("verified")} className={chip(verification === "verified", "bg-emerald-600 text-white")} aria-pressed={verification === "verified"}>
                    معتمد رسمي ({fmt(circuits.length - flaggedCount)})
                  </button>
                  {flaggedCount > 0 && (
                    <button type="button" onClick={() => setVerification("needsVerification")} className={chip(verification === "needsVerification", "bg-amber-600 text-white")} aria-pressed={verification === "needsVerification"}>
                      يتطلب تحققاً ({fmt(flaggedCount)})
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <HighlightProvider query={query}>
        {/* The provider's wrapper is display:contents, out of reach of the
            outer space-y-4: the spacing lives on this div. */}
        <div className="space-y-4">
        <SearchLegendBar onClear={() => setSearch("")} partial={hasMore} />

        <p role="status" aria-live="polite" className={`text-[12px] px-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
          يعرض <strong className={isDark ? "text-zinc-100" : "text-slate-800"}>{fmt(visible.length)}</strong> من أصل{" "}
          <strong className={isDark ? "text-zinc-100" : "text-slate-800"}>{fmt(filtered.length)}</strong> نتيجة مطابقة
        </p>

        <ul className="space-y-3">
          {visible.map((c) => (
            <CircuitCard key={c.id} circuit={c} isDark={isDark} card={card} />
          ))}
        </ul>

        {filtered.length === 0 && (
          <div className={`${card} p-12 text-center`}>
            <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
              لا توجد جهات أو دوائر مطابقة لبحثك في الدليل القضائي.
            </p>
          </div>
        )}

        {hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-4">
            <button
              type="button"
              onClick={() => setShown((n) => n + pageSize)}
              className={`px-4 py-2 rounded-xl border text-[12px] font-bold transition-colors ${
                isDark ? "border-white/[0.08] text-zinc-300 hover:bg-white/[0.05]" : "border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              تحميل المزيد ({fmt(filtered.length - visible.length)} متبقية)
            </button>
          </div>
        )}
        </div>
      </HighlightProvider>
    </div>
  );
}

export default CircuitsDirectory;
