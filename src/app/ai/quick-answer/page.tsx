"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ChatCircleDots, CaretLeft, Sparkle, ArrowCounterClockwise,
} from "@phosphor-icons/react";
import Link from "next/link";
import { PLAN_ALLOWANCE_COPY, PLAN_ALLOWANCE_TOPUP_HREF } from "@/lib/ai/planAllowance";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import { asCitations, CitedText, SourceList, stripCitationMarkers } from "@/components/ai/CitedAnswer";
import { useAiRun } from "@/hooks/useAiRun";
import { AiThinkingStage } from "@/components/ai/AiThinkingStage";
import { aiToolLabelAr } from "@/lib/ai/toolLabels";
import { RUN_HELD_MESSAGE_AR } from "@/lib/ai/runPageView";
import { QUICK_ANSWER_QUESTION_MAX } from "@/lib/ai/tools";
import { aiToolPointRange, aiToolPriceText } from "@/lib/ai/toolPointsDisplay";
import { FLOATING_FREE_QUESTION_TOOL, FREE_QUESTION_COPY, GENERAL_FREE_QUESTION_TOOL } from "@/lib/ai/freeQuestion";
import { useUser } from "@/hooks/useUser";
import { useToolUsable } from "@/hooks/useToolUsable";
import DashboardComingSoon from "@/components/ui/DashboardComingSoon";
import { isConsultantBlockedPath } from "@/lib/auth/practiceKind";
import { canSeeLawyerTools, isLawyerOnlyAiHref } from "@/lib/ai/lawyerOnlyTools";
import { libraryToolRefusal } from "@/lib/ai/libraryToolRefusal";
import { useToolDraft } from "@/hooks/useToolDraft";
import { draftText } from "@/lib/payments/topUpDraft";
import LibraryToolRefusalNote from "@/components/ai/LibraryToolRefusalNote";
import {
  QUICK_ANSWER_EXAMPLES, QUICK_ANSWER_FOLLOW_UPS, QUICK_ANSWER_UNGROUNDED_LABEL,
  isUngroundedAnswer, quickAnswerExportText, quickAnswerRefusalText,
} from "./_quickAnswer";
import ToolPointsAvailable from "@/components/payments/ToolPointsAvailable";

