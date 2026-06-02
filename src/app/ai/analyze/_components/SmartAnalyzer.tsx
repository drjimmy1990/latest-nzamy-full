"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadSimple, Sparkle, FileText, X, CheckCircle,
  Warning, ShieldWarning, Info, ChatDots, ArrowCounterClockwise,
  ArrowRight, Question, Microphone, Stop,
} from "@phosphor-icons/react";
import Link from "next/link";
import { buildEvalReport } from "./evalReport";
import { domains } from "./types";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";

interface Props { isDark: boolean; isRTL: boolean; }
interface DynQ { q: string; placeholder: string; }

// ─── Contextual question generator — reads user text, extracts gaps ───────────
function generateContextualQuestions(input: string): DynQ[] {
  const t = input;
  const questions: DynQ[] = [];

  // 1) Detect parties involved — if not mentioned, ask
  const hasParty = /صاحب العمل|الشركة|المالك|المستأجر|الطرف|زوج|زوجة|البائع|المقاول|الشريك|الجهة|البنك|الموظف/.test(t);
  if (!hasParty) {
    questions.push({ q: "مَن الطرف الآخر في هذا الموضوع؟", placeholder: "شركة / شخص / جهة حكومية / بنك..." });
  }

  // 2) Detect timeline — if no dates or time references
  const hasTime = /شهر|سنة|أسبوع|يوم|تاريخ|من \d|في \d|قبل|بعد|أمس|الأسبوع|الشهر الماضي|2024|2025|2026/.test(t);
  if (!hasTime) {
    questions.push({ q: "متى حدث ذلك تقريباً؟", placeholder: "مثال: قبل شهرين / في يناير 2025..." });
  }

  // 3) Detect amounts/money — if financial topic but no numbers
  const isFinancial = /مبلغ|فلوس|راتب|مرتب|تعويض|دفع|سداد|مستحقات|إيجار|ثمن|سعر|ريال|دين/.test(t);
  const hasAmount = /\d{2,}|ريال|ألف|مليون/.test(t);
  if (isFinancial && !hasAmount) {
    questions.push({ q: "كم المبلغ المتنازع عليه أو المطالَب به؟", placeholder: "المبلغ بالريال تقريباً..." });
  }

  // 4) Detect documentation status
  const hasDocMention = /عقد|اتفاق|إثبات|مستند|ورق|رسائل|واتساب|رسمي|موثق|شهود|صور/.test(t);
  if (!hasDocMention) {
    questions.push({ q: "هل عندك أي مستندات أو إثباتات تدعم كلامك؟", placeholder: "عقد / رسائل واتساب / صور / شهود..." });
  }

  // 5) Detect prior legal action
  const hasPriorAction = /محكمة|قضية|حكم|شكوى|تنفيذ|ناجز|محامي|بلاغ|صلح|لجنة/.test(t);
  if (!hasPriorAction) {
    questions.push({ q: "هل سبق رفعت شكوى أو اتخذت أي إجراء قانوني؟", placeholder: "نعم (اذكر أين) / لا / قيد التفكير..." });
  }

  // 6) Detect desired outcome
  const hasOutcome = /أبغى|أريد|أطالب|أرجع|تعويض|فسخ|إلغاء|حقي|استرداد|إنهاء|حل/.test(t);
  if (!hasOutcome) {
    questions.push({ q: "ما النتيجة التي تتمناها من هذا الموضوع؟", placeholder: "تعويض / إنهاء العلاقة / استرجاع حق / صلح..." });
  }

  // 7) Context-specific deep questions based on keywords found
  if (/فصل|طرد|إنهاء خدمة/.test(t)) {
    questions.push({ q: "هل تم إبلاغك كتابياً بالفصل أو الإنهاء؟ وما السبب المذكور؟", placeholder: "السبب الرسمي إن وُجد..." });
  }
  if (/إيجار|شقة|عقار|سكن/.test(t) && !/إيجار/.test(t.slice(0, 5))) {
    questions.push({ q: "هل العقد مسجّل في منصة إيجار الإلكترونية؟", placeholder: "نعم / لا / ما أدري..." });
  }
  if (/طلاق|حضانة|نفقة/.test(t)) {
    questions.push({ q: "هل يوجد أطفال قاصرون تتأثر مصالحهم؟ كم أعمارهم؟", placeholder: "عدد الأطفال وأعمارهم..." });
  }
  if (/عقد|اتفاقية|شراكة/.test(t) && /بند|شرط|مخالف/.test(t)) {
    questions.push({ q: "ما البند أو الشرط اللي تحس إنه ظالم أو مريب بالتحديد؟", placeholder: "اذكر نص البند أو وصفه..." });
  }
  if (/حادث|مرور|سيارة|تصادم/.test(t)) {
    questions.push({ q: "هل صدر تقرير مروري رسمي وتم تحديد نسبة الخطأ؟", placeholder: "نعم (كم النسبة) / لا..." });
  }
  if (/تأمين|مطالبة تأمين|رفض التأمين/.test(t)) {
    questions.push({ q: "هل قدّمت مطالبة رسمية لشركة التأمين؟ وما سبب الرفض إن وُجد؟", placeholder: "سبب الرفض..." });
  }

  // Limit to 3-5 most relevant questions, deduplicate
  const seen = new Set<string>();
  const unique = questions.filter(q => {
    if (seen.has(q.q)) return false;
    seen.add(q.q);
    return true;
  });

  return unique.slice(0, 4);
}

