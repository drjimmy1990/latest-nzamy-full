"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Play, CheckCircle, XCircle, ArrowRight,
  Headphones, BookOpen, Lightning, Check, X,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Quiz Types ───────────────────────────────────────────────────────────────

type QuizQuestion =
  | { type: "mcq";     text: string; options: string[]; correct: number }
  | { type: "tf";      text: string; correct: boolean }
  | { type: "match";   pairs: { a: string; b: string }[] };

// ─── Mock Data ────────────────────────────────────────────────────────────────

const LESSON = {
  title: "أركان العقد الصحيح",
  duration: "٨ دقائق",
  description: "في هذا الدرس نتعرف على الأركان الثلاثة التي لا يقوم العقد بدونها: المحل، السبب، والتراضي.",
  videoUrl: "#",
  audioUrl: "#",
  quiz: [
    {
      type: "mcq",
      text: "كم عدد أركان العقد الصحيح وفق القانون المدني؟",
      options: ["ركنان", "ثلاثة أركان", "أربعة أركان", "ركن واحد"],
      correct: 1,
    },
    {
      type: "mcq",
      text: "ما الذي يُقصد بـ «محل العقد»؟",
      options: [
        "مكان إبرام العقد",
        "الالتزام الذي يُنشئه العقد",
        "تاريخ توقيع العقد",
        "هوية أطراف العقد",
      ],
      correct: 1,
    },
    {
      type: "tf",
      text: "يمكن أن يكون محل العقد مستحيلاً طالما اتفق الطرفان على ذلك.",
      correct: false,
    },
    {
      type: "tf",
      text: "الإيجاب والقبول ركنان أساسيان من أركان التراضي.",
      correct: true,
    },
    {
      type: "match",
      pairs: [
        { a: "التراضي",  b: "توافق إرادة الطرفين" },
        { a: "المحل",    b: "الالتزام موضوع العقد" },
        { a: "السبب",    b: "الغرض من الالتزام" },
      ],
    },
  ] as QuizQuestion[],
};

// ─── MCQ ─────────────────────────────────────────────────────────────────────

