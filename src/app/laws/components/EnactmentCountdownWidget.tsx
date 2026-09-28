"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CaretLeft, CaretRight, ClockCountdown, WarningCircle } from "@phosphor-icons/react";
import { dayCountUnit, sinceEffectiveLabel } from "./enactmentLabels";

interface EnactmentLawItem {
  slug: string;
  title: string;
  titleEn?: string | null;
  daysRemaining: number;
  effectiveDateGregorian: string;
  effectiveDateHijri?: string | null;
  gazetteIssueNumber?: string | null;
  issuingInstrument?: string | null;
  /** `recent` items only: days since the law took effect, 0..14 (0 = today). */
  daysSinceEffective?: number | null;
}

type EnactmentTab = "upcoming" | "recent";

/** A list from the API, or [] — an absent `recent` (older API) hides that tab. */
function itemList(v: unknown): EnactmentLawItem[] {
  return Array.isArray(v)
    ? v.filter((x): x is EnactmentLawItem => !!x && typeof x === "object" && typeof (x as EnactmentLawItem).slug === "string")
    : [];
}

export default function EnactmentCountdownWidget({
  isDark,
  isRTL,
}: {
  isDark: boolean;
  isRTL: boolean;
}) {
  const [upcoming, setUpcoming] = useState<EnactmentLawItem[]>([]);
  const [recent, setRecent] = useState<EnactmentLawItem[]>([]);
  const [tab, setTab] = useState<EnactmentTab>("upcoming");
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/library/enactments", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        const body = await response.json();
        if (!Array.isArray(body?.data)) throw new Error("invalid response");
        if (!cancelled) {
          const up = itemList(body.data);
          const rec = itemList(body.recent);
          setUpcoming(up);
          setRecent(rec);
          // Open on the first list that has anything in it.
          setTab(up.length > 0 ? "upcoming" : "recent");
          setIndex(0);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      });
    return () => { cancelled = true; };
  }, []);

  if (state === "loading") {
    return <div className={`h-24 animate-pulse rounded-2xl ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`} />;
  }

  if (state === "unavailable") {
    return (
      <div className={`rounded-2xl border px-4 py-3 text-xs ${isDark ? "border-white/[0.07] bg-zinc-900 text-zinc-400" : "border-slate-200 bg-white text-slate-500"}`}>
        لا تتوفر الآن بيانات موثقة عن مواعيد نفاذ قادمة.
      </div>
    );
  }

  // T28-27: two lists — laws still in their enactment period, and laws that
  // took effect in the last 14 days. A list with nothing in it has no tab;
  // with both empty the widget is not shown at all.
  if (upcoming.length === 0 && recent.length === 0) return null;
  const tabs = ([
    { id: "upcoming", label: "قيد النفاذ ⏳", count: upcoming.length },
    { id: "recent", label: "نافذ حديثاً 🟢", count: recent.length },
  ] as const).filter((t) => t.count > 0);
  const activeTab: EnactmentTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  const isRecent = activeTab === "recent";
  const items = isRecent ? recent : upcoming;
  const item = items[index] ?? items[0];
  const urgent = !isRecent && item.daysRemaining <= 30;
  const daysSince = Math.max(0, Math.floor(Number(item.daysSinceEffective) || 0));
  const switchTab = (next: EnactmentTab) => {
    setTab(next);
    setIndex(0);
  };

  return (
    <section className={`rounded-2xl border p-4 ${isDark ? "border-white/[0.07] bg-zinc-900" : "border-slate-200 bg-white shadow-sm"}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClockCountdown size={18} className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
          <div>
            <h2 className={`text-sm font-black ${isDark ? "text-white" : "text-slate-900"}`}>
              {isRTL ? "مواعيد نفاذ الأنظمة" : "Law enactments"}
            </h2>
            <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              {isRTL ? "من بيانات المكتبة القانونية الموثقة" : "From verified legal-library data"}
            </p>
          </div>
        </div>
        {items.length > 1 && (
          <div className="flex items-center gap-1">
            <button type="button" aria-label="السابق" onClick={() => setIndex((index - 1 + items.length) % items.length)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
              <CaretRight size={14} />
            </button>
            <button type="button" aria-label="التالي" onClick={() => setIndex((index + 1) % items.length)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06]">
              <CaretLeft size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Tab row — only the lists that have something in them. */}
      <div role="tablist" aria-label="مواعيد النفاذ" className="mb-3 flex flex-wrap gap-1.5">
        {tabs.map((t) => {
          const selected = t.id === activeTab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => switchTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                selected
                  ? isDark ? "border-[#C8A762]/40 bg-[#C8A762]/10 text-[#C8A762]" : "border-[#0B3D2E]/30 bg-[#0B3D2E]/5 text-[#0B3D2E]"
                  : isDark ? "border-white/[0.07] text-zinc-400 hover:text-zinc-300" : "border-slate-200 text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
              <span className={`rounded-full px-1.5 text-[10px] ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>{t.count}</span>
            </button>
          );
        })}
      </div>

      <Link href={`/laws/${item.slug}`} className={`flex items-center gap-4 rounded-xl border p-3 transition-colors ${isDark ? "border-white/[0.06] bg-white/[0.025] hover:border-[#C8A762]/40" : "border-slate-100 bg-slate-50 hover:border-[#C8A762]/50"}`}>
        {isRecent ? (
          <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
            {daysSince === 0 ? (
              <span className="text-sm font-black leading-none">اليوم</span>
            ) : (
              <>
                <span className="text-xl font-black leading-none">{daysSince}</span>
                <span className="mt-1 text-[9px] font-bold">{dayCountUnit(daysSince)}</span>
              </>
            )}
          </div>
        ) : (
          <div className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2 ${urgent ? "border-amber-500 bg-amber-500/10 text-amber-600" : "border-[#C8A762] bg-[#0B3D2E]/5 text-[#0B3D2E] dark:text-[#C8A762]"}`}>
            <span className="text-xl font-black leading-none">{item.daysRemaining}</span>
            <span className="mt-1 text-[9px] font-bold">{isRTL ? dayCountUnit(item.daysRemaining) : "days"}</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5">
            {isRecent ? (
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${isDark ? "bg-emerald-500/15 text-emerald-400" : "bg-emerald-50 text-emerald-700"}`}>
                {sinceEffectiveLabel(daysSince)}
              </span>
            ) : (
              <>
                {urgent && <WarningCircle size={13} className="text-amber-500" weight="fill" />}
                <span className={`text-[10px] font-bold ${urgent ? "text-amber-500" : isDark ? "text-zinc-400" : "text-slate-500"}`}>
                  {urgent ? (isRTL ? "سريان وشيك" : "Enforcing soon") : (isRTL ? "قيد مهلة النفاذ" : "Under enactment period")}
                </span>
              </>
            )}
          </div>
          <h3 className={`line-clamp-2 text-sm font-bold leading-6 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
            {isRTL ? item.title : item.titleEn || item.title}
          </h3>
          <p className={`mt-1 text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {item.effectiveDateHijri || item.effectiveDateGregorian}
            {/* Only when the source names an issue (null for non-subscribers too). */}
            {item.gazetteIssueNumber ? ` · أم القرى، العدد ${item.gazetteIssueNumber}` : ""}
          </p>
        </div>
      </Link>
    </section>
  );
}
