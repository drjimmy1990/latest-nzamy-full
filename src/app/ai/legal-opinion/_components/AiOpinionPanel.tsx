"use client";

// ─── AiOpinionPanel ────────────────────────────────────────────────────────────
// L12 (plan §5 wave 5; owner LIVE-F21 / NOTE-22): the automatic path of the
// consultation and the letter. The server checks the input, charges the
// points once and refunds a failure; n8n writes; the page polls (useAiRun).
// The team order stays below it as a separate, optional request — this panel
// never creates an order and never claims a human has seen its result.

import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkle, CheckCircle, Copy, ArrowCounterClockwise, Warning } from "@phosphor-icons/react";
import type { useAiRun } from "@/hooks/useAiRun";
import { asCitations, CitedText, SourceList, stripCitationMarkers } from "@/components/ai/CitedAnswer";
import CitationCheckList from "@/components/ai/CitationCheckList";
import AiResultActions from "@/components/AiResultActions";
import {
  AI_OPINION_TOOL, aiOpinionErrorText, asConsultAnswer, asLetterDraft, consultAnswerText, type AiOpinionKind,
} from "./aiOpinion";

interface Props {
  kind: AiOpinionKind;
  run: ReturnType<typeof useAiRun>;
  input: Record<string, unknown>;
  /** Why the button cannot run yet (a field missing), or null. */
  blocked: string | null;
  price: number;
  isDark: boolean;
  card: string;
}

const COPY: Record<AiOpinionKind, { title: string; lead: string; button: string; running: string; note: string }> = {
  consult: {
    title: "استشارة آلية من مكتبة الأنظمة",
    lead: "يبحث النظام في مكتبة الأنظمة عن النصوص المتصلة بسؤالك، ثم يكتب الذكاء الاصطناعي الاستشارة منها وحدها، مع رابط كل مصدر. إن لم تجب النصوص عن سؤالك أُعيدت نقاطك.",
    button: "اكتب الاستشارة الآن",
    running: "يكتب الذكاء الاصطناعي الاستشارة الآن — قد يستغرق ذلك دقيقة أو دقيقتين.",
    note: "استشارة آلية من نصوص المكتبة وحدها، لم يراجعها محامٍ؛ راجع النص الرسمي لكل مصدر قبل الاعتماد عليه.",
  },
  letter: {
    title: "خطاب يكتبه الذكاء الاصطناعي",
    lead: "يكتب الذكاء الاصطناعي الخطاب كاملاً من بياناتك، وما لم تذكره يتركه فراغاً [....]. كل مادة يستند إليها تتحقق منها المنصة في مكتبة الأنظمة. إن تعذّر الخطاب أُعيدت نقاطك.",
    button: "اكتب الخطاب الآن",
    running: "يكتب الذكاء الاصطناعي الخطاب الآن — قد يستغرق ذلك دقيقة أو دقيقتين.",
    note: "مسودة آلية من بياناتك، لم يراجعها محامٍ؛ الفراغات [....] بيانات لم تذكرها، وحالة كل مادة من مكتبة نظامي لا من الذكاء الاصطناعي.",
  },
};

