/**
 * Owner ٣٨: the «مؤشر مساعد» chip and its one line, beside an indicator on an
 * analysis tool's result (src/lib/ai/assistIndicator.ts).
 */
import { ASSIST_INDICATOR_LABEL, ASSIST_INDICATOR_NOTE, assistIndicatorPercent } from "@/lib/ai/assistIndicator";

export default function AssistIndicatorNote({ isDark, percent, className = "" }: {
  isDark: boolean;
  /** A 0–100 value from the tool's output, if it ever returns one. */
  percent?: number | null;
  className?: string;
}) {
  const label = assistIndicatorPercent(percent) ?? ASSIST_INDICATOR_LABEL;
  return (
    <p className={`flex flex-wrap items-center gap-1.5 text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"} ${className}`}>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isDark ? "bg-white/[0.06] text-zinc-300" : "bg-zinc-100 text-zinc-700"}`}>
        {label}
      </span>
      <span>{ASSIST_INDICATOR_NOTE}</span>
    </p>
  );
}