function MCQCard({ q, isDark }: { q: Extract<QuizQuestion, { type: "mcq" }>; isDark: boolean }) {
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;
  return (
    <div className="space-y-2">
      {q.options.map((opt, i) => {
        const isCorrect  = i === q.correct;
        const isSelected = selected === i;
        let ring = "";
        if (answered) {
          if (isCorrect)             ring = "border-emerald-500 bg-emerald-500/10";
          else if (isSelected)       ring = "border-red-400 bg-red-400/10";
          else                       ring = isDark ? "border-white/[0.05] opacity-50" : "border-slate-200 opacity-50";
        } else {
          ring = isDark
            ? "border-white/[0.08] hover:border-white/20 hover:bg-white/5 cursor-pointer"
            : "border-slate-200 hover:border-[#0B3D2E]/40 hover:bg-[#0B3D2E]/5 cursor-pointer";
        }
        return (
          <button
            key={i}
            disabled={answered}
            onClick={() => setSelected(i)}
            className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-sm text-right transition-all ${ring}`}
          >
            <span className={`w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-bold shrink-0 ${
              answered && isCorrect  ? "border-emerald-500 bg-emerald-500 text-white" :
              answered && isSelected ? "border-red-400 bg-red-400 text-white" :
              isDark ? "border-white/20 text-zinc-400" : "border-slate-300 text-slate-400"
            }`}>
              {String.fromCharCode(0x0627 + i) /* أ ب ج د */}
            </span>
            <span className={isDark ? "text-zinc-200" : "text-slate-800"}>{opt}</span>
            {answered && isCorrect  && <CheckCircle size={16} weight="fill" className="text-emerald-500 mr-auto" />}
            {answered && isSelected && !isCorrect && <XCircle size={16} weight="fill" className="text-red-400 mr-auto" />}
          </button>
        );
      })}
    </div>
  );
}

// ─── True / False ─────────────────────────────────────────────────────────────

function TFCard({ q, isDark }: { q: Extract<QuizQuestion, { type: "tf" }>; isDark: boolean }) {
  const [answer, setAnswer] = useState<boolean | null>(null);
  const answered = answer !== null;
  const isRight  = answered && answer === q.correct;

  return (
    <div className="flex gap-3">
      {[true, false].map((val) => {
        const picked   = answered && answer === val;
        const correct  = answered && val === q.correct;
        let cls = "";
        if (!answered)            cls = isDark ? "border-white/[0.08] hover:border-emerald-500/50 hover:bg-emerald-500/5 cursor-pointer" : "border-slate-200 hover:border-[#0B3D2E]/40 hover:bg-[#0B3D2E]/5 cursor-pointer";
        else if (correct)         cls = "border-emerald-500 bg-emerald-500/10";
        else if (picked)          cls = "border-red-400 bg-red-400/10 opacity-60";
        else                      cls = isDark ? "border-white/[0.05] opacity-30" : "border-slate-200 opacity-30";

        return (
          <button key={String(val)} disabled={answered} onClick={() => setAnswer(val)}
            className={`flex-1 flex flex-col items-center gap-2 rounded-xl border py-4 transition-all ${cls}`}>
            {val
              ? <Check size={22} weight="bold" className={correct && answered ? "text-emerald-500" : isDark ? "text-zinc-400" : "text-slate-500"} />
              : <X size={22} weight="bold"    className={correct && answered ? "text-emerald-500" : isDark ? "text-zinc-400" : "text-slate-500"} />
            }
            <span className={`text-sm font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{val ? "صحيح" : "خطأ"}</span>
          </button>
        );
      })}
      {answered && (
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`self-center text-sm font-bold ${isRight ? "text-emerald-500" : "text-red-400"}`}>
          {isRight ? "✓ إجابة صحيحة!" : `✗ الإجابة: ${q.correct ? "صحيح" : "خطأ"}`}
        </motion.span>
      )}
    </div>
  );
}

// ─── Matching ─────────────────────────────────────────────────────────────────

