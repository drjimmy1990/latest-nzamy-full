"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChatCircleDots, CaretLeft, Sparkle, MagnifyingGlass, Copy, CheckCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { asCitations, CitedText, SourceList, stripCitationMarkers } from "@/components/ai/CitedAnswer";
import { useAiRun } from "@/hooks/useAiRun";
import { QUICK_ANSWER_QUESTION_MAX } from "@/lib/ai/tools";

/**
 * سؤال قانوني سريع (plan §5 L3): one question → a short answer written only
 * from library texts. The server searches the library, sends the texts to the
 * model, keeps only the citations that name a text it sent, and refunds an
 * answer that cites none (or a question nothing in the library matches). The
 * page shows the answer and links each [S…] marker to its text; it never
 * shows an answer of its own.
 */

export default function QuickAnswerPage() {
  const { isDark } = useTheme();
  const [question, setQuestion] = useState("");
  const [copied, setCopied] = useState(false);
  const run = useAiRun();
  const asking = run.busy;
  const answer = run.phase === "done" && typeof run.output?.answer === "string" ? run.output.answer : null;
  const cites = asCitations(run.citations);

  function ask() {
    const q = question.trim();
    if (q.length < 8 || asking) return;
    void run.start("quick-answer", { question: q });
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={`text-[11px] ${muted}`}>
            {question.length.toLocaleString("ar-SA")} / {QUICK_ANSWER_QUESTION_MAX.toLocaleString("ar-SA")} · ٢٠ نقطة للسؤال
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
            {run.error}
          </p>
        )}
        <p className={`text-[11px] leading-relaxed ${muted}`}>
          يُرسَل سؤالك ونصوص المكتبة المتعلقة به إلى مزوّد ذكاء اصطناعي خارج المملكة لمعالجته؛ لا تُدخل بيانات شخصية لا يلزمها السؤال.
        </p>
      </div>

      {/* ── Working ── */}
      {asking && (
        <div className={`${card} flex flex-col items-center justify-center py-12 text-center`}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="mb-4 h-12 w-12 rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-[#1a6b50] flex items-center justify-center"
          >
            <MagnifyingGlass size={22} weight="duotone" className="text-[#C8A762]" />
          </motion.div>
          <p className={`text-[14px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
            يبحث في مكتبة الأنظمة ثم يكتب الإجابة...
          </p>
        </div>
      )}

      {/* ── Answer ── */}
      {answer && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${card} overflow-hidden`}>
          <div className={`flex items-center justify-between px-5 py-3.5 border-b ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
            <span className={`text-[13px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>الإجابة</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(stripCitationMarkers(answer));
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] border ${
                isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-500"
              }`}
            >
              {copied ? <CheckCircle size={11} className="text-emerald-500" /> : <Copy size={11} />}
              {copied ? "تم" : "نسخ"}
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
              <SourceList cites={cites} isDark={isDark} />
            </div>

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
