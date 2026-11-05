"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowCounterClockwise, CheckCircle, Copy, Handshake, Plus, Spinner, Trash, Warning } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import CitationCheckList from "@/components/ai/CitationCheckList";
import { AiThinkingStage } from "@/components/ai/AiThinkingStage";
import DashboardComingSoon from "@/components/ui/DashboardComingSoon";
import {
  asNegotiation,
  contractNegotiatorInput,
  NEGOTIATOR_STANCE_AR,
  negotiationText,
  negotiatorFormProblem,
  type NegotiationAlternative,
  type NegotiatorClauseDraft,
} from "@/components/contracts/contractNegotiatorRun";
import { REVIEW_RISK_AR, type ReviewRisk } from "@/components/contracts/contractReviewRun";
import { useAiRun } from "@/hooks/useAiRun";
import { useToolUsable } from "@/hooks/useToolUsable";
import { aiToolLabelAr } from "@/lib/ai/toolLabels";
import { RUN_HELD_MESSAGE_AR } from "@/lib/ai/runPageView";
import { RUN_STILL_RUNNING_CODE } from "@/lib/ai/aiRunClient";
import { CONTRACT_NEGOTIATOR_PRICE, NEGOTIATOR_CLAUSES_MAX } from "@/lib/ai/tools";

/**
 * مفاوض العقود. The page reads tool-status first (src/hooks/useToolUsable.ts): until
 * the server says this caller may run it, there is no form and no price (owner q296).
 * The nav row keeps its «قريباً» until the tool goes live for everyone.
 */
