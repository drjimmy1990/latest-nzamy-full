"use client";

import { Warning } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { isDemoMode } from "@/lib/runtimeMode";
import {
  DEMO_SAMPLES_NOTE,
  unfinishedModulesFor,
  type UnfinishedSector,
} from "@/constants/sectorUnfinishedModules";

/**
 * LIVE-F07 (owner package 2026-10-30): the plain list of unfinished modules
 * at the top of each sector dashboard. It replaces the old "readiness" panels,
 * which carried «جاهزية …» titles, "Backend-ready" / "Beta local" badges and
 * metrics read from the browser's admin-settings copy. Nothing here is read
 * from storage: the list is fixed copy from sectorUnfinishedModules.ts.
 *
 * `compact` folds the list behind a <details> toggle for pages where the
 * panel is secondary (the firm health check).
 */
export function UnfinishedModulesPanel({ sector, compact = false }: { sector: UnfinishedSector; compact?: boolean }) {
  const { isDark } = useTheme();
  const copy = unfinishedModulesFor(sector);

  const box = isDark
    ? "border-amber-500/20 bg-amber-500/5 text-zinc-300"
    : "border-amber-200 bg-amber-50 text-zinc-700";
  const heading = isDark ? "text-amber-300" : "text-amber-800";
  const strong = isDark ? "text-white" : "text-zinc-900";
  const muted = isDark ? "text-zinc-400" : "text-zinc-600";

  const list = (
    <ul className="mt-2 space-y-1.5">
      {copy.modules.map((m) => (
        <li key={m.name} className="text-[12px] leading-relaxed">
          <span className={`font-bold ${strong}`}>{m.name}:</span>{" "}
          <span className={muted}>{m.state}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <section className={`rounded-2xl border p-4 ${box}`} dir="rtl" aria-label={copy.title}>
      <div className="flex items-start gap-2">
        <Warning size={16} weight="fill" className={`mt-0.5 shrink-0 ${heading}`} />
        <div className="min-w-0 flex-1">
          <h2 className={`text-[13px] font-black ${heading}`}>{copy.title}</h2>
          <p className={`mt-1 text-[12px] leading-relaxed ${muted}`}>{copy.intro}</p>
          {compact ? (
            <details className="mt-1">
              <summary className={`cursor-pointer text-[12px] font-bold ${heading}`}>
                اعرض الوحدات ({copy.modules.length.toLocaleString("ar-SA")})
              </summary>
              {list}
            </details>
          ) : list}
          {isDemoMode && (
            <p className={`mt-3 text-[11px] font-semibold ${heading}`}>{DEMO_SAMPLES_NOTE}</p>
          )}
        </div>
      </div>
    </section>
  );
}