/**
 * سؤال قانوني سريع (plan §5 L3): one question → a short answer written only
 * from library texts. The server searches the library, sends the texts to the
 * model, keeps only the citations that name a text it sent, and refunds a
 * question nothing in the library matches. Owner ٤١٣ option A: an answer that
 * cites none of the texts is kept, charged and shown under the label «إجابة
 * عامة بلا سند مرجعي — تحقق منها» (the server flags it `ungrounded`); only the
 * model's «النصوص لا تجيب» sentence is refunded. The page links each [S…]
 * marker to its text; it never shows an answer of its own.
 *
 * S3-06: examples, collapsible sources, the shared result actions, a reset and
 * the next tools. The price is the registry's (owner ٤١٢: 10 points).
 *
 * Owner ٣٠ (18 Nov 2026, batch l7 decision 6): the free questions are a
 * once-per-account allowance; the daily free quick question (owner ٤١٢) is
 * gone. Register 4 / 36 (batch l9): an INDIVIDUAL's 5 are spent HERE, on the
 * general assistant, before any points; the line «أسئلتك المجانية المتبقية»
 * shows only while the server says some are left. Everyone else pays the
 * registry price here (a lawyer's 10 are on the library assistant).
 * Q181 (batch l13): only while the admin setting names quick-answer; by
 * default an individual's 5 are in «مساعد نظامي», the floating window.
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
  // l6-pay: back from an in-place top-up, the refused question is still here
  useToolDraft("quick-answer", (d) => {
    const q = draftText(d, "question");
    if (q) setQuestion((cur) => cur || q);
  });
  // File 15 row 30 (l9): the client dashboard's «لديك سؤال قانوني؟» box opens
  // this page with ?q=; the question is only put in the box, never sent.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("q")?.trim();
      if (q) setQuestion((cur) => cur || q.slice(0, QUICK_ANSWER_QUESTION_MAX));
    } catch {
      // no URL to read: the box stays empty
    }
  }, []);
  const asking = run.busy;
  // Register 4 / 36 (l9): an individual's free questions left on this tool, as
  // the server counts them; null (nothing shown) until it answers or when none.
  const [free, setFree] = useState<{ left: number; total: number } | null>(null);
  const [floatingFree, setFloatingFree] = useState<{ left: number; total: number } | null>(null);
  // Q181 (l13): the individual's tool is a setting (the floating window by
  // default), so the server decides: it answers NONE unless this is his tool.
  const freeHere = user.userType === "individual";
  useEffect(() => {
    if (!freeHere || asking) return;
    let live = true;
    fetch(`/api/v1/ai/free-question?tool=${GENERAL_FREE_QUESTION_TOOL}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        const s = j as { available?: unknown; left?: unknown; total?: unknown } | null;
        if (!live) return;
        setFree(s && s.available === true && typeof s.left === "number" && typeof s.total === "number" ? { left: s.left, total: s.total } : null);
      })
      .catch(() => { if (live) setFree(null); });
    // Q181: his free questions in «مساعد نظامي» (the default), so he is told
    // before paying here — the server's count, shown only when some are left.
    fetch(`/api/v1/ai/free-question?tool=${FLOATING_FREE_QUESTION_TOOL}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        const s = j as { available?: unknown; left?: unknown; total?: unknown } | null;
        if (!live) return;
        setFloatingFree(s && s.available === true && typeof s.left === "number" && typeof s.total === "number" ? { left: s.left, total: s.total } : null);
      })
      .catch(() => { if (live) setFloatingFree(null); });
    return () => { live = false; };
  }, [freeHere, asking, run.phase]);
  const answer = run.phase === "done" && typeof run.output?.answer === "string" ? run.output.answer : null;
  const cites = asCitations(run.citations);
  const ungrounded = isUngroundedAnswer(run.output);
  // Owner ٤١٧: open to every account (general guidance), but the library's AI tier still gates it.
  const libraryRefusal = run.phase === "error" ? libraryToolRefusal(run.code, "سؤال قانوني سريع", user.userType, true) : null;
  // Art. 18: /ai/wargaming refuses a consultant, so it is not offered to him.
  // Owner ٤١٧ (8 Nov): «عصارة المرفقات» (/ai/analyze's lawyer half) and the simulator are
  // lawyer and firm tools, so another account is offered only the legal opinion.
  const lawyerTools = canSeeLawyerTools(user.userType);
  const followUps = QUICK_ANSWER_FOLLOW_UPS
    .filter((f) => !(user.practiceKind === "consultant" && isConsultantBlockedPath(f.href)))
    .filter((f) => lawyerTools || !(isLawyerOnlyAiHref(f.href) || f.href === "/ai/analyze"));

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
            {question.length.toLocaleString("ar-SA")} / {QUICK_ANSWER_QUESTION_MAX.toLocaleString("ar-SA")} · {`${aiToolPriceText("quick-answer", "ar")} للسؤال`}
            <ToolPointsAvailable tool="quick-answer" price={aiToolPointRange("quick-answer")[0]} leading=" · " />
            {free && <> · <span className={`font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>{FREE_QUESTION_COPY.left(free.left, free.total)}</span></>}
            {floatingFree && (
              <>
                {" · "}
                <Link href="/ai" className={`font-bold underline ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                  {FREE_QUESTION_COPY.floatingElsewhere(floatingFree.left, floatingFree.total)}
                </Link>
              </>
            )}
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
        {run.phase === "error" && libraryRefusal && <LibraryToolRefusalNote refusal={libraryRefusal} isDark={isDark} />}
        {run.phase === "error" && run.error && !libraryRefusal && (
          <p role="alert" className={`text-[12px] leading-relaxed ${isDark ? "text-red-400" : "text-red-600"}`}>
            {quickAnswerRefusalText(run.code) ?? run.error}
            {/* ق٢٦-٦ (l19): the plan's questions of this month are used and the points do not cover one. */}
            {run.code === "plan_allowance_used" && (
              <>
                {" "}
                <Link href={PLAN_ALLOWANCE_TOPUP_HREF} className="font-bold underline">
                  {PLAN_ALLOWANCE_COPY.topupLink}
                </Link>
              </>
            )}
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
            {ungrounded && (
              <p role="note" className={`rounded-xl border px-3 py-2 text-[12px] font-bold ${
                isDark ? "border-amber-900/40 bg-amber-900/10 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"
              }`}>
                {QUICK_ANSWER_UNGROUNDED_LABEL}
              </p>
            )}
            <CitedText
              text={answer}
              cites={cites}
              isDark={isDark}
              className={`text-[14px] leading-loose ${isDark ? "text-zinc-200" : "text-zinc-800"}`}
            />

            {cites.length > 0 && (
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
            )}

            <AiResultActions
              text={quickAnswerExportText(stripCitationMarkers(answer), ungrounded)}
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