const sp = { type: "spring" as const, stiffness: 280, damping: 26 };

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: sp },
};

// ─── Skeleton for "AI thinking" phase ─────────────────────────────────────────
function ThinkingSkeleton({ isDark }: { isDark: boolean }) {
  const b = isDark ? "bg-zinc-800" : "bg-slate-200";
  return (
    <div className="space-y-4 animate-pulse">
      <div className={`h-3 w-2/5 rounded-full ${b}`} />
      <div className={`h-12 rounded-xl ${b}`} />
      <div className={`h-12 rounded-xl ${b}`} />
      <div className={`h-12 rounded-xl ${b}`} />
    </div>
  );
}

function ResultSkeleton({ isDark }: { isDark: boolean }) {
  const b = isDark ? "bg-zinc-800" : "bg-slate-200";
  return (
    <div className="space-y-4 animate-pulse pt-2">
      <div className={`h-2.5 w-1/3 rounded-full ${b}`} />
      <div className={`h-10 rounded-xl ${b}`} />
      <div className="grid grid-cols-2 gap-3">
        <div className={`h-28 rounded-2xl ${b}`} />
        <div className={`h-28 rounded-2xl ${b}`} />
      </div>
      <div className={`h-20 rounded-2xl ${b}`} />
    </div>
  );
}