export function AiOpinionPanel({ kind, run, input, blocked, price, isDark, card }: Props) {
  const [copied, setCopied] = useState(false);
  const c = COPY[kind];
  const muted = isDark ? "text-zinc-500" : "text-zinc-400";
  const answer = kind === "consult" && run.phase === "done" ? asConsultAnswer(run.output) : null;
  const letter = kind === "letter" && run.phase === "done" ? asLetterDraft(run.output) : null;
  const cites = asCitations(run.citations);
  const resultText = answer ? stripCitationMarkers(consultAnswerText(answer)) : letter ? `${letter.title}\n\n${letter.body}` : "";
  const charged = run.chargedPoints > 0 ? ` · خُصمت ${run.chargedPoints.toLocaleString("ar-SA")} نقطة` : "";

  function copy() {
    navigator.clipboard.writeText(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-5 space-y-4`}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#C8A762]/10 flex items-center justify-center flex-shrink-0">
          <Sparkle size={17} weight="fill" className="text-[#C8A762]" />
        </div>
        <div className="min-w-0">
          <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{c.title}</h2>
          <p className={`text-[12px] leading-relaxed mt-0.5 ${muted}`}>{c.lead}</p>
        </div>
      </div>

      {!answer && !letter && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void run.start(AI_OPINION_TOOL[kind], input)}
            disabled={!!blocked || run.busy}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50] py-3 text-[13px] font-bold text-white disabled:opacity-40 shadow-lg"
          >
            <Sparkle size={14} weight="fill" />
            {run.busy ? "جارٍ التوليد..." : `${c.button} — ${price.toLocaleString("ar-SA")} نقطة`}
          </button>
          {!run.busy && blocked && <p className="text-[11px] text-amber-500">{blocked}</p>}
          {run.phase === "running" && <p role="status" className={`text-[12px] ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>{c.running}</p>}
          {run.phase === "review" && (
            <p role="status" className="text-[12px] text-amber-500">النتيجة جاهزة وتنتظر مراجعة الفريق قبل عرضها.</p>
          )}
          {run.phase === "error" && (
            <p role="alert" className="flex items-start gap-1.5 text-[12px] leading-relaxed text-red-500">
              <Warning size={13} className="mt-0.5 flex-shrink-0" />{aiOpinionErrorText(run.code, run.error)}
            </p>
          )}
          {run.phase === "done" && (
            <p role="alert" className="text-[12px] text-red-500">{aiOpinionErrorText(null, "تعذّر عرض النتيجة")}</p>
          )}
        </div>
      )}

      {answer && (
        <div className="space-y-4">
          <CitedText text={answer.summary} cites={cites} isDark={isDark}
            className={`text-[14px] font-semibold leading-loose ${isDark ? "text-zinc-100" : "text-zinc-900"}`} />
          {answer.sections.map((s, i) => (
            <div key={i}>
              <h3 className={`mb-1 text-[13px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>{s.heading}</h3>
              <CitedText text={s.body} cites={cites} isDark={isDark}
                className={`text-[13px] leading-loose ${isDark ? "text-zinc-300" : "text-zinc-700"}`} />
            </div>
          ))}
          <div>
            <h3 className={`mb-2 text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>المصادر</h3>
            <SourceList cites={cites} isDark={isDark} />
          </div>
        </div>
      )}

      {letter && (
        <div className="space-y-4">
          <div className={`rounded-xl p-5 text-[13px] leading-[2.1] whitespace-pre-wrap ${isDark ? "bg-zinc-800/50 text-zinc-200" : "bg-zinc-50 text-zinc-800"}`} dir="rtl">
            <p className="font-bold text-[14px] mb-2">{letter.title}</p>
            {letter.body}
          </div>
          <CitationCheckList
            items={letter.citation_check}
            isDark={isDark}
            title="المواد التي يستند إليها الخطاب — تحقّقت منها المنصة في مكتبة الأنظمة"
            empty="لا يستند الخطاب إلى مواد نظامية مرقّمة."
          />
        </div>
      )}

      {(answer || letter) && (
        <div className="space-y-3">
          <p className={`text-[11px] leading-relaxed ${muted}`}>{c.note}{charged}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={copy}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] border ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}>
              {copied ? <CheckCircle size={11} className="text-emerald-500" /> : <Copy size={11} />}{copied ? "تم" : "نسخ"}
            </button>
            <button type="button" onClick={run.reset}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] border ${isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}>
              <ArrowCounterClockwise size={11} />توليد جديد ({price.toLocaleString("ar-SA")} نقطة)
            </button>
          </div>
          <AiResultActions
            text={resultText}
            filename={kind === "consult" ? "legal-consultation" : "legal-letter"}
            showCollector
            collectorSource="legal-opinion"
            showHumanReview={false}
            className="justify-start"
          />
        </div>
      )}
    </motion.div>
  );
}

/** The line between the automatic path and the team order: separate, optional, and said so. */
export function TeamOrderDivider({ isDark }: { isDark: boolean }) {
  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex items-center gap-4">
        <div className={`flex-1 h-px ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
        <p className={`text-[11px] font-bold flex-shrink-0 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>أو: مراجعة فريق نظامي — طلب منفصل اختياري</p>
        <div className={`flex-1 h-px ${isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
      </div>
      <p className={`text-[11px] text-center leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
        لا يلزمك هذا الطلب للحصول على النتيجة الآلية أعلاه، ولا يُرسَل إلى الفريق إلا إذا أرسلته أنت.
      </p>
    </div>
  );
}