export default function ContractNegotiatorPage() {
  const { isDark } = useTheme();
  const usable = useToolUsable("contract-negotiator");
  if (usable === null) {
    return <p role="status" dir="rtl" className={`py-16 text-center text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>جارٍ التحقق…</p>;
  }
  if (!usable) {
    return (
      <DashboardComingSoon
        title="مفاوض العقود — قريباً"
        description="يقترح مفاوض العقود ثلاثة مواقف لكل بند تلصقه: حازماً ومتوازناً ومرناً، مع سبب كل موقف وموقف احتياطي. لم يُتح بعد وسيُفعَّل قريباً."
        backHref="/ai"
      />
    );
  }
  return <NegotiatorTool isDark={isDark} />;
}

function riskTone(risk: ReviewRisk, isDark: boolean): string {
  if (risk === "high") return isDark ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-red-200 bg-red-50 text-red-700";
  if (risk === "medium") return isDark ? "border-amber-500/30 bg-amber-500/10 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700";
  return isDark ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function AlternativeCard({ alternative, isDark }: { alternative: NegotiationAlternative; isDark: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(alternative.text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-3 ${isDark ? "border-white/[0.07] bg-white/[0.02]" : "border-zinc-200 bg-zinc-50"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-[12px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>{NEGOTIATOR_STANCE_AR[alternative.stance]}</p>
        <button type="button" onClick={() => void copy()} className={`flex items-center gap-1 text-[11px] font-semibold ${isDark ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-500 hover:text-zinc-800"}`}>
          {copied ? <CheckCircle size={13} weight="fill" className="text-emerald-500" /> : <Copy size={13} />}
          {copied ? "نُسخ" : "نسخ"}
        </button>
      </div>
      <p dir="auto" className={`whitespace-pre-wrap text-[12px] leading-relaxed ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{alternative.text}</p>
      {alternative.rationale && <p dir="auto" className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{alternative.rationale}</p>}
    </div>
  );
}

const EMPTY_CLAUSE: NegotiatorClauseDraft = { text: "", theirDemand: "", ourGoal: "" };

function NegotiatorTool({ isDark }: { isDark: boolean }) {
  const run = useAiRun();
  const [ourParty, setOurParty] = useState("");
  const [contractType, setContractType] = useState("");
  const [clauses, setClauses] = useState<Array<NegotiatorClauseDraft & { key: number }>>([{ ...EMPTY_CLAUSE, key: 0 }]);
  const nextKey = useRef(1);

  const points = CONTRACT_NEGOTIATOR_PRICE.toLocaleString("ar-SA");
  const form = { ourParty, contractType, clauses };
  const problem = negotiatorFormProblem(form);
  const negotiation = run.phase === "done" ? asNegotiation(run.output) : null;
  // A run that ended without a result on this screen was still paid for, and one the
  // page stopped watching may still be going: no second charge from here.
  const settled = run.phase === "review" || run.phase === "done" || run.code === RUN_STILL_RUNNING_CODE;

  const card = isDark ? "bg-zinc-900 border border-white/[0.07] rounded-2xl" : "bg-white border border-zinc-200/70 rounded-2xl";
  const label = `mb-1.5 block text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`;
  const field = `w-full rounded-xl border px-3 py-2 text-[13px] outline-none ${isDark ? "border-white/[0.07] bg-zinc-950 text-zinc-200 placeholder:text-zinc-500" : "border-zinc-200 bg-white text-zinc-800 placeholder:text-zinc-400"}`;
  const muted = isDark ? "text-zinc-400" : "text-zinc-500";

  function updateClause(key: number, change: Partial<NegotiatorClauseDraft>) {
    setClauses((list) => list.map((c) => (c.key === key ? { ...c, ...change } : c)));
  }
  function addClause() {
    setClauses((list) => (list.length >= NEGOTIATOR_CLAUSES_MAX ? list : [...list, { ...EMPTY_CLAUSE, key: nextKey.current++ }]));
  }
  function start() {
    if (run.busy || problem) return;
    void run.start("contract-negotiator", contractNegotiatorInput(form));
  }

  return (
    <div dir="rtl" className="mx-auto max-w-4xl space-y-4 px-4 py-8 sm:px-6">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#C8A762]/10">
          <Handshake size={24} weight="duotone" className="text-[#C8A762]" />
        </span>
        <div>
          <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>مفاوض العقود</h1>
          <p className={`mt-1 text-[13px] leading-relaxed ${muted}`}>ألصق البنود محل التفاوض، ويقترح لكل بند ثلاثة مواقف مع سبب كل منها وموقفاً احتياطياً.</p>
        </div>
      </motion.header>

      {negotiation ? (
        <div className="space-y-4">
          <div className={`${card} space-y-3 p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>خلاصة التفاوض</h2>
              <button type="button" onClick={() => run.reset()} className={`flex items-center gap-1.5 text-[11px] underline ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
                <ArrowCounterClockwise size={12} /> تعديل البنود
              </button>
            </div>
            <p dir="auto" className={`whitespace-pre-wrap text-[13px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{negotiation.summary}</p>
          </div>

          {negotiation.clauses.map((clause, position) => (
            <section key={position} className={`${card} space-y-3 p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>البند {(position + 1).toLocaleString("ar-SA")}</h3>
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${riskTone(clause.risk, isDark)}`}>{REVIEW_RISK_AR[clause.risk]}</span>
              </div>
              {clauses[position]?.text && (
                <blockquote dir="auto" className={`max-h-28 overflow-y-auto border-s-2 ps-3 text-[12px] leading-relaxed ${isDark ? "border-[#C8A762]/40 text-zinc-400" : "border-[#0B3D2E]/30 text-zinc-500"}`}>
                  {clauses[position].text}
                </blockquote>
              )}
              {clause.issue && <p dir="auto" className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{clause.issue}</p>}
              <div className="grid gap-3 md:grid-cols-3">
                {clause.alternatives.map((alternative, n) => <AlternativeCard key={n} alternative={alternative} isDark={isDark} />)}
              </div>
              {clause.fallback && (
                <p dir="auto" className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                  <span className="font-bold">الموقف الاحتياطي: </span>{clause.fallback}
                </p>
              )}
            </section>
          ))}

          <div>
            <CitationCheckList
              items={negotiation.citation_check}
              isDark={isDark}
              title="المواد المذكورة — تحقّقت منها المنصة في مكتبة الأنظمة"
              empty="لم تُذكر مواد نظامية مرقّمة."
            />
            <p className={`mt-2 text-[11px] leading-relaxed ${muted}`}>
              حالة كل مادة من مكتبة نظامي لا من الذكاء الاصطناعي.
              {run.chargedPoints > 0 && <> · خُصمت {run.chargedPoints.toLocaleString("ar-SA")} نقطة</>}
            </p>
          </div>

          <div className={`flex gap-3 rounded-2xl border p-4 ${isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-200 bg-amber-50"}`}>
            <Warning size={16} weight="duotone" className="mt-0.5 shrink-0 text-amber-500" />
            <p className={`text-[12px] leading-relaxed ${isDark ? "text-amber-500/80" : "text-amber-800/80"}`}>مقترحات آلية للمساعدة، وليست رأياً قانونياً. راجع الصياغات قبل عرضها على الطرف الآخر.</p>
          </div>

          <AiResultActions text={negotiationText(negotiation)} filename="nzamy-contract-negotiation" collectorSource="other" className="justify-start" />
        </div>
      ) : (
        <>
          <AiThinkingStage run={run} isDark={isDark} toolLabel={aiToolLabelAr("contract-negotiator")} />
          {run.phase === "review" && (
            <p role="status" className={`rounded-2xl border px-4 py-3 text-[13px] ${isDark ? "border-amber-900/40 bg-amber-900/10 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              {RUN_HELD_MESSAGE_AR}
            </p>
          )}
          {run.phase === "error" && run.error && (
            <p role="alert" className={`rounded-2xl border px-4 py-3 text-[13px] leading-relaxed ${isDark ? "border-red-900/40 bg-red-900/10 text-red-400" : "border-red-200 bg-red-50 text-red-700"}`}>{run.error}</p>
          )}
          {run.phase === "done" && (
            <p role="alert" className={`rounded-2xl border px-4 py-3 text-[13px] leading-relaxed ${isDark ? "border-red-900/40 bg-red-900/10 text-red-400" : "border-red-200 bg-red-50 text-red-700"}`}>اكتمل الطلب لكن تعذّر عرض النتيجة هنا — تواصل مع الدعم.</p>
          )}

          {settled && (
            <button type="button" onClick={() => run.reset()} className={`text-[12px] font-semibold underline ${muted}`}>طلب جديد</button>
          )}
          {!settled && (<>
          {/* Locked during a run: the result is read against these clauses, in this order. */}
          <fieldset disabled={run.busy} className="min-w-0 space-y-4">
          <div className={`${card} grid gap-4 p-5 sm:grid-cols-2`}>
            <div>
              <label htmlFor="negotiator-party" className={label}>الطرف الذي تمثّله</label>
              <input id="negotiator-party" value={ourParty} onChange={(e) => setOurParty(e.target.value)} maxLength={150} placeholder="مثال: المستأجر" className={field} />
            </div>
            <div>
              <label htmlFor="negotiator-type" className={label}>نوع العقد (اختياري)</label>
              <input id="negotiator-type" value={contractType} onChange={(e) => setContractType(e.target.value)} maxLength={150} placeholder="مثال: عقد إيجار" className={field} />
            </div>
          </div>

          {clauses.map((clause, n) => (
            <section key={clause.key} className={`${card} space-y-3 p-5`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>البند {(n + 1).toLocaleString("ar-SA")}</h2>
                {clauses.length > 1 && (
                  <button type="button" onClick={() => setClauses((list) => list.filter((c) => c.key !== clause.key))} className={`flex items-center gap-1 text-[11px] font-semibold ${muted}`}>
                    <Trash size={13} /> حذف البند
                  </button>
                )}
              </div>
              <div>
                <label htmlFor={`negotiator-text-${clause.key}`} className={label}>نص البند</label>
                <textarea id={`negotiator-text-${clause.key}`} value={clause.text} onChange={(e) => updateClause(clause.key, { text: e.target.value })} rows={4} dir="auto" placeholder="ألصق نص البند كما ورد في العقد" className={`${field} resize-y`} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={`negotiator-demand-${clause.key}`} className={label}>طلب الطرف الآخر (اختياري)</label>
                  <textarea id={`negotiator-demand-${clause.key}`} value={clause.theirDemand} onChange={(e) => updateClause(clause.key, { theirDemand: e.target.value })} rows={2} dir="auto" className={`${field} resize-y`} />
                </div>
                <div>
                  <label htmlFor={`negotiator-goal-${clause.key}`} className={label}>هدفك من هذا البند (اختياري)</label>
                  <textarea id={`negotiator-goal-${clause.key}`} value={clause.ourGoal} onChange={(e) => updateClause(clause.key, { ourGoal: e.target.value })} rows={2} dir="auto" className={`${field} resize-y`} />
                </div>
              </div>
            </section>
          ))}

          {clauses.length < NEGOTIATOR_CLAUSES_MAX && (
            <button type="button" onClick={addClause} className={`flex items-center gap-1.5 text-[12px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
              <Plus size={14} weight="bold" /> أضف بنداً (حتى ١٠ بنود)
            </button>
          )}
          </fieldset>

          <div className={`${card} space-y-3 p-5`}>
            <p className={`text-[12px] leading-relaxed ${muted}`}>التكلفة {points} نقطة تُخصم مرة واحدة أياً كان عدد البنود، وتُعاد إن تعذّر التحليل.</p>
            {problem && <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-amber-500"><Warning size={14} className="mt-0.5 shrink-0" />{problem}</p>}
            <button
              type="button"
              onClick={start}
              disabled={run.busy || problem !== null}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-3 text-[14px] font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              {run.busy ? <><Spinner size={16} className="animate-spin" /> جارٍ التحليل...</> : `حلّل وفاوض — ${points} نقطة`}
            </button>
          </div>
          </>)}
        </>
      )}
    </div>
  );
}