export default function SmartAnalyzer({ isDark, isRTL }: Props) {
  const searchParams = useSearchParams();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<"input" | "thinking" | "questions" | "loading" | "result">("input");
  const [dynQuestions, setDynQuestions] = useState<DynQ[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [report, setReport] = useState<ReturnType<typeof buildEvalReport> | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-select mode from URL ?mode=eval|doc
  useEffect(() => {
    const mode = searchParams.get("mode");
    if (mode === "doc") {
      setText(""); // doc mode: user will upload a file
    } else if (mode === "eval") {
      setText(""); // eval mode: user describes situation
    }
  }, [searchParams]);

  // Voice input
  function toggleRecording() {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("المتصفح لا يدعم الإدخال الصوتي. جرب Chrome أو Edge.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "ar-SA";
    recognition.continuous = true;
    recognition.interimResults = true;
    let interim = "";
    recognition.onresult = (e: any) => {
      let final = "";
      interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setText(prev => (prev + " " + final).trim());
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }

  const ts = isDark ? "text-zinc-500" : "text-zinc-400";
  const border = isDark ? "border-white/[0.07]" : "border-slate-200";
  const cardBg = isDark ? "bg-zinc-900/70" : "bg-white";
  const card = `rounded-2xl border ${border} ${cardBg}`;

  function handleFile(file: File) {
    setFileName(file.name);
    setText(`[ملف: ${file.name}]`);
  }
  function clearFile() { setFileName(null); setText(""); if (fileRef.current) fileRef.current.value = ""; }

  async function submit() {
    setPhase("thinking");
    // Simulate AI parsing the text to generate questions
    await new Promise(r => setTimeout(r, 1200));
    const qs = generateContextualQuestions(text);
    setDynQuestions(qs);
    setAnswers(Array(qs.length).fill(""));
    setPhase("questions");
  }

  async function runAnalysis() {
    setPhase("loading");
    await new Promise(r => setTimeout(r, 2200));
    const combined = text + "\n---\n" + dynQuestions.map((q, i) => `${q.q}: ${answers[i]}`).join("\n");
    setReport(buildEvalReport(domains[0], [combined, "", ""], isRTL));
    setPhase("result");
  }

  function reset() { setText(""); setFileName(null); setPhase("input"); setReport(null); setAnswers([]); setDynQuestions([]); }

  const canSubmit = text.trim().length > 10;
  const canAnalyze = answers.length > 0 && answers.every(a => a.trim().length > 0);

  // ── RESULT ──────────────────────────────────────────────────────────────────
  if (phase === "result" && report) return (
    <motion.div key="result" variants={stagger} initial="hidden" animate="show" className="space-y-5">
      <BetaReviewGate toolId="analyze.smart.result" toolName="تحليل قوة الموقف القانوني" reviewScope="legal-data">
      <motion.div variants={fadeUp} className={`${card} p-5`}>
        <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${ts}`}>قوة موقفك القانوني</p>
        <div className="flex items-center gap-4">
          <div className={`flex-1 h-2 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${report.strengthScore}%` }}
              transition={{ duration: 1.1, ease: [0.16,1,0.3,1], delay: 0.2 }}
              className={`h-full rounded-full ${report.strengthScore >= 60 ? "bg-emerald-500" : report.strengthScore >= 40 ? "bg-amber-500" : "bg-red-500"}`} />
          </div>
          <span className={`text-sm font-black min-w-max tabular-nums ${report.strengthScore >= 60 ? "text-emerald-500" : report.strengthScore >= 40 ? "text-amber-500" : "text-red-500"}`}>
            {report.strength}
          </span>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={`rounded-2xl border p-5 ${isDark ? "border-amber-500/20 bg-amber-500/[0.06]" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-center gap-2 mb-3">
            <ShieldWarning size={14} weight="fill" className="text-amber-500" />
            <p className={`text-[11.5px] font-black ${isDark ? "text-amber-400" : "text-amber-700"}`}>مخاطر ونقاط ضعف</p>
          </div>
          <ul className="space-y-1.5">
            {report.risks.map((r, i) => (
              <li key={i} className={`flex items-start gap-2 text-[11px] leading-relaxed ${isDark ? "text-amber-300/80" : "text-amber-800/80"}`}>
                <Warning size={11} weight="fill" className="mt-0.5 flex-shrink-0 text-amber-400" />{r}
              </li>
            ))}
          </ul>
        </div>
        <div className={`rounded-2xl border p-5 ${isDark ? "border-emerald-500/20 bg-emerald-500/[0.06]" : "border-emerald-200 bg-emerald-50"}`}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkle size={14} weight="fill" className="text-emerald-500" />
            <p className={`text-[11.5px] font-black ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>فرص وإيجابيات</p>
          </div>
          <ul className="space-y-1.5">
            {report.opportunities.map((o, i) => (
              <li key={i} className={`flex items-start gap-2 text-[11px] leading-relaxed ${isDark ? "text-emerald-300/80" : "text-emerald-800/80"}`}>
                <CheckCircle size={11} weight="fill" className="mt-0.5 flex-shrink-0 text-emerald-500" />{o}
              </li>
            ))}
          </ul>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className={`rounded-2xl border p-5 ${isDark ? "border-[#0B3D2E]/30 bg-[#0B3D2E]/[0.08]" : "border-[#0B3D2E]/15 bg-[#0B3D2E]/[0.04]"}`}>
        <div className="flex items-start gap-3">
          <Info size={15} weight="fill" className="text-[#0B3D2E] flex-shrink-0 mt-0.5" />
          <div>
            <p className={`text-[11.5px] font-black mb-1 ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}>توصية نظامي AI</p>
            <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{report.recommendation}</p>
          </div>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className={`pt-4 border-t ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
        <AiResultActions text={`${report.strength}\n${report.recommendation}\n${report.risks.join("\n")}`}
          filename="legal-analysis" showVault showHumanReview className="justify-start" />
      </motion.div>
      </BetaReviewGate>

      <motion.div variants={fadeUp} className={`${card} p-5`}>
        <p className={`text-[13px] font-black mb-0.5 ${isDark ? "text-white" : "text-zinc-900"}`}>هل تريد رأي محامٍ متخصص؟</p>
        <p className={`text-[11.5px] mb-4 ${ts}`}>محامو نظامي المرخّصون يراجعون وضعك بالتفصيل ويضعون استراتيجية قانونية.</p>
        <div className="flex gap-2 flex-wrap">
          <Link href="/dashboard/client/consultation"
            className="flex items-center gap-2 bg-[#0B3D2E] text-white font-black px-5 py-2.5 rounded-xl text-[12.5px] hover:bg-[#0a3328] transition-colors shadow-[0_4px_14px_rgba(11,61,46,0.22)]">
            <ChatDots size={14} weight="fill" /> احجز استشارة
          </Link>
          <button onClick={reset}
            className={`flex items-center gap-2 font-bold px-5 py-2.5 rounded-xl text-[12.5px] border transition-colors ${isDark ? "border-white/[0.08] text-zinc-400 hover:text-white" : "border-slate-200 text-zinc-500 hover:text-zinc-900"}`}>
            <ArrowCounterClockwise size={13} /> تحليل جديد
          </button>
        </div>
      </motion.div>

      <motion.div variants={fadeUp}>
        <p className={`text-[11px] text-center leading-relaxed ${ts}`}>
          هذا التحليل للاستئناس فقط ولا يُعدّ استشارة قانونية رسمية.
        </p>
      </motion.div>
    </motion.div>
  );

  // ── THINKING (AI generating contextual questions) ──────────────────────────
  if (phase === "thinking") return (
    <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <p className={`text-[12px] font-black mb-4 ${ts}`}>AI يفهم وضعك ويجهّز أسئلة مخصصة...</p>
      <ThinkingSkeleton isDark={isDark} />
    </motion.div>
  );

  // ── LOADING (final analysis) ──────────────────────────────────────────────
  if (phase === "loading") return (
    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <p className={`text-[12px] font-black mb-4 ${ts}`}>AI يحلّل وضعك القانوني ويقيس قوة موقفك...</p>
      <ResultSkeleton isDark={isDark} />
    </motion.div>
  );

  // ── QUESTIONS phase (dynamic, contextual) ────────────────────────────────────
  if (phase === "questions") {
    // Detect which questions should allow file attachment
    const isDocQ = (q: string) => /مستندات|إثباتات|عقد|تقرير|وثيقة|ملف|صور/.test(q);

    return (
      <motion.div key="questions" variants={stagger} initial="hidden" animate="show" className="space-y-5">
        <motion.div variants={fadeUp}>
          <div className="flex items-center gap-2 mb-1">
            <Question size={14} weight="fill" className="text-[#C8A762]" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[#C8A762]">أسئلة مخصصة لوضعك</p>
          </div>
          <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
            بناءً على ما كتبته، نحتاج هذه التفاصيل لتحليل أدق:
          </p>
        </motion.div>

        {dynQuestions.map((item, i) => (
          <motion.div key={i} variants={fadeUp} className="space-y-2">
            <label className={`flex items-start gap-2 text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
              <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5
                ${isDark ? "bg-zinc-800 text-zinc-400" : "bg-slate-100 text-zinc-500"}`}>{i + 1}</span>
              {item.q}
            </label>
            <input
              value={answers[i] ?? ""}
              onChange={e => setAnswers(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
              placeholder={item.placeholder}
              className={`w-full rounded-xl border px-4 py-3 text-[13px] outline-none transition-all
                focus:ring-2 focus:ring-[#0B3D2E]/25 focus:border-[#0B3D2E]/40
                ${isDark ? "border-white/[0.07] bg-zinc-900/60 text-zinc-100 placeholder:text-zinc-700" : "border-slate-200 bg-white text-zinc-900 placeholder:text-zinc-400"}`}
            />
            {/* Inline file upload for evidence-related questions */}
            {isDocQ(item.q) && (
              <label className={`inline-flex items-center gap-2 text-[11px] font-bold px-3 py-1.5 rounded-lg border cursor-pointer transition-all
                ${isDark ? "border-white/[0.07] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.12]" : "border-slate-200 text-zinc-400 hover:text-zinc-600 hover:border-slate-300"}`}>
                <UploadSimple size={12} />
                أرفق ملف
                <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) setAnswers(prev => { const n = [...prev]; n[i] = (n[i] ? n[i] + " + " : "") + `[مرفق: ${f.name}]`; return n; });
                  }}
                />
              </label>
            )}
          </motion.div>
        ))}

        <motion.div variants={fadeUp} className="flex items-center justify-between pt-2">
          <button onClick={() => setPhase("input")}
            className={`text-[12px] font-bold px-4 py-2 rounded-xl border transition-colors ${isDark ? "border-white/[0.07] text-zinc-500 hover:text-zinc-300" : "border-slate-200 text-zinc-400 hover:text-zinc-700"}`}>
            رجوع
          </button>
          <motion.button
            onClick={runAnalysis}
            disabled={!canAnalyze}
            whileTap={canAnalyze ? { scale: 0.97 } : {}}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-black transition-all ${canAnalyze
              ? "bg-[#0B3D2E] text-white shadow-[0_4px_14px_rgba(11,61,46,0.22)] hover:bg-[#0a3328]"
              : isDark ? "bg-zinc-800 text-zinc-600 cursor-not-allowed" : "bg-slate-100 text-zinc-400 cursor-not-allowed"}`}>
            <Sparkle size={14} weight="fill" />
            اعرض التحليل
            <ArrowRight size={13} />
          </motion.button>
        </motion.div>
      </motion.div>
    );
  }

  // ── INPUT phase ───────────────────────────────────────────────────────────────
  return (
    <motion.div key="input" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={sp} className="space-y-4">
      <div className={`${card} overflow-hidden shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]`}>
        <AnimatePresence>
          {fileName && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className={`flex items-center gap-3 px-4 py-2.5 border-b ${isDark ? "border-white/[0.06] bg-[#0B3D2E]/10" : "border-emerald-100 bg-emerald-50/80"}`}>
              <FileText size={14} className="text-emerald-500 flex-shrink-0" />
              <p className={`flex-1 text-[12px] font-bold truncate ${isDark ? "text-emerald-300" : "text-emerald-800"}`}>{fileName}</p>
              <button onClick={clearFile} className={`w-6 h-6 rounded-lg flex items-center justify-center ${isDark ? "hover:bg-white/[0.08]" : "hover:bg-emerald-100"}`}>
                <X size={11} className="text-emerald-600" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={
            "اكتب هنا عن وضعك: ما الذي حدث؟ من هو الطرف الآخر؟ ما الذي تريد تحقيقه؟\n\nكلما كانت التفاصيل أكثر، كان التحليل أدق."
          }
          rows={8}
          className={`w-full px-5 py-4 text-[13.5px] leading-[1.9] resize-none outline-none transition-colors
            ${isDark ? "bg-transparent text-zinc-100 placeholder:text-zinc-700" : "bg-transparent text-zinc-800 placeholder:text-zinc-400"}`}
          dir="rtl"
        />

        <div className={`flex items-center justify-between px-4 py-3 border-t ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <button
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              className={`flex items-center gap-2 text-[12px] font-bold px-3 py-1.5 rounded-xl border transition-all ${
                dragging
                  ? isDark ? "border-[#C8A762]/50 text-[#C8A762]" : "border-[#C8A762] text-[#C8A762]/80"
                  : isDark ? "border-white/[0.07] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.15]" : "border-slate-200 text-zinc-400 hover:text-zinc-600 hover:border-slate-300"
              }`}>
              <UploadSimple size={13} /> رفع مستند
            </button>
            {/* Voice input button */}
            <motion.button
              onClick={toggleRecording}
              whileTap={{ scale: 0.95 }}
              title={isRecording ? "أوقف التسجيل" : "اضغط وتكلم — AI يكتب كلامك"}
              className={`flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-xl border transition-all ${
                isRecording
                  ? "border-red-400/60 bg-red-500/10 text-red-500 animate-pulse"
                  : isDark
                    ? "border-white/[0.07] text-zinc-500 hover:text-emerald-400 hover:border-emerald-700/40"
                    : "border-slate-200 text-zinc-400 hover:text-[#0B3D2E] hover:border-[#0B3D2E]/30"
              }`}
            >
              {isRecording ? <Stop size={13} weight="fill" /> : <Microphone size={13} weight="fill" />}
              {isRecording ? "إيقاف" : "تكلّم"}
            </motion.button>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[11px] tabular-nums ${ts}`}>{text.trim().length} / 10</span>
            <motion.button
              onClick={submit}
              disabled={!canSubmit}
              whileTap={canSubmit ? { scale: 0.97 } : {}}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[13px] font-black transition-all ${
                canSubmit
                  ? "bg-[#0B3D2E] text-white shadow-[0_4px_14px_rgba(11,61,46,0.22)] hover:bg-[#0a3328]"
                  : isDark ? "bg-zinc-800 text-zinc-600 cursor-not-allowed" : "bg-slate-100 text-zinc-400 cursor-not-allowed"}`}>
              <Sparkle size={14} weight="fill" /> حلّل
            </motion.button>
          </div>
        </div>
      </div>

      <motion.div className="flex flex-wrap gap-2" initial="hidden" animate="show" variants={stagger}>
        {["نزاع عمالي مع صاحب العمل", "فسخ عقد إيجار", "مطالبة تجارية", "خلاف عائلي", "تحليل عقد"].map(hint => (
          <motion.button key={hint} variants={fadeUp} onClick={() => setText(hint + " — ")}
            className={`text-[11.5px] font-medium px-3 py-1.5 rounded-full border transition-all ${isDark ? "border-white/[0.06] text-zinc-600 hover:text-zinc-300 hover:border-white/[0.15]" : "border-slate-200 text-zinc-400 hover:text-zinc-600 hover:border-slate-300"}`}>
            {hint}
          </motion.button>
        ))}
      </motion.div>

      <p className={`text-[11px] ${ts}`}>
        يدعم: PDF · Word · صور (JPG/PNG) · أو النص المباشر — AI يكشف الموضوع ويسألك أسئلة مخصصة.
      </p>
    </motion.div>
  );
}
