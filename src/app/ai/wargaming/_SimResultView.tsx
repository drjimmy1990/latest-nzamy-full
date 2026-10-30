"use client";

/**
 * The L9 simulation's answer under the submit step: a summary, the points by
 * target (severity in words, what the lawyer does about each), the plea script
 * when «تدريب المرافعة» was asked, and every article the answer relies on
 * with the LIBRARY's verdict. No probability (owner ١٩٣).
 */
import { Warning, SealWarning, Lightbulb, ArrowsCounterClockwise } from "@phosphor-icons/react";
import AiResultActions from "@/components/AiResultActions";
import CitationCheckList, { asCitationVerdicts } from "@/components/ai/CitationCheckList";
import { groupPoints, simResultText, SEVERITY_LABEL, SOURCE_LABEL, type SimResult } from "./_simResult";

const SEVERITY = {
  high:   { Icon: Warning,     cls: "border-red-500/25 bg-red-500/10 text-red-500" },
  medium: { Icon: SealWarning, cls: "border-amber-500/25 bg-amber-500/10 text-amber-500" },
  low:    { Icon: Lightbulb,   cls: "border-blue-500/25 bg-blue-500/10 text-blue-500" },
} as const;

export default function SimResultView({ result, isDark, chargedPoints, onReset }: {
  result: SimResult; isDark: boolean; chargedPoints: number; onReset: () => void;
}) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const head = `text-[11px] font-black uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-zinc-400"}`;
  const body = isDark ? "text-zinc-300" : "text-zinc-700";

  return (
    <div className="space-y-4">
      <div className={`${card} p-5`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className={head}>خلاصة المحاكاة</p>
          <button type="button" onClick={onReset} className={`flex items-center gap-1 text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            <ArrowsCounterClockwise size={12} /> محاكاة جديدة
          </button>
        </div>
        <p className={`text-[13px] leading-relaxed ${body}`}>{result.summary}</p>
      </div>

      <AiResultActions text={simResultText(result)} filename="nzamy-wargaming" collectorSource="other" />

      {groupPoints(result.points).map(g => (
        <div key={g.source} className={`${card} p-5 space-y-3`}>
          <p className={head}>{SOURCE_LABEL[g.source]} ({g.points.length.toLocaleString("ar-SA")})</p>
          {g.points.map((p, i) => {
            const s = SEVERITY[p.severity] ?? SEVERITY.medium;
            return (
              <div key={i} className={`rounded-xl border p-3.5 ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-bold ${s.cls}`}>
                    <s.Icon size={11} weight="fill" /> {SEVERITY_LABEL[p.severity] ?? SEVERITY_LABEL.medium}
                  </span>
                  <p className={`text-[13px] font-semibold ${body}`}>{p.title}</p>
                </div>
                <p className={`text-[13px] leading-relaxed ${body}`}>{p.detail}</p>
                {p.counter && <p className={`mt-1.5 text-[12px] leading-relaxed ${isDark ? "text-emerald-400/90" : "text-emerald-700"}`}>ما تفعله: {p.counter}</p>}
              </div>
            );
          })}
        </div>
      ))}

      {result.plea_script && (
        <div className={`${card} p-5`}>
          <p className={`${head} mb-2`}>سكريبت المرافعة</p>
          <p className={`whitespace-pre-line text-[13px] leading-loose ${body}`}>{result.plea_script}</p>
        </div>
      )}

      <CitationCheckList
        items={asCitationVerdicts(result.citation_check)}
        isDark={isDark}
        title="المواد التي استندت إليها المحاكاة — تحقّقت منها المنصة في مكتبة الأنظمة"
        empty="لم تستند المحاكاة إلى مواد نظامية مرقّمة."
      />

      <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
        محاكاة آلية مبدئية لا تتوقع الحكم؛ المحكمة تحكم بقناعتها والقرار للمحامي. حالة كل مادة من مكتبة نظامي لا من الذكاء الاصطناعي.
        {chargedPoints > 0 && <> · خُصمت {chargedPoints.toLocaleString("ar-SA")} نقطة</>}
      </p>
    </div>
  );
}
