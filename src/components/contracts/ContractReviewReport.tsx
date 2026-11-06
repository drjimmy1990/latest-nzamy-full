"use client";

import { useState } from "react";
import { ArrowCounterClockwise, CheckCircle, Copy, Warning } from "@phosphor-icons/react";
import AiResultActions from "@/components/AiResultActions";
import CitationCheckList from "@/components/ai/CitationCheckList";
import {
  contractReviewText,
  REVIEW_CATEGORY_AR,
  REVIEW_RISK_AR,
  reviewRiskMatrix,
  type ContractReview,
  type ReviewRisk,
} from "@/components/contracts/contractReviewRun";

/**
 * The AI contract review's report: the risk as words and counts of clauses, never
 * a figure about the outcome (owner ١٩٣), each clause with its two suggested edits
 * and the user's own, the missing clauses, and the library's verdict on each article.
 */

const RISKS: readonly ReviewRisk[] = ["high", "medium", "low"];

function riskTone(risk: ReviewRisk, isDark: boolean): string {
  if (risk === "high") return isDark ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-red-200 bg-red-50 text-red-700";
  if (risk === "medium") return isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700";
  return isDark ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function RiskWord({ risk, isDark }: { risk: ReviewRisk; isDark: boolean }) {
  return <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${riskTone(risk, isDark)}`}>{REVIEW_RISK_AR[risk]}</span>;
}

function CopyButton({ text, isDark }: { text: string; isDark: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button type="button" onClick={() => void copy()} className={`flex items-center gap-1 text-[11px] font-semibold ${isDark ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-500 hover:text-zinc-800"}`}>
      {copied ? <CheckCircle size={13} weight="fill" className="text-emerald-500" /> : <Copy size={13} />}
      {copied ? "نُسخ" : "نسخ"}
    </button>
  );
}

function SuggestedEdit({ title, text, isDark }: { title: string; text: string; isDark: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${isDark ? "border-white/[0.07] bg-white/[0.02]" : "border-zinc-200 bg-zinc-50"}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className={`text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{title}</p>
        <CopyButton text={text} isDark={isDark} />
      </div>
      <p dir="auto" className={`whitespace-pre-wrap text-[12px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{text}</p>
    </div>
  );
}

export function ContractReviewReport({ review, isDark, chargedPoints, onRestart }: {
  review: ContractReview;
  isDark: boolean;
  chargedPoints: number;
  onRestart: () => void;
}) {
  const [manual, setManual] = useState<Record<number, string>>({});
  const card = isDark ? "bg-zinc-900 border border-white/[0.07] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const heading = `text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-900"}`;
  const body = `text-[12.5px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`;
  const muted = isDark ? "text-zinc-400" : "text-zinc-500";
  const matrix = reviewRiskMatrix(review);

  return (
    <div className="space-y-4">
      <div className={`${card} p-5 space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>تقرير مراجعة العقد</h2>
            <RiskWord risk={review.overall_risk} isDark={isDark} />
          </div>
          <button type="button" onClick={onRestart} className={`flex items-center gap-1.5 text-[11px] underline ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
            <ArrowCounterClockwise size={12} /> راجع عقداً آخر
          </button>
        </div>
        <p dir="auto" className={`whitespace-pre-wrap ${body}`}>{review.summary}</p>
      </div>

      <div className={`${card} p-5`}>
        <h3 className={`mb-3 ${heading}`}>مصفوفة المخاطر — عدد البنود في كل مجال</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-[12px]">
            <thead>
              <tr className={muted}>
                <th className="py-1.5 text-start font-semibold">المجال</th>
                {RISKS.map((risk) => <th key={risk} className="py-1.5 text-center font-semibold">{REVIEW_RISK_AR[risk]}</th>)}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.category} className={isDark ? "border-t border-white/[0.06]" : "border-t border-zinc-100"}>
                  <td className={`py-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{REVIEW_CATEGORY_AR[row.category]}</td>
                  {RISKS.map((risk) => (
                    <td key={risk} className="py-2 text-center">
                      {row[risk] > 0
                        ? <span className={`inline-block min-w-7 rounded-lg border px-2 py-0.5 font-bold ${riskTone(risk, isDark)}`}>{row[risk].toLocaleString("ar-SA")}</span>
                        : <span className={muted}>—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        {review.clauses.map((clause, n) => (
          <section key={n} className={`${card} p-5 space-y-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className={heading}>{clause.ref || `بند ${(n + 1).toLocaleString("ar-SA")}`}</h3>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] ${muted}`}>{REVIEW_CATEGORY_AR[clause.category]}</span>
                <RiskWord risk={clause.risk} isDark={isDark} />
              </div>
            </div>
            {clause.quote && (
              <blockquote dir="auto" className={`border-s-2 ps-3 text-[12px] leading-relaxed ${isDark ? "border-[#C8A762]/40 text-zinc-400" : "border-[#0B3D2E]/30 text-zinc-500"}`}>
                {clause.quote}
              </blockquote>
            )}
            <p dir="auto" className={body}>{clause.issue}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {clause.defensive_edit && <SuggestedEdit title="تعديل دفاعي" text={clause.defensive_edit} isDark={isDark} />}
              {clause.negotiating_edit && <SuggestedEdit title="تعديل تفاوضي" text={clause.negotiating_edit} isDark={isDark} />}
            </div>
            <div>
              <label htmlFor={`contract-review-manual-${n}`} className={`mb-1.5 block text-[11px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>تعديلي اليدوي</label>
              <textarea
                id={`contract-review-manual-${n}`}
                value={manual[n] ?? ""}
                onChange={(e) => setManual((m) => ({ ...m, [n]: e.target.value }))}
                rows={2}
                dir="auto"
                placeholder="اكتب صياغتك لهذا البند — تحل محل الاقتراحين في النص المنسوخ"
                className={`w-full resize-y rounded-xl border px-3 py-2 text-[12px] outline-none ${isDark ? "border-white/[0.07] bg-zinc-950 text-zinc-200 placeholder:text-zinc-500" : "border-zinc-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`}
              />
            </div>
          </section>
        ))}
      </div>

      {review.missing.length > 0 && (
        <div className={`${card} p-5 space-y-2`}>
          <h3 className={heading}>بنود ناقصة يحتاجها الطرف الذي تمثّله</h3>
          <ul className="space-y-2">
            {review.missing.map((m, n) => (
              <li key={n} className={body}>
                <span className="font-semibold">{m.title}</span>
                {m.why ? <> — {m.why}</> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <CitationCheckList
          items={review.citation_check}
          isDark={isDark}
          title="المواد المذكورة — تحقّقت منها المنصة في مكتبة الأنظمة"
          empty="لم تُذكر مواد نظامية مرقّمة."
        />
        <p className={`mt-2 text-[11px] leading-relaxed ${muted}`}>
          الاقتباسات ومواضع البنود من قراءة الذكاء الاصطناعي لعقدك، ولم تُطابَق آلياً مع النص، فراجعها عليه. حالة كل مادة من مكتبة نظامي لا من الذكاء الاصطناعي.
          {chargedPoints > 0 && <> · خُصمت {chargedPoints.toLocaleString("ar-SA")} نقطة</>}
        </p>
      </div>

      <div className={`flex gap-3 rounded-2xl border p-4 ${isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-200 bg-amber-50"}`}>
        <Warning size={16} weight="duotone" className="mt-0.5 shrink-0 text-amber-500" />
        <p className={`text-[12px] leading-relaxed ${isDark ? "text-amber-500/80" : "text-amber-800/80"}`}>
          مراجعة آلية للمساعدة، وليست رأياً قانونياً. راجع التعديلات قبل استخدامها، ويُستحسن عرضها على محامٍ مرخّص.
        </p>
      </div>

      <AiResultActions text={contractReviewText(review, manual)} filename="nzamy-contract-review" collectorSource="other" className="justify-start" />
    </div>
  );
}