function MatchCard({ q, isDark }: { q: Extract<QuizQuestion, { type: "match" }>; isDark: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [matched,  setMatched]  = useState<Record<string, string>>({});
  const isMatched = (a: string) => a in matched;
  const allDone = Object.keys(matched).length === q.pairs.length;

  const handleBClick = (b: string) => {
    if (!selected) return;
    const correct = q.pairs.find(p => p.a === selected)?.b === b;
    if (correct) setMatched(m => ({ ...m, [selected]: b }));
    setSelected(null);
  };

  const colA = isDark ? "border-white/[0.08]" : "border-slate-200";
  const colB = isDark ? "border-white/[0.08]" : "border-slate-200";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Column A */}
        <div className="space-y-2">
          <p className={`text-[11px] font-bold mb-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>العمود أ</p>
          {q.pairs.map((p) => (
            <button key={p.a} disabled={isMatched(p.a)}
              onClick={() => setSelected(prev => prev === p.a ? null : p.a)}
              className={`w-full rounded-xl border px-3 py-2.5 text-sm text-right transition-all ${
                isMatched(p.a)    ? "border-emerald-500 bg-emerald-500/10 text-emerald-500 opacity-70 cursor-default" :
                selected === p.a  ? "border-[#0B3D2E] bg-[#0B3D2E]/10 text-[#0B3D2E] dark:text-emerald-400" :
                `${colA} ${isDark ? "text-zinc-300 hover:border-white/20" : "text-slate-700 hover:border-slate-400"} cursor-pointer`
              }`}>
              {p.a}
              {isMatched(p.a) && <Check size={12} weight="bold" className="inline mr-1" />}
            </button>
          ))}
        </div>
        {/* Column B */}
        <div className="space-y-2">
          <p className={`text-[11px] font-bold mb-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>العمود ب</p>
          {[...q.pairs].sort(() => 0.5 - Math.random()).map((p) => {
            const done = Object.values(matched).includes(p.b);
            return (
              <button key={p.b} disabled={done || !selected}
                onClick={() => handleBClick(p.b)}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm text-right transition-all ${
                  done ? "border-emerald-500 bg-emerald-500/10 text-emerald-500 opacity-70 cursor-default" :
                  !selected ? `${colB} ${isDark ? "text-zinc-400 opacity-50" : "text-slate-400 opacity-50"} cursor-not-allowed` :
                  `${colB} ${isDark ? "text-zinc-300 hover:border-emerald-400/50" : "text-slate-700 hover:border-[#0B3D2E]/40"} cursor-pointer`
                }`}>
                {p.b}
              </button>
            );
          })}
        </div>
      </div>
      {allDone && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-sm font-bold text-emerald-600 dark:text-emerald-400 text-center">
          🎉 أحسنت! ربطت جميع المفاهيم بشكل صحيح.
        </motion.div>
      )}
    </div>
  );
}

// ─── Quiz Wrapper ─────────────────────────────────────────────────────────────

function QuizSection({ questions, isDark }: { questions: QuizQuestion[]; isDark: boolean }) {
  const [step, setStep] = useState(0);
  const q = questions[step];

  const typeLabel = q.type === "mcq" ? "اختر الإجابة الصحيحة" :
                   q.type === "tf"  ? "صح أم خطأ؟" :
                                      "وصّل من العمود أ إلى العمود ب";
  const typeColor = q.type === "mcq" ? "text-violet-400" : q.type === "tf" ? "text-amber-400" : "text-sky-400";

  return (
    <div className={`rounded-2xl border p-5 space-y-4 ${isDark ? "border-white/[0.08] bg-[#161b22]" : "border-slate-200 bg-white shadow-sm"}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-[11px] font-bold uppercase tracking-widest ${typeColor}`}>{typeLabel}</p>
          <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            سؤال {step + 1} من {questions.length}
          </p>
        </div>
        <div className="flex gap-1">
          {questions.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${
              i === step ? "w-5 bg-[#0B3D2E]" : i < step ? "w-2 bg-emerald-500" : `w-2 ${isDark ? "bg-white/15" : "bg-slate-200"}`
            }`} />
          ))}
        </div>
      </div>

      {/* Question text */}
      {"text" in q && (
        <p className={`text-sm font-semibold leading-relaxed ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{q.text}</p>
      )}
      {q.type === "match" && (
        <p className={`text-sm font-semibold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>اربط كل مصطلح بتعريفه الصحيح:</p>
      )}

      {/* Question body */}
      <AnimatePresence mode="wait">
        <motion.div key={step}
          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
          {q.type === "mcq"   && <MCQCard   q={q} isDark={isDark} />}
          {q.type === "tf"    && <TFCard    q={q} isDark={isDark} />}
          {q.type === "match" && <MatchCard q={q} isDark={isDark} />}
        </motion.div>
      </AnimatePresence>

      {/* Nav */}
      <div className="flex justify-between pt-1">
        <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
          className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg transition ${step === 0 ? "opacity-30 cursor-not-allowed" : isDark ? "text-zinc-400 hover:text-white" : "text-slate-400 hover:text-slate-700"}`}>
          <ArrowRight size={14} /> السابق
        </button>
        {step < questions.length - 1 ? (
          <button onClick={() => setStep(s => s + 1)}
            className="flex items-center gap-1 text-sm px-4 py-1.5 rounded-lg bg-[#0B3D2E] text-white font-bold hover:bg-[#0a3328] transition">
            التالي <ArrowLeft size={14} />
          </button>
        ) : (
          <span className="text-sm text-emerald-500 font-bold flex items-center gap-1">
            <CheckCircle size={15} weight="fill" /> اكتملت الاختبارات
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function LessonPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const { isDark } = useTheme();
  const [tab, setTab] = useState<"video" | "audio" | "quiz">("video");

  const card     = isDark ? "border-white/[0.08] bg-[#161b22]" : "border-slate-200 bg-white shadow-sm";
  const textPri  = isDark ? "text-zinc-100"  : "text-slate-900";
  const textMuted= isDark ? "text-zinc-400"  : "text-slate-500";

  return (
    <div dir="rtl" className="max-w-4xl mx-auto space-y-5">
      {/* Back */}
      <Link href={`/academy/${slug}`}
        className={`inline-flex items-center gap-2 text-sm group transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-200" : "text-slate-500 hover:text-[#0B3D2E]"}`}>
        <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
        العودة للدورة
      </Link>

      {/* Title */}
      <div className={`rounded-2xl border p-5 ${card}`}>
        <h1 className={`text-xl font-black mb-1 ${textPri}`}>{LESSON.title}</h1>
        <p className={`text-sm ${textMuted}`}>{LESSON.description}</p>
      </div>

      {/* Tabs */}
      <div className={`flex gap-1 rounded-xl p-1 ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>
        {([
          { key: "video", label: "فيديو",    icon: Play },
          { key: "audio", label: "صوت",      icon: Headphones },
          { key: "quiz",  label: "اختبار",   icon: Lightning },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${
              tab === key
                ? "bg-[#0B3D2E] text-white shadow-sm"
                : isDark ? "text-zinc-500 hover:text-zinc-200" : "text-slate-500 hover:text-slate-700"
            }`}>
            <Icon size={14} weight="fill" /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

          {tab === "video" && (
            <div className={`rounded-2xl border overflow-hidden ${card}`}>
              <div className={`aspect-video flex items-center justify-center ${isDark ? "bg-zinc-900" : "bg-slate-100"}`}>
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-[#0B3D2E] flex items-center justify-center mx-auto mb-3 shadow-lg cursor-pointer hover:scale-105 transition-transform">
                    <Play size={28} weight="fill" className="text-white mr-[-3px]" />
                  </div>
                  <p className={`text-sm ${textMuted}`}>{LESSON.title}</p>
                  <p className={`text-xs mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{LESSON.duration}</p>
                </div>
              </div>
            </div>
          )}

          {tab === "audio" && (
            <div className={`rounded-2xl border p-6 ${card}`}>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#0B3D2E] flex items-center justify-center shrink-0">
                  <Headphones size={26} weight="fill" className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm mb-0.5 ${textPri}`}>{LESSON.title}</p>
                  <p className={`text-xs ${textMuted}`}>نسخة صوتية · {LESSON.duration}</p>
                  <div className={`mt-3 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/10" : "bg-slate-200"}`}>
                    <div className="h-full w-0 bg-[#0B3D2E] rounded-full" />
                  </div>
                </div>
                <button className="w-10 h-10 rounded-xl bg-[#0B3D2E] flex items-center justify-center hover:bg-[#0a3328] transition">
                  <Play size={16} weight="fill" className="text-white mr-[-2px]" />
                </button>
              </div>
            </div>
          )}

          {tab === "quiz" && (
            <QuizSection questions={LESSON.quiz} isDark={isDark} />
          )}

        </motion.div>
      </AnimatePresence>

      {/* Lesson nav */}
      <div className="flex justify-between">
        <Link href={`/academy/${slug}/lesson/${Math.max(1, Number(id) - 1)}`}
          className={`flex items-center gap-2 text-sm px-4 py-2 rounded-xl border transition ${isDark ? "border-white/[0.08] text-zinc-400 hover:text-white" : "border-slate-200 text-slate-500 hover:text-slate-800"}`}>
          <ArrowRight size={14} /> الدرس السابق
        </Link>
        <Link href={`/academy/${slug}/lesson/${Number(id) + 1}`}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-[#0B3D2E] text-white font-bold hover:bg-[#0a3328] transition">
          الدرس التالي <ArrowLeft size={14} />
        </Link>
      </div>
    </div>
  );
}
