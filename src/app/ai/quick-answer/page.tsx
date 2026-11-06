"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChatCircleDots, CaretLeft, Sparkle, ArrowCounterClockwise,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import { asCitations, CitedText, SourceList, stripCitationMarkers } from "@/components/ai/CitedAnswer";
import { useAiRun } from "@/hooks/useAiRun";
import { AiThinkingStage } from "@/components/ai/AiThinkingStage";
import { aiToolLabelAr } from "@/lib/ai/toolLabels";
import { RUN_HELD_MESSAGE_AR } from "@/lib/ai/runPageView";
import { QUICK_ANSWER_QUESTION_MAX } from "@/lib/ai/tools";
import { aiToolPriceText } from "@/lib/ai/toolPointsDisplay";
import { useUser } from "@/hooks/useUser";
import { useToolUsable } from "@/hooks/useToolUsable";
import DashboardComingSoon from "@/components/ui/DashboardComingSoon";
import { isConsultantBlockedPath } from "@/lib/auth/practiceKind";
import { QUICK_ANSWER_EXAMPLES, QUICK_ANSWER_FOLLOW_UPS, quickAnswerRefusalText } from "./_quickAnswer";

/**
 * سؤال قانوني سريع (plan §5 L3): one question → a short answer written only
 * from library texts. The server searches the library, sends the texts to the
 * model, keeps only the citations that name a text it sent, and refunds an
 * answer that cites none (or a question nothing in the library matches). The
 * page shows the answer and links each [S…] marker to its text; it never
 * shows an answer of its own.
 *
 * S3-06: examples, collapsible sources, the shared result actions, a reset and
 * the next tools. The price (20) and the roles are unchanged (R25, question ٤١٢).
 *
 * The page reads tool-status first (src/hooks/useToolUsable.ts): the tool's mode is
 * "off" by default, and a run would answer 423, so no price and no form until the
 * server says this caller may run it.
 */

