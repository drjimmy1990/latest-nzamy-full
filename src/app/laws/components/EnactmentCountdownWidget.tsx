"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CaretLeft, CaretRight, ClockCountdown, WarningCircle } from "@phosphor-icons/react";

interface EnactmentLawItem {
  slug: string;
  title: string;
  titleEn?: string | null;
  daysRemaining: number;
  effectiveDateGregorian: string;
  effectiveDateHijri?: string | null;
  gazetteIssueNumber?: string | null;
  issuingInstrument?: string | null;
}

export default function EnactmentCountdownWidget({
  isDark,
  isRTL,
}: {
  isDark: boolean;
  isRTL: boolean;
}) {
  const [items, setItems] = useState<EnactmentLawItem[]>([]);
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
          setItems(body.data);
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

  if (items.length === 0) return null;
  const item = items[index] ?? items[0];
  const urgent = item.daysRemaining <= 30;

  return (
    <section className={`rounded-2xl border p-4 ${isDark ? "border-white/[0.07] bg-zinc-900" : "border-slate-200 bg-white shadow-sm"}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClockCountdown size={18} className={isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"} />
          <div>
            <h2 className={`text-sm font-black ${isDark ? "text-white" : "text-slate-900"}`}>
              {isRTL ? "نفاذ الأنظمة القادمة" : "Upcoming law enactments"}
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

      <Link href={`/laws/${item.slug}`} className={`flex items-center gap-4 rounded-xl border p-3 transition-colors ${isDark ? "border-white/[0.06] bg-white/[0.025] hover:border-[#C8A762]/40" : "border-slate-100 bg-slate-50 hover:border-[#C8A762]/50"}`}>
        <div className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2 ${urgent ? "border-amber-500 bg-amber-500/10 text-amber-600" : "border-[#C8A762] bg-[#0B3D2E]/5 text-[#0B3D2E] dark:text-[#C8A762]"}`}>
          <span className="text-xl font-black leading-none">{item.daysRemaining}</span>
          <span className="mt-1 text-[9px] font-bold">{isRTL ? "يوماً" : "days"}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5">
            {urgent && <WarningCircle size={13} className="text-amber-500" weight="fill" />}
            <span className={`text-[10px] font-bold ${urgent ? "text-amber-500" : isDark ? "text-zinc-400" : "text-slate-500"}`}>
              {urgent ? (isRTL ? "سريان وشيك" : "Enforcing soon") : (isRTL ? "قيد مهلة النفاذ" : "Under enactment period")}
            </span>
          </div>
          <h3 className={`line-clamp-2 text-sm font-bold leading-6 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
            {isRTL ? item.title : item.titleEn || item.title}
          </h3>
          <p className={`mt-1 text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {item.effectiveDateHijri || item.effectiveDateGregorian}
            {item.gazetteIssueNumber ? ` · أم القرى ${item.gazetteIssueNumber}` : ""}
          </p>
        </div>
      </Link>
    </section>
  );
}
