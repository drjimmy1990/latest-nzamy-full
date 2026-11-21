/**
 * Owner ٣٨ / ١٢٤a: the fixed line «مؤشر مساعد لا يتنبأ بنتيجة القضية» under an
 * analysis tool's result, and — only when the tool's output ever carries a
 * 0–100 value — the chip «بنسبة تقديرية X٪» before it (src/lib/ai/assistIndicator.ts).
 */
import { ASSIST_INDICATOR_NOTE, assistIndicatorPercent } from "@/lib/ai/assistIndicator";

export default function AssistIndicatorNote({ isDark, percent, className = "" }: {
  isDark: boolean;
  /** A 0–100 value from the tool's output, if it ever returns one. Never invented. */
  percent?: number | null;
  className?: string;
}) {
  const chip = assistIndicatorPercent(percent);
  return (
    <p className={`flex flex-wrap items-center gap-1.5 text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"} ${className}`}>
      {chip && (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isDark ? "bg-white/[0.06] text-zinc-300" : "bg-zinc-100 text-zinc-700"}`}>
          {chip}
        </span>
      )}
      <span>{ASSIST_INDICATOR_NOTE}</span>
    </p>
  );
}
