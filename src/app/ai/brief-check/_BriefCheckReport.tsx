"use client";

/**
 * The AI gaps report (plan §5 L8) under the team-order form: the findings by
 * severity, and every article the memo cites with the LIBRARY's verdict on it
 * (citationCheck.ts on the server: in force / amended / repealed / not in the
 * library / not checked). The model reports what the memo cites; it never
 * says whether an article exists.
 */
import { Warning, SealWarning, Lightbulb } from "@phosphor-icons/react";
import CitationCheckList, { asCitationVerdicts, type CitationVerdict } from "@/components/ai/CitationCheckList";

export interface BriefFinding {
  severity: "high" | "medium" | "low";
  location: string;
  issue: string;
  fix: string;
}

export type { CitationVerdict };

export interface BriefCheckReport {
  summary: string;
  findings: BriefFinding[];
  citation_check: CitationVerdict[];
}

export function asBriefCheckReport(output: Record<string, unknown> | null): BriefCheckReport | null {
  if (!output || typeof output.summary !== "string") return null;
  return {
    summary: output.summary,
    findings: Array.isArray(output.findings) ? (output.findings as BriefFinding[]) : [],
    citation_check: asCitationVerdicts(output.citation_check),
  };
}

const SEVERITY = {
  high:   { label: "خطيرة", Icon: Warning,     cls: "border-red-500/25 bg-red-500/10 text-red-500" },
  medium: { label: "متوسطة", Icon: SealWarning, cls: "border-amber-500/25 bg-amber-500/10 text-amber-500" },
  low:    { label: "بسيطة", Icon: Lightbulb,   cls: "border-blue-500/25 bg-blue-500/10 text-blue-500" },
} as const;

export default function BriefCheckReportView({ report, isDark, chargedPoints }: { report: BriefCheckReport; isDark: boolean; chargedPoints: number }) {
  const card = isDark ? "bg-zinc-900 border border-white/[0.06] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const head = `text-[11px] font-black uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-zinc-400"}`;
  const body = isDark ? "text-zinc-300" : "text-zinc-700";
  const order = { high: 0, medium: 1, low: 2 } as const;
  const findings = [...report.findings].sort((a, b) => (order[a.severity] ?? 1) - (order[b.severity] ?? 1));

  return (
    <div className="space-y-4">
      <div className={`${card} p-5 shadow-sm`}>
        <p className={`${head} mb-2`}>الخلاصة</p>
        <p className={`text-[13px] leading-relaxed ${body}`}>{report.summary}</p>
      </div>

      <div className={`${card} p-5 shadow-sm space-y-3`}>
        <p className={head}>الثغرات ({findings.length.toLocaleString("ar-SA")})</p>
        {findings.length === 0 && <p className={`text-[12px] ${body}`}>لم تُرصد ثغرات.</p>}
        {findings.map((f, i) => {
          const s = SEVERITY[f.severity] ?? SEVERITY.medium;
          return (
            <div key={i} className={`rounded-xl border p-3.5 ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-bold ${s.cls}`}>
                  <s.Icon size={11} weight="fill" /> {s.label}
                </span>
                <span className={`text-[11px] font-semibold ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{f.location}</span>
              </div>
              <p className={`text-[13px] leading-relaxed ${body}`}>{f.issue}</p>
              {f.fix && <p className={`mt-1.5 text-[12px] leading-relaxed ${isDark ? "text-emerald-400/90" : "text-emerald-700"}`}>التصحيح: {f.fix}</p>}
            </div>
          );
        })}
      </div>

      <CitationCheckList
        items={report.citation_check}
        isDark={isDark}
        title="المواد المستشهد بها — تحقّقت منها المنصة في مكتبة الأنظمة"
        empty="لا تستشهد المذكرة بمواد نظامية مرقّمة."
      />

      <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
        تقرير آلي مبدئي؛ القرار للمحامي. حالة كل مادة من مكتبة نظامي لا من الذكاء الاصطناعي.
        {chargedPoints > 0 && <> · خُصمت {chargedPoints.toLocaleString("ar-SA")} نقطة</>}
      </p>
    </div>
  );
}