export default function QuickAnswerPage() {
  const { isDark } = useTheme();
  const usable = useToolUsable("quick-answer");
  if (usable === null) {
    return <p role="status" dir="rtl" className={`py-16 text-center text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>جارٍ التحقق…</p>;
  }
  if (!usable) {
    return (
      <DashboardComingSoon
        title="سؤال قانوني سريع — قريباً"
        description="سؤال محدد وإجابة مختصرة من نصوص الأنظمة ومبادئ القضاء في مكتبة نظامي، مع رابط كل نص. لم يُتح بعد لحسابك."
        backHref="/ai"
      />
    );
  }
  return <QuickAnswerTool />;
}

function QuickAnswerTool() {
  const { isDark } = useTheme();
  const [question, setQuestion] = useState("");
  const user = useUser();
  const run = useAiRun();
  const asking = run.busy;
  const answer = run.phase === "done" && typeof run.output?.answer === "string" ? run.output.answer : null;
  const cites = asCitations(run.citations);
  // Art. 18: /ai/wargaming refuses a consultant, so it is not offered to him.
  const followUps = QUICK_ANSWER_FOLLOW_UPS.filter((f) => !(user.practiceKind === "consultant" && isConsultantBlockedPath(f.href)));

  function ask() {
    const q = question.trim();
    if (q.length < 8 || asking) return;
    void run.start("quick-answer", { question: q });
  }

  function askAnother() {
    run.reset();
    setQuestion("");
  }

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl shadow-sm";
  const muted = isDark ? "text-zinc-500" : "text-zinc-400";

  return (
    <div className={`max-w-3xl mx-auto p-5 md:p-8 space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">
      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/ai" className={`transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
          ذكاء نظامي
        </Link>
        <CaretLeft size={12} className={isDark ? "text-zinc-600" : "text-zinc-300"} />
        <span className={isDark ? "text-zinc-300" : "text-zinc-600"}>سؤال قانوني سريع</span>
      </div>

      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <ChatCircleDots size={18} weight="duotone" className="text-blue-500" />
          </div>
          <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>سؤال قانوني سريع</h1>
        </div>
        <p className={`text-[13px] ${muted}`}>
          سؤال محدد ← إجابة مختصرة من نصوص الأنظمة ومبادئ القضاء في مكتبة نظامي، مع رابط كل نص استندت إليه.
        </p>
      </div>

      {/* ── Question ── */}
      <div className={`${card} p-5 space-y-3`}>
        <label htmlFor="qa-question" className={`block text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
          سؤالك
        </label>
        <textarea
          id="qa-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, QUICK_ANSWER_QUESTION_MAX))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) ask();
          }}
          rows={4}
          placeholder="مثال: متى يحق للمؤجر فسخ عقد الإيجار وإخلاء المستأجر؟"
          className={`w-full resize-y rounded-xl border px-4 py-3 text-[14px] leading-relaxed outline-none transition-colors ${
            isDark
              ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600 focus:border-[#C8A762]/40"
              : "border-zinc-200 bg-zinc-50 text-zinc-900 placeholder:text-zinc-400 focus:border-[#0B3D2E]/40"
          }`}
        />
        <div className="flex flex-wrap gap-2">
          {QUICK_ANSWER_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setQuestion(example)}
              disabled={asking}
              className={`rounded-full border px-3 py-1.5 text-[11px] leading-relaxed transition-colors disabled:opacity-40 ${
                isDark ? "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04]" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {example}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={`text-[11px] ${muted}`}>
            {question.length.toLocaleString("ar-SA")} / {QUICK_ANSWER_QUESTION_MAX.toLocaleString("ar-SA")} · {aiToolPriceText("quick-answer", "ar")} للسؤال
          </span>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={ask}
            disabled={question.trim().length < 8 || asking}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-[13px] font-bold text-white shadow-md disabled:opacity-40"
          >
            <Sparkle size={14} weight="fill" className="text-[#C8A762]" />
            {asking ? "جارٍ البحث..." : "اسأل"}
          </motion.button>
        </div>
        {run.phase === "error" && run.error && (
          <p role="alert" className={`text-[12px] leading-relaxed ${isDark ? "text-red-400" : "text-red-600"}`}>
            {quickAnswerRefusalText(run.code) ?? run.error}
          </p>
        )}
        <p className={`text-[11px] leading-relaxed ${muted}`}>
          يُرسَل سؤالك ونصوص المكتبة المتعلقة به إلى مزوّد ذكاء اصطناعي خارج المملكة لمعالجته؛ لا تُدخل بيانات شخصية لا يلزمها السؤال.
        </p>
      </div>

      {run.phase === "review" && (
        <p role="status" className={`rounded-2xl border px-4 py-3 text-[12px] ${isDark ? "border-amber-900/40 bg-amber-900/10 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
          {RUN_HELD_MESSAGE_AR}
        </p>
      )}

      {/* ── Working ── */}
      <AiThinkingStage run={run} isDark={isDark} toolLabel={aiToolLabelAr("quick-answer")} />

      {/* ── Answer ── */}
      {answer && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${card} overflow-hidden`}>
          <div className={`flex items-center justify-between px-5 py-3.5 border-b ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
            <span className={`text-[13px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الإجابة</span>
            <button
              type="button"
              onClick={askAnother}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] border ${
                isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-500"
              }`}
            >
              <ArrowCounterClockwise size={11} />
              اسأل سؤالاً آخر
            </button>
          </div>
          <div className="p-5 space-y-5">
            <CitedText
              text={answer}
              cites={cites}
              isDark={isDark}
              className={`text-[14px] leading-loose ${isDark ? "text-zinc-200" : "text-zinc-800"}`}
            />

            <div>
              <h2 className={`mb-2 text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>المصادر</h2>
              <div className="space-y-1.5">
                {cites.map((c, i) => (
                  <details key={c.sid} open={i === 0} className={`rounded-xl border ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
                    <summary className={`cursor-pointer select-none px-3 py-2 text-[12px] font-semibold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                      المصدر {i + 1} — {c.kind === "principle" ? "مبدأ قضائي" : "نص نظامي"}
                    </summary>
                    <div className="px-2 pb-2">
                      <SourceList cites={[c]} isDark={isDark} startAt={i + 1} />
                    </div>
                  </details>
                ))}
              </div>
            </div>

            <AiResultActions
              text={stripCitationMarkers(answer)}
              filename="quick-answer"
              collectorSource="other"
              className="justify-start"
            />

            {followUps.length > 0 && (
              <div className={`pt-4 border-t ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
                <p className={`mb-2 text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>تحتاج أكثر من إجابة مختصرة؟</p>
                <div className="flex flex-wrap gap-2">
                  {followUps.map((f) => (
                    <Link
                      key={f.href}
                      href={f.href}
                      className={`rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                        isDark ? "border-white/[0.08] text-[#C8A762] hover:bg-white/[0.04]" : "border-zinc-200 text-[#0B3D2E] hover:bg-zinc-50"
                      }`}
                    >
                      {f.labelAr}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <p className={`text-[11px] leading-relaxed ${muted}`}>
              إجابة آلية من نصوص المكتبة وحدها؛ راجع النص الرسمي لكل مصدر قبل الاعتماد عليه.
              {run.chargedPoints > 0 && <> · خُصمت {run.chargedPoints} نقطة</>}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
