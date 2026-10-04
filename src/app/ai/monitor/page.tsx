"use client";

import { AppWindow } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import LegislativeMonitorFeed from "./_components/LegislativeMonitorFeed";

// ─── راصد التشريعات ───────────────────────────────────────────────────────────
//
// Owner test 28-9 (T28-35a): «اربط الراصد بالمكتبة الحية». This page used to
// render a hard-coded MOCK_UPDATES array — six invented amendments with
// invented decree and circular numbers — plus a favourites hub quoting an
// invented lawyer, and read / archive / trash / WhatsApp / sector controls
// that lived in component state and saved nothing. All of it is gone. The
// feed below reads GET /api/library/monitor (library.laws +
// library.decrees_circulars) and every card opens the law or order it names.
// The same component renders on /ai/corp/monitor.

export default function AIMonitorPage() {
  const { isDark } = useTheme();

  return (
    <div className={`p-5 md:p-7 max-w-4xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className={`text-xl font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
            <AppWindow className="text-[#C8A762]" weight="duotone" />
            راصد التشريعات
          </h1>
          <span className="rounded-full bg-[#C8A762]/15 border border-[#C8A762]/30 px-2.5 py-0.5 text-[10px] font-bold text-[#C8A762]">PRO</span>
        </div>
        <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          من مكتبة نظامي مباشرة: ما صدر ولم يبدأ نفاذه بعد، وما نفذ حديثاً، وأحدث الأنظمة والأوامر والتعاميم
        </p>
      </div>

      <LegislativeMonitorFeed />
    </div>
  );
}
