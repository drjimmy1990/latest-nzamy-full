"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClockCounterClockwise, ArrowLeft } from "@phosphor-icons/react";
import { Shimmer } from "@/components/ui/Skeleton";
import { getPreferences } from "@/lib/services/preferencesService";
import { BlockNote, BlockShell } from "./_BlockShell";
import { openedAgoAr, readingHistoryRows, type ReadingHistoryRow } from "./myLibraryView";

/**
 * «سجل القراءة» — the laws this account opened most recently, from the same
 * per-user list the law reader writes (public.user_settings.preferences
 * .recentSessions, newest first, capped at 10; src/app/laws/[slug]/page.tsx).
 * A failed read says so; it is never shown as «no history».
 */
export function ReadingHistoryBlock() {
  // undefined = loading, null = the read failed
  const [rows, setRows] = useState<ReadingHistoryRow[] | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    getPreferences().then((prefs) => {
      if (!alive) return;
      setRows(prefs === null ? null : readingHistoryRows(prefs.recentSessions));
    });
    return () => {
      alive = false;
    };
  }, []);

  const now = Date.now();

  return (
    <BlockShell
      id="history"
      icon={ClockCounterClockwise}
      title="سجل القراءة"
      subtitle="آخر الأنظمة التي فتحتها بحسابك (حتى ١٠)."
    >
      {rows === undefined ? (
        <div className="space-y-2" role="status" aria-label="جارٍ تحميل سجل القراءة">
          <Shimmer className="h-12 w-full" />
          <Shimmer className="h-12 w-full" />
          <Shimmer className="h-12 w-full" />
        </div>
      ) : rows === null ? (
        <BlockNote tone="error">تعذّر تحميل سجل القراءة الآن. حاول بعد قليل.</BlockNote>
      ) : rows.length === 0 ? (
        <div className="space-y-3">
          <BlockNote>لم تفتح أي نظام بعد. ما تفتحه من الأنظمة يظهر هنا لتعود إليه بسرعة.</BlockNote>
          <Link
            href="/laws"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B3D2E] hover:underline dark:text-[#C8A762]"
          >
            تصفّح المكتبة <ArrowLeft size={12} />
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.key}>
              <Link
                href={r.href}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 px-3 py-2.5 transition hover:border-[#0B3D2E]/30 dark:border-white/[0.08] dark:hover:border-[#C8A762]/30"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold text-zinc-800 dark:text-white">{r.title}</span>
                  <span className="mt-0.5 block text-[11px] text-zinc-500 dark:text-zinc-400">
                    {r.kindAr}
                    {r.openedAt ? ` · ${openedAgoAr(r.openedAt, now)}` : ""}
                  </span>
                </span>
                <ArrowLeft
                  size={14}
                  className="shrink-0 text-zinc-400 transition group-hover:text-[#0B3D2E] dark:group-hover:text-[#C8A762]"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </BlockShell>
  );
}
