"use client";

import { Bell } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import LegislativeMonitorFeed from "@/app/ai/monitor/_components/LegislativeMonitorFeed";

// The corporate view of «راصد التشريعات». It used to carry its own
// MOCK_UPDATES — four invented announcements (a PDPL deadline, a Nitaqat
// ratio, a licence-fee cut, a Board of Grievances circular), each with an
// invented «تأثير عليك» line — plus urgency counters computed from that array.
// It now renders the same live library feed as /ai/monitor (owner test 28-9,
// T28-35a).
export default function CorpMonitorPage() {
  const { isDark } = useTheme();

  return (
    <div className={`p-5 md:p-7 max-w-5xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>راصد التشريعات</h1>
          </div>
          <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            من مكتبة نظامي مباشرة: ما صدر ولم يبدأ نفاذه بعد، وما نفذ حديثاً، وأحدث الأنظمة والأوامر والتعاميم
          </p>
        </div>
        <div className={`flex-shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center ${isDark ? "bg-purple-900/20" : "bg-purple-50"}`}>
          <Bell size={22} weight="duotone" className="text-purple-500" />
        </div>
      </div>

      <LegislativeMonitorFeed />
    </div>
  );
}
