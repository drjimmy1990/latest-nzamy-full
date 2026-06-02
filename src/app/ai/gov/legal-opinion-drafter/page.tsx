"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserCircleGear, Scales, FileText, Warning,
  ArrowLeft, ArrowRight, Sparkle, CheckCircle,
  Copy, Download, BookOpen, ListChecks
} from "@phosphor-icons/react";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";

// ─── Types ────────────────────────────────────────────────────────────────────
type OpinionType =
  | "رأي قانوني في عقد" | "رأي في مشروعية إجراء" | "رأي في تفسير نص نظامي"
  | "رأي في نزاع إداري" | "رأي في عقوبة / مخالفة" | "رأي في مناقصة / مشتريات";

const OPINION_TYPES: OpinionType[] = [
  "رأي قانوني في عقد", "رأي في مشروعية إجراء", "رأي في تفسير نص نظامي",
  "رأي في نزاع إداري", "رأي في عقوبة / مخالفة", "رأي في مناقصة / مشتريات"
];

type Step = "input" | "research" | "result";

export default function LegalOpinionDrafterPage() {
  const [step, setStep] = useState<Step>("input");
  const [opinionType, setOpinionType] = useState<OpinionType | "">("");
  const [factsText, setFactsText] = useState("");
  const [question, setQuestion] = useState("");
  const [relatedLaws, setRelatedLaws] = useState("");
  const [requestingEntity, setRequestingEntity] = useState("");
  const [requestDate, setRequestDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const MOCK_OPINION = `الرأي القانوني
══════════════════════════════════════════

الجهة الطالبة: ${requestingEntity || "——"}
تاريخ الطلب: ${requestDate || "——"}
موضوع الرأي: ${opinionType || "——"}

────────────────────────────────────────

أولاً: الوقائع والمسألة القانونية

${factsText || "الوقائع المعروضة..."}

المسألة القانونية المطروحة:
${question || "السؤال القانوني..."}

────────────────────────────────────────

ثانياً: الأساس النظامي

${relatedLaws ? `النصوص المستشهد بها:\n${relatedLaws}\n` : ""}
استناداً إلى أحكام نظام المنافسات والمشتريات الحكومية ولوائحه التنفيذية،
ونظام الإجراءات الجزائية، وما تقرر من مبادئ قانونية راسخة...

────────────────────────────────────────

ثالثاً: التحليل القانوني

بعد استعراض الوقائع والنصوص النظامية ذات الصلة، يتضح ما يلي:

1. من حيث المشروعية: ${opinionType === "رأي في مشروعية إجراء" ? "إن الإجراء المعروض..." : "إن المسألة المطروحة تستوجب النظر في..."}

2. من حيث الأثر القانوني: تترتب على ذلك آثار قانونية تشمل...

3. من حيث البدائل المتاحة: يمكن للجهة الطالبة...

────────────────────────────────────────

رابعاً: الرأي القانوني

بناءً على ما سبق، يرى المستشار القانوني ما يلي:

${opinionType === "رأي قانوني في عقد" ? "أن العقد المعروض مستوفٍ للشروط النظامية، مع التنبيه على..." :
  opinionType === "رأي في مشروعية إجراء" ? "أن الإجراء المعروض مشروع نظامياً، غير أنه يستلزم..." :
  "بالنظر في المسألة المطروحة، يرى المستشار أن..."}

────────────────────────────────────────

خامساً: التوصيات

1. يُوصى بـ...
2. يُنبّه على...
3. يُقترح...

────────────────────────────────────────

صدر هذا الرأي من المستشار القانوني
بتاريخ: ${requestDate || "——"}
التوقيع: __________________
الختم الرسمي: __________________

ملاحظة: هذا الرأي قانوني استشاري وغير ملزم إلا بالقدر المقرر نظامياً.`;

  function handleGenerate() {
    setLoading(true);
    setTimeout(() => { setLoading(false); setStep("result"); }, 1600);
  }

  function handleCopy() {
    navigator.clipboard.writeText(MOCK_OPINION);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const canInput = opinionType && factsText.length > 20 && question.length > 10;

  return (
    <div className="min-h-[100dvh] bg-[#0d1117] text-white p-5 md:p-7 max-w-4xl mx-auto" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3 mb-7">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-700 to-sky-500 flex items-center justify-center shadow-lg">
          <UserCircleGear size={20} weight="fill" className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">صائغ الرأي القانوني</h1>
          <p className="text-[12px] text-zinc-500">وقائع + تحليل + أسانيد + رأي ملزم — للمستشار الحكومي</p>
        </div>
        <span className="mr-auto rounded-full bg-blue-500/10 border border-blue-500/25 px-3 py-1 text-[10px] font-bold text-blue-400">
          حكومي · مستشار
        </span>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-7">
        {(["input","research","result"] as Step[]).map((s, i) => {
          const labels = ["الوقائع والمسألة","الأسانيد النظامية","الرأي القانوني"];
          const idx = ["input","research","result"].indexOf(step);
          const done = i < idx;
          const active = s === step;
          return (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 transition-all ${
                done ? "bg-emerald-500 text-white" :
                active ? "bg-blue-500 text-white" :
                "bg-white/[0.06] text-zinc-600"
              }`}>
                {done ? <CheckCircle size={14} weight="fill" /> : i+1}
              </div>
              <span className={`text-[10px] hidden sm:block ${active ? "text-white font-semibold" : done ? "text-emerald-500" : "text-zinc-600"}`}>
                {labels[i]}
              </span>
              {i < 2 && <div className={`flex-1 h-px ${done ? "bg-emerald-500/30" : "bg-white/[0.05]"}`} />}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">

        {/* ── Step 1: Input ─────────────────────────────────────────────── */}
        {step === "input" && (
          <motion.div key="input" initial={{ opacity:0,y:12 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-12 }} className="space-y-5">

            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-zinc-400">نوع الرأي القانوني</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {OPINION_TYPES.map(t => (
                  <button key={t} onClick={() => setOpinionType(t)}
                    className={`rounded-xl border px-3 py-2.5 text-[11px] font-semibold text-right transition-all ${
                      opinionType === t ? "border-blue-500/50 bg-blue-500/10 text-blue-400" : "border-white/[0.07] bg-white/[0.03] text-zinc-500 hover:border-white/20"
                    }`}>{t}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400">الجهة الطالبة</label>
                <input value={requestingEntity} onChange={e => setRequestingEntity(e.target.value)}
                  placeholder="اسم الوزارة / الجهة"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-zinc-400">تاريخ الطلب</label>
                <input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white focus:outline-none focus:border-blue-500/40"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400 flex items-center gap-1.5">
                <BookOpen size={12}/> الوقائع والخلفية
              </label>
              <textarea value={factsText} onChange={e => setFactsText(e.target.value)} rows={5}
                placeholder="اذكر الوقائع والخلفية التي تستدعي طلب الرأي القانوني..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/40 resize-none leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400 flex items-center gap-1.5">
                <ListChecks size={12}/> المسألة القانونية المحددة
              </label>
              <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={3}
                placeholder="ما هو السؤال القانوني المحدد الذي تحتاج الإجابة عليه؟ كن دقيقاً..."
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/40 resize-none"
              />
            </div>

            <div className="flex justify-start pt-2">
              <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
                onClick={() => setStep("research")} disabled={!canInput}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-[12px] font-bold text-white shadow-md disabled:opacity-40"
              >
                التالي — الأسانيد النظامية <ArrowLeft size={13} />
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── Step 2: Research / Laws ───────────────────────────────────── */}
        {step === "research" && (
          <motion.div key="research" initial={{ opacity:0,y:12 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-12 }} className="space-y-5">

            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-[12px] text-zinc-400 flex gap-2">
              <Scales size={15} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <span>
                أدخل النصوص النظامية التي تودّ الاستناد إليها في الرأي. يمكن تركها فارغة وسيستند النظام لقواعد عامة.
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-semibold text-zinc-400">النصوص النظامية المستشهد بها (اختياري)</label>
              <textarea value={relatedLaws} onChange={e => setRelatedLaws(e.target.value)} rows={7}
                placeholder={`مثال:
- المادة (3) من نظام المنافسات والمشتريات الحكومية
- المادة (15) من نظام مكافحة الفساد
- الفقرة (ب) من المادة (8) من اللائحة التنفيذية لنظام المشتريات`}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/40 resize-none leading-relaxed font-mono"
              />
            </div>

            {/* Review card */}
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 space-y-3 text-[12px]">
              <h3 className="font-bold text-white text-[13px]">ملخص قبل الصياغة</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-zinc-500">نوع الرأي</span><p className="font-semibold text-white mt-0.5">{opinionType}</p></div>
                <div><span className="text-zinc-500">الجهة الطالبة</span><p className="font-semibold text-white mt-0.5">{requestingEntity || "غير محدد"}</p></div>
              </div>
              <div><span className="text-zinc-500">المسألة القانونية</span><p className="text-zinc-300 mt-0.5 leading-relaxed">{question}</p></div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setStep("input")}
                className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-[12px] font-semibold text-zinc-400">
                <ArrowRight size={13} /> السابق
              </button>
              <motion.button whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
                onClick={handleGenerate} disabled={loading}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-l from-blue-700 to-sky-500 px-7 py-2.5 text-[12px] font-bold text-white shadow-lg shadow-blue-500/20 disabled:opacity-60"
              >
                {loading ? (
                  <><motion.div animate={{ rotate:360 }} transition={{ duration:0.8, repeat:Infinity, ease:"linear" }}
                    className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white" />
                  جارٍ صياغة الرأي...</>
                ) : (
                  <><Sparkle size={14} weight="fill" /> صِغ الرأي القانوني</>
                )}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── Step 3: Result ───────────────────────────────────────────── */}
        {step === "result" && (
          <BetaReviewGate toolId="gov.legal-opinion-drafter" toolName="الرأي القانوني الحكومي" reviewScope="legal-data">
          <motion.div key="result" initial={{ opacity:0,y:12 }} animate={{ opacity:1,y:0 }} className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} weight="fill" className="text-emerald-500" />
                <span className="text-[13px] font-bold text-white">تم صياغة الرأي القانوني</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:text-white transition-all">
                  {copied ? <CheckCircle size={12} className="text-emerald-500" /> : <Copy size={12} />}
                  {copied ? "تم" : "نسخ"}
                </button>
                <button className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:text-white transition-all">
                  <Download size={12} /> تحميل PDF
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
              <pre className="text-[12px] text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">{MOCK_OPINION}</pre>
            </div>

            <AiResultActions text={MOCK_OPINION} filename="gov-legal-opinion" showShare />

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-[11px] text-zinc-500 flex gap-2">
              <Warning size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <span>هذا رأي مُساعِد للصياغة — يجب مراجعته من المستشار القانوني المختص وختمه قبل الإرسال الرسمي.</span>
            </div>

            <button onClick={() => { setStep("input"); setOpinionType(""); setFactsText(""); setQuestion(""); setRelatedLaws(""); }}
              className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5 text-[12px] font-semibold text-zinc-400 hover:text-white hover:border-white/20 transition-all">
              <FileText size={13} /> رأي قانوني جديد
            </button>
          </motion.div>
          </BetaReviewGate>
        )}

      </AnimatePresence>
    </div>
  );
}
