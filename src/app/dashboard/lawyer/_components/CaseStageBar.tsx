"use client";

import { useMemo } from "react";
import { Scales } from "@phosphor-icons/react";
import { toArabicDigits } from "@/lib/services/arabicCount";
import {
  countStageBuckets,
  stageBucketShares,
  type StageBucket,
} from "@/lib/caseStageBuckets";

interface Props {
  /** the cases the list is currently drawn from (the page passes its non-archived base) */
  cases: readonly { id: string; status: string }[];
  /** caseId → degree of its latest stage row; a case absent here has none */
  latestDegreeByCase: Readonly<Record<string, string>>;
  activeBucket: StageBucket | "all";
  onToggle: (bucket: StageBucket) => void;
  isDark: boolean;
}

/** One colour per bucket; «لم تُسجَّل» is the palest so it never reads as a stage. */
const BUCKET_COLOR: Record<StageBucket, { light: string; dark: string }> = {
  none:           { light: "bg-slate-300",   dark: "bg-zinc-600" },
  first_instance: { light: "bg-blue-500",    dark: "bg-blue-400" },
  appeal:         { light: "bg-amber-500",   dark: "bg-amber-400" },
  cassation:      { light: "bg-violet-500",  dark: "bg-violet-400" },
  execution:      { light: "bg-emerald-500", dark: "bg-emerald-400" },
  finished:       { light: "bg-slate-600",   dark: "bg-zinc-400" },
};

/**
 * «المرحلة المسجّلة» — how the lawyer's cases split across the court degree
 * last RECORDED for each (T28-29a). Not the drawer's «درجة التقاضي», which is
 * a guess from the court name; this reads `case_stages`. The arithmetic lives
 * in src/lib/caseStageBuckets.ts.
 *
 * Renders nothing for an empty list — the page also withholds it while the
 * stage read is loading or has failed, so no figure here is ever a
 * placeholder.
 */
export default function CaseStageBar({ cases, latestDegreeByCase, activeBucket, onToggle, isDark }: Props) {
  const shares = useMemo(
    () => stageBucketShares(countStageBuckets(cases, latestDegreeByCase)),
    [cases, latestDegreeByCase],
  );
  if (shares.length === 0) return null;

  const colorOf = (bucket: StageBucket) => (isDark ? BUCKET_COLOR[bucket].dark : BUCKET_COLOR[bucket].light);

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${isDark ? "border-white/[0.06] bg-zinc-900/60" : "border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]"}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Scales size={14} weight="duotone" className={isDark ? "text-zinc-400" : "text-slate-500"} />
        <p className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>المرحلة المسجّلة</p>
        <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          حسب آخر درجة تقاضٍ مسجّلة في ملف كل قضية — اضغط على مرحلة لتصفية القائمة
        </p>
      </div>

      {/* The bar. Segment widths are the exact shares; the chips below carry
          the whole-number percents and are the accessible controls. */}
      <div className={`flex h-2.5 w-full overflow-hidden rounded-full ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`} aria-hidden="true">
        {shares.map((share) => (
          <button
            key={share.bucket}
            type="button"
            tabIndex={-1}
            onClick={() => onToggle(share.bucket)}
            title={`${share.label}: ${toArabicDigits(share.count)} (${toArabicDigits(share.percent)}٪)`}
            className={`h-full cursor-pointer transition-opacity ${colorOf(share.bucket)} ${
              activeBucket !== "all" && activeBucket !== share.bucket ? "opacity-35" : ""
            }`}
            style={{ width: `${share.width}%` }}
          />
        ))}
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {shares.map((share) => {
          const active = activeBucket === share.bucket;
          return (
            <button
              key={share.bucket}
              type="button"
              onClick={() => onToggle(share.bucket)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                active
                  ? isDark
                    ? "border-white/20 bg-white/[0.08] text-white ring-2 ring-[#C8A762] ring-offset-2 ring-offset-zinc-900"
                    : "border-royal/30 bg-royal/[0.06] text-royal ring-2 ring-royal ring-offset-2 ring-offset-white"
                  : isDark
                    ? "border-white/[0.06] text-zinc-400 hover:text-zinc-200"
                    : "border-slate-200 text-slate-600 hover:border-royal/20 hover:text-royal"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${colorOf(share.bucket)}`} />
              {share.label}
              <span className={`text-[10px] rounded-full px-1.5 ${active ? (isDark ? "bg-white/15" : "bg-royal/10") : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                {toArabicDigits(share.count)} · {toArabicDigits(share.percent)}٪
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
