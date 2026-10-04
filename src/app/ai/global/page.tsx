"use client";

/**
 * «القضاء والتشريع المقارن» — /ai/global.
 *
 * The owner renamed this page (Q154, 2026-10-03; it was «نظامي عالمي») and
 * gave it two tabs — «السوابق القضائية الدولية» and «التشريعات المقارنة» —
 * under the badge «قيد الإعداد والربط الدولي».
 *
 * Neither tab has anything real behind it yet, so both render
 * DashboardComingSoon. What this page used to be: a "research engine" that
 * waited 3.2 seconds on a timer and then assembled an answer, numbered
 * "official" sources and a confidence score from a local template
 * (globalResearchHelper.ts, deleted with this change). Its own header said
 * «لا بحث إنترنت فعلي بعد». Presenting that as research on a foreign law is
 * the kind of fabricated legal output this platform removes rather than
 * relabels, so it is gone, not hidden behind a flag.
 *
 * Nav/hub entries that point here carry «قريباً» (navComingSoon.test.ts).
 */

import { useState } from "react";
import { Globe, Gavel, Scales } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

type TabId = "precedents" | "legislation";

const TABS: { id: TabId; label: string; icon: React.ElementType; soon: string }[] = [
  {
    id: "precedents",
    label: "السوابق القضائية الدولية",
    icon: Gavel,
    soon: "البحث في السوابق القضائية الدولية قيد الإعداد والربط بمصادرها الرسمية، ولا توجد نتائج حقيقية لعرضها بعد.",
  },
  {
    id: "legislation",
    label: "التشريعات المقارنة",
    icon: Scales,
    soon: "مقارنة التشريعات بين الأنظمة السعودية وأنظمة الدول الأخرى قيد الإعداد والربط بمصادرها الرسمية، ولا توجد نتائج حقيقية لعرضها بعد.",
  },
];

export default function ComparativeLawPage() {
  const { isDark } = useTheme();
  const [active, setActive] = useState<TabId>("precedents");
  const tab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <div className={`max-w-3xl mx-auto p-5 md:p-8 space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">
      <div>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <div className="w-8 h-8 rounded-xl bg-[#0B3D2E]/10 dark:bg-[#C8A762]/10 flex items-center justify-center">
            <Globe size={18} weight="duotone" className="text-[#0B3D2E] dark:text-[#C8A762]" />
          </div>
          <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>القضاء والتشريع المقارن</h1>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#C8A762]/15 text-[#C8A762] border border-[#C8A762]/30">
            قيد الإعداد والربط الدولي
          </span>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="أقسام القضاء والتشريع المقارن"
        className={`p-1.5 rounded-2xl flex gap-1 ${isDark ? "bg-zinc-800/80" : "bg-slate-100"}`}
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              id={`comparative-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`comparative-panel-${t.id}`}
              onClick={() => setActive(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-[12px] font-bold transition-all ${
                selected
                  ? isDark ? "bg-zinc-700 text-zinc-100 shadow-sm" : "bg-white text-slate-800 shadow-sm"
                  : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon size={15} className={selected ? "text-[#C8A762]" : undefined} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`comparative-panel-${tab.id}`} aria-labelledby={`comparative-tab-${tab.id}`}>
        <DashboardComingSoon key={tab.id} title={tab.label} description={tab.soon} />
      </div>
    </div>
  );
}
