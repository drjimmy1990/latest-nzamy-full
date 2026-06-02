"use client";

import { useState, useCallback, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadSimple, CloudArrowUp, X, MagnifyingGlass, Scan,
  Gavel, HouseLine, Briefcase, Heart, Car, ShoppingBag,
  ChartBar, Warning, CheckCircle, Minus, Target, Clock,
  ArrowRight, ArrowLeft, CalendarCheck, SealCheck,
  FileText, Plus, PaperclipHorizontal, FileMagnifyingGlass,
  Scales, Brain,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import AiResultActions from "@/components/AiResultActions";

// ─── Types ────────────────────────────────────────────────────────────────────
type InputMode = "landing" | "file" | "manual" | "result";
type Domain = { id: string; icon: React.ElementType; label: string; questions: string[] };

// ─── Legal Domains ────────────────────────────────────────────────────────────
const DOMAINS: Domain[] = [
  {
    id: "labor", icon: Briefcase, label: "نزاع عمالي",
    questions: ["ما طبيعة نزاعك مع صاحب العمل؟", "هل لديك عقد عمل موثق؟", "ما الإجراء الذي قام به صاحب العمل؟"],
  },
  {
    id: "rent", icon: HouseLine, label: "نزاع إيجار",
    questions: ["ما نوع العقار المتنازع عليه؟", "ما المشكلة مع المالك/المستأجر؟", "هل عقد الإيجار مسجّل في إيجار؟"],
  },
  {
    id: "family", icon: Heart, label: "شؤون أسرية",
    questions: ["ما القضية الأسرية التي تواجهها؟", "هل صدر قرار قضائي سابق؟", "هل الأطفال متأثرون؟"],
  },
  {
    id: "traffic", icon: Car, label: "حوادث مرورية",
    questions: ["متى وأين وقع الحادث؟", "هل صدر تقرير مروري رسمي؟", "ما الأضرار التي تطالب بتعويضها؟"],
  },
  {
    id: "consumer", icon: ShoppingBag, label: "حقوق المستهلك",
    questions: ["ما المنتج أو الخدمة المتنازع عليها؟", "هل تواصلت مع البائع لحل المشكلة؟", "ما الضرر الذي تكبدته؟"],
  },
  {
    id: "other", icon: Gavel, label: "أخرى",
    questions: ["اشرح وضعك القانوني باختصار:", "ما النتيجة التي تأمل تحقيقها؟", "هل هناك مستندات ذات صلة؟"],
  },
];

// ─── Mock result generator ────────────────────────────────────────────────────
function buildResult(domain: Domain, context: string) {
  const hasDocs = context.length > 60;
  return {
    score: hasDocs ? 67 : 41,
    verdict: hasDocs ? "موقفك متوسط إلى مقبول — هناك فرص حقيقية مع تعزيز المستندات" : "موقفك يحتاج تعزيز قبل رفع أي مطالبة رسمية",
    strengths: [
      "وضوح طرفي النزاع وموضوعه",
      hasDocs ? "وجود وثائق داعمة تقوي موقفك" : "إمكانية الحصول على وثائق داعمة",
      "وجود سوابق قضائية مشابهة",
    ],
    risks: [
      hasDocs ? "بعض المستندات قد لا تكفي وحدها" : "غياب وثائق داعمة كافية",
      "التأخر في رفع الشكوى قد يسقط الحق",
      "تعدد الأطراف يزيد تعقيد القضية",
    ],
    opportunities: [
      "إمكانية التسوية الودية لتوفير الوقت والتكلفة",
      "قد تكون مؤهلاً لتعويضات إضافية",
      "النظام السعودي يحمي هذا النوع من الحقوق",
    ],
    recommendation: `بناءً على وضعك في "${domain.label}"، يُوصى بالتواصل مع محامٍ متخصص لمراجعة المستندات وتقييم فرص القضية قبل أي خطوة رسمية.`,
  };
}

// ─── ScoreBar — isolated perpetual animation ──────────────────────────────────
const ScoreBar = memo(function ScoreBar({ score, isDark }: { score: number; isDark: boolean }) {
  const color = score >= 65 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";
  const label = score >= 65 ? "متوسط — مقبول" : score >= 40 ? "يحتاج تعزيز" : "ضعيف";
  return (
    <div className="text-center">
      <div className="relative inline-flex items-center justify-center w-28 h-28 mb-3">
        <svg viewBox="0 0 120 120" className="absolute inset-0 w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" strokeWidth="10" className={isDark ? "stroke-zinc-800" : "stroke-slate-100"} />
          <motion.circle
            cx="60" cy="60" r="50" fill="none" strokeWidth="10"
            stroke={color} strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 50}`}
            initial={{ strokeDashoffset: 2 * Math.PI * 50 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 50 * (1 - score / 100) }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
        <div className="relative text-center">
          <span className="block text-2xl font-black tabular-nums" style={{ color }}>{score}</span>
          <span className={`text-[9px] font-semibold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>/100</span>
        </div>
      </div>
      <p className="text-[12px] font-black" style={{ color }}>{label}</p>
    </div>
  );
});

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SmartInspectorPage() {
  const { isDark } = useTheme();

  const [mode, setMode]               = useState<InputMode>("landing");
  const [domain, setDomain]           = useState<Domain | null>(null);
  const [answers, setAnswers]         = useState<string[]>([]);
  const [currentQ, setCurrentQ]       = useState(0);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [analyzing, setAnalyzing]     = useState(false);
  const [result, setResult]           = useState<ReturnType<typeof buildResult> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const s = (dark: string, light: string) => isDark ? dark : light;
  const card = `rounded-2xl border ${s("bg-zinc-900 border-white/[0.07]", "bg-white border-slate-200/80 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.04)]")}`;

  const analyze = useCallback(async (context: string) => {
    if (!domain) return;
    setAnalyzing(true);
    await new Promise(r => setTimeout(r, 2200));
    setResult(buildResult(domain, context));
    setMode("result");
    setAnalyzing(false);
  }, [domain]);

  const reset = useCallback(() => {
    setMode("landing"); setDomain(null); setAnswers([]);
    setCurrentQ(0); setUploadedFile(null); setResult(null);
  }, []);

  // ── Landing ────────────────────────────────────────────────────────────────
  if (mode === "landing") {
    return (
      <div className={`p-5 md:p-8 max-w-5xl mx-auto space-y-6 ${s("text-zinc-100", "text-zinc-900")}`} dir="rtl">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className={`text-2xl font-black tracking-tight ${s("text-white", "text-zinc-900")}`}>الفاحص الذكي</h1>
            <span className="px-2.5 py-0.5 text-[10px] font-black rounded-full bg-[#C8A762]/15 border border-[#C8A762]/30 text-[#C8A762]">AI</span>
          </div>
          <p className={`text-[13.5px] leading-relaxed ${s("text-zinc-400", "text-slate-500")}`}>
            ارفع ملف قضيتك أو أدخل معطياتها يدوياً — وسنعطيك تقييماً فورياً لموقفك القانوني
          </p>
        </div>

        {/* Two paths */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* PDF path */}
          <motion.button
            whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }}
            onClick={() => setMode("file")}
            className={`${card} p-7 text-right w-full group transition-all hover:border-[#0B3D2E]/30`}
          >
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl mb-5 ${s("bg-[#0B3D2E]/40", "bg-[#0B3D2E]/8")} group-hover:bg-[#0B3D2E]/15 transition-colors`}>
              <CloudArrowUp size={24} className="text-[#0B3D2E]" weight="duotone" />
            </div>
            <h3 className={`text-[16px] font-black mb-1.5 ${s("text-white", "text-zinc-900")}`}>ارفع ملف القضية</h3>
            <p className={`text-[12.5px] leading-relaxed ${s("text-zinc-500", "text-slate-400")}`}>
              PDF أو Word — الذكاء الاصطناعي يقرأ الملف ويحلل وضعك القانوني تلقائياً
            </p>
            <div className={`mt-5 flex items-center gap-1.5 text-[11px] font-bold text-[#0B3D2E]`}>
              ارفع الملف <ArrowLeft size={12} />
            </div>
          </motion.button>

          {/* Manual path */}
          <motion.button
            whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }}
            onClick={() => setMode("manual")}
            className={`${card} p-7 text-right w-full group transition-all hover:border-[#C8A762]/30`}
          >
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl mb-5 ${s("bg-[#C8A762]/15", "bg-amber-50")} group-hover:bg-amber-100/60 transition-colors`}>
              <FileMagnifyingGlass size={24} className="text-[#C8A762]" weight="duotone" />
            </div>
            <h3 className={`text-[16px] font-black mb-1.5 ${s("text-white", "text-zinc-900")}`}>أدخل معطيات القضية</h3>
            <p className={`text-[12.5px] leading-relaxed ${s("text-zinc-500", "text-slate-400")}`}>
              أجب على ٣ أسئلة موجّهة بحسب نوع قضيتك وسيقيّم AI موقفك فوراً
            </p>
            <div className={`mt-5 flex items-center gap-1.5 text-[11px] font-bold text-[#C8A762]`}>
              ابدأ الآن <ArrowLeft size={12} />
            </div>
          </motion.button>
        </div>

        {/* Disclaimer */}
        <p className={`text-[11px] text-center leading-relaxed ${s("text-zinc-700", "text-slate-400")}`}>
          هذا التقرير للمساعدة فقط ولا يُعدّ استشارة قانونية رسمية — يُنصح بمراجعة محامٍ مرخص للقرارات النهائية
        </p>
      </div>
    );
  }

  // ── File Upload path ───────────────────────────────────────────────────────
  if (mode === "file") {
    return (
      <div className={`p-5 md:p-8 max-w-2xl mx-auto space-y-5 ${s("text-zinc-100", "text-zinc-900")}`} dir="rtl">
        <button onClick={reset} className={`flex items-center gap-1.5 text-[12px] font-semibold mb-2 ${s("text-zinc-500 hover:text-zinc-300", "text-slate-400 hover:text-slate-600")} transition-colors`}>
          <ArrowRight size={13} /> العودة
        </button>

        <div>
          <h2 className={`text-xl font-black mb-1 ${s("text-white", "text-zinc-900")}`}>ارفع ملف القضية</h2>
          <p className={`text-[12.5px] ${s("text-zinc-500", "text-slate-400")}`}>PDF · Word · صور — الذكاء الاصطناعي يستخرج المعطيات تلقائياً</p>
        </div>

        {/* Drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          className={`rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
            uploadedFile
              ? s("border-emerald-700/40 bg-emerald-900/10", "border-emerald-300 bg-emerald-50")
              : s("border-white/[0.08] hover:border-[#0B3D2E]/40", "border-slate-200 hover:border-[#0B3D2E]/30")
          }`}
        >
          <input
            ref={fileRef} type="file" className="hidden"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            onChange={e => { const f = e.target.files?.[0]; if (f) setUploadedFile(f.name); }}
          />
          {uploadedFile ? (
            <div className="flex items-center justify-center gap-3">
              <FileText size={22} className="text-emerald-500" />
              <span className={`text-[13px] font-bold truncate max-w-[260px] ${s("text-emerald-300", "text-emerald-700")}`}>{uploadedFile}</span>
              <button onClick={e => { e.stopPropagation(); setUploadedFile(null); }}>
                <X size={14} className="text-emerald-500 hover:text-emerald-600" />
              </button>
            </div>
          ) : (
            <>
              <CloudArrowUp size={28} className={`mx-auto mb-3 ${s("text-zinc-600", "text-slate-300")}`} weight="thin" />
              <p className={`text-[13px] font-semibold mb-1 ${s("text-zinc-300", "text-zinc-600")}`}>اسحب الملف هنا أو اضغط للاختيار</p>
              <p className={`text-[11px] ${s("text-zinc-600", "text-slate-400")}`}>PDF · Word · صور</p>
            </>
          )}
        </div>

        {/* Domain selection when file is uploaded */}
        <AnimatePresence>
          {uploadedFile && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className={`text-[12px] font-bold mb-3 ${s("text-zinc-300", "text-zinc-700")}`}>اختر نوع القضية لتحليل أدق:</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {DOMAINS.map(d => {
                  const Icon = d.icon;
                  return (
                    <button key={d.id} onClick={() => setDomain(d)}
                      className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-[12px] font-semibold text-right transition-all ${
                        domain?.id === d.id
                          ? s("border-[#0B3D2E]/50 bg-[#0B3D2E]/15 text-emerald-300", "border-[#0B3D2E]/30 bg-[#0B3D2E]/5 text-[#0B3D2E]")
                          : s("border-white/[0.07] text-zinc-400 hover:border-white/15", "border-slate-200 text-slate-500 hover:border-slate-300 bg-white")
                      }`}>
                      <Icon size={14} weight={domain?.id === d.id ? "fill" : "regular"} />
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={!uploadedFile || analyzing}
          onClick={() => analyze(uploadedFile ?? "")}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#0B3D2E] text-white text-[13px] font-black shadow-[0_4px_14px_0_rgba(11,61,46,0.28)] disabled:opacity-40 transition-all hover:bg-[#0a3328] active:scale-[0.98]"
        >
          {analyzing ? (
            <>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                <Brain size={16} />
              </motion.div>
              جارٍ التحليل…
            </>
          ) : (
            <>
              <MagnifyingGlass size={16} />
              حلّل الملف
            </>
          )}
        </motion.button>
      </div>
    );
  }

  // ── Manual Q&A path ────────────────────────────────────────────────────────
  if (mode === "manual") {
    // Step 1: select domain
    if (!domain) {
      return (
        <div className={`p-5 md:p-8 max-w-2xl mx-auto space-y-5 ${s("text-zinc-100", "text-zinc-900")}`} dir="rtl">
          <button onClick={reset} className={`flex items-center gap-1.5 text-[12px] font-semibold mb-1 ${s("text-zinc-500 hover:text-zinc-300", "text-slate-400 hover:text-slate-600")} transition-colors`}>
            <ArrowRight size={13} /> العودة
          </button>
          <div>
            <h2 className={`text-xl font-black mb-1 ${s("text-white", "text-zinc-900")}`}>ما نوع قضيتك؟</h2>
            <p className={`text-[12.5px] ${s("text-zinc-500", "text-slate-400")}`}>اختر التصنيف الأنسب لوضعك</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {DOMAINS.map((d) => {
              const Icon = d.icon;
              return (
                <motion.button key={d.id} whileHover={{ y: -3 }} whileTap={{ scale: 0.96 }}
                  onClick={() => { setDomain(d); setAnswers([]); setCurrentQ(0); }}
                  className={`${card} p-4 flex flex-col items-start gap-3 text-right transition-all hover:border-[#0B3D2E]/30`}>
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${s("bg-[#0B3D2E]/30", "bg-[#0B3D2E]/6")}`}>
                    <Icon size={18} className="text-[#0B3D2E]" weight="duotone" />
                  </div>
                  <p className={`text-[13px] font-black ${s("text-zinc-200", "text-zinc-800")}`}>{d.label}</p>
                </motion.button>
              );
            })}
          </div>
        </div>
      );
    }

    // Step 2: Q&A
    const q = domain.questions[currentQ];
    const isLast = currentQ === domain.questions.length - 1;
    const currentAnswer = answers[currentQ] ?? "";

    const handleNext = () => {
      if (!currentAnswer.trim()) return;
      if (isLast) {
        analyze(answers.join(" | "));
      } else {
        setCurrentQ(q => q + 1);
      }
    };

    return (
      <div className={`p-5 md:p-8 max-w-2xl mx-auto space-y-5 ${s("text-zinc-100", "text-zinc-900")}`} dir="rtl">
        <button onClick={() => { setDomain(null); setAnswers([]); setCurrentQ(0); }}
          className={`flex items-center gap-1.5 text-[12px] font-semibold mb-1 ${s("text-zinc-500 hover:text-zinc-300", "text-slate-400 hover:text-slate-600")} transition-colors`}>
          <ArrowRight size={13} /> تغيير نوع القضية
        </button>

        {/* Domain badge */}
        <div className="flex items-center gap-2">
          {(() => { const Icon = domain.icon; return <Icon size={14} className="text-[#C8A762]" />; })()}
          <span className={`text-[12px] font-bold ${s("text-zinc-400", "text-slate-500")}`}>{domain.label}</span>
          <span className={`ms-auto text-[11px] tabular-nums font-mono ${s("text-zinc-600", "text-slate-400")}`}>
            {currentQ + 1} / {domain.questions.length}
          </span>
        </div>

        {/* Progress */}
        <div className={`h-1 rounded-full overflow-hidden ${s("bg-zinc-800", "bg-slate-100")}`}>
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[#0B3D2E] to-[#C8A762]"
            animate={{ width: `${((currentQ + 1) / domain.questions.length) * 100}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={currentQ}
            initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}
            transition={{ type: "spring", stiffness: 200, damping: 26 }}
            className="space-y-4"
          >
            <p className={`text-[15px] font-black leading-snug ${s("text-white", "text-zinc-900")}`}>{q}</p>
            <textarea
              value={currentAnswer}
              onChange={e => {
                const updated = [...answers];
                updated[currentQ] = e.target.value;
                setAnswers(updated);
              }}
              placeholder="اكتب إجابتك هنا…"
              rows={4}
              className={`w-full resize-none rounded-2xl border p-4 text-[13px] outline-none leading-relaxed transition-all ${
                s("border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600 focus:border-[#0B3D2E]/40",
                  "border-slate-200 bg-white text-zinc-800 placeholder:text-slate-400 focus:border-[#0B3D2E]/40 focus:ring-2 focus:ring-[#0B3D2E]/8")
              }`}
            />
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between">
          <button
            disabled={currentQ === 0} onClick={() => setCurrentQ(q => q - 1)}
            className={`flex items-center gap-1.5 text-[12px] font-semibold px-4 py-2.5 rounded-xl border transition-all disabled:opacity-30 ${s("border-white/[0.08] text-zinc-400 hover:border-white/15", "border-slate-200 text-slate-500 hover:border-slate-300 bg-white")}`}
          >
            <ArrowRight size={13} /> السابق
          </button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            disabled={!currentAnswer.trim() || analyzing}
            onClick={handleNext}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#0B3D2E] text-white text-[13px] font-black disabled:opacity-40 shadow-[0_4px_12px_0_rgba(11,61,46,0.25)] hover:bg-[#0a3328] transition-all"
          >
            {analyzing ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                  <Brain size={14} />
                </motion.div>
                جارٍ التحليل…
              </>
            ) : isLast ? (
              <><MagnifyingGlass size={14} /> قيّم موقفي</>
            ) : (
              <>التالي <ArrowLeft size={13} /></>
            )}
          </motion.button>
        </div>
      </div>
    );
  }

  // ── Result ────────────────────────────────────────────────────────────────
  if (!result) return null;

  return (
    <div className={`p-5 md:p-8 max-w-3xl mx-auto space-y-5 ${s("text-zinc-100", "text-zinc-900")}`} dir="rtl">
      {/* Result header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className={`text-xl font-black mb-0.5 ${s("text-white", "text-zinc-900")}`}>تقرير الفاحص الذكي</h2>
          <p className={`text-[12px] ${s("text-zinc-500", "text-slate-400")}`}>{domain?.label ?? "تقييم القضية"}</p>
        </div>
        <motion.button whileTap={{ scale: 0.96 }} onClick={reset}
          className={`flex items-center gap-1.5 text-[11.5px] font-semibold px-3 py-2 rounded-xl border transition-all ${s("border-white/[0.08] text-zinc-400 hover:border-white/15", "border-slate-200 text-slate-500 hover:border-slate-300 bg-white")}`}>
          <ArrowRight size={12} /> تقييم جديد
        </motion.button>
      </div>

      {/* Score + verdict */}
      <div className={`${card} p-6 flex flex-col sm:flex-row items-center gap-6`}>
        <ScoreBar score={result.score} isDark={isDark} />
        <div className="flex-1 text-right sm:text-right">
          <p className={`text-[10.5px] font-black uppercase tracking-widest mb-2 ${s("text-zinc-600", "text-slate-400")}`}>الحكم الأولي</p>
          <p className={`text-[14.5px] font-bold leading-relaxed ${s("text-zinc-200", "text-zinc-700")}`}>{result.verdict}</p>
          <div className={`mt-3 flex items-center gap-1.5 text-[11px] ${s("text-zinc-600", "text-slate-400")}`}>
            <SealCheck size={12} className="text-[#C8A762]" />
            <span>تقييم AI — ليس استشارة قانونية رسمية</span>
          </div>
        </div>
      </div>

      {/* Strengths / Risks / Opportunities */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { key: "strengths",    label: "نقاط القوة",    items: result.strengths,    icon: CheckCircle, color: "text-emerald-500", bg: s("border-emerald-800/30 bg-emerald-900/10", "border-emerald-200 bg-emerald-50") },
          { key: "risks",        label: "مواطن الضعف",   items: result.risks,        icon: Warning,     color: "text-rose-500",    bg: s("border-red-800/30 bg-red-900/10", "border-red-100 bg-red-50") },
          { key: "opportunities",label: "الفرص المتاحة", items: result.opportunities, icon: Target,      color: "text-[#C8A762]",  bg: s("border-[#C8A762]/20 bg-[#C8A762]/5", "border-amber-200 bg-amber-50") },
        ].map(({ key, label, items, icon: Icon, color, bg }) => (
          <motion.div key={key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.1 }}
            className={`rounded-2xl border p-4 ${bg}`}
          >
            <div className="flex items-center gap-2 mb-3">
              <Icon size={15} className={color} weight="fill" />
              <h3 className={`text-[12.5px] font-black ${s("text-zinc-200", "text-zinc-800")}`}>{label}</h3>
            </div>
            <ul className="space-y-2">
              {items.map((item, i) => (
                <li key={i} className={`flex items-start gap-2 text-[12px] leading-relaxed ${s("text-zinc-400", "text-zinc-600")}`}>
                  <Minus size={9} className={`flex-shrink-0 mt-1.5 ${color}`} />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>

      {/* Recommendation */}
      <div className={`${card} p-5`}>
        <div className="flex items-center gap-2 mb-2">
          <Brain size={16} className="text-[#0B3D2E]" weight="duotone" />
          <p className={`text-[12.5px] font-black ${s("text-zinc-200", "text-zinc-800")}`}>توصية نظامي AI</p>
        </div>
        <p className={`text-[13px] leading-relaxed ${s("text-zinc-400", "text-zinc-600")}`}>{result.recommendation}</p>
      </div>

      <AiResultActions
        text={[
          `تقرير الفاحص الذكي — ${domain?.label ?? ""}`,
          `الدرجة: ${result.score}/100`,
          `الحكم: ${result.verdict}`,
          ``,
          `نقاط القوة:\n${result.strengths.map(s => `• ${s}`).join("\n")}`,
          ``,
          `مواطن الضعف:\n${result.risks.map(r => `• ${r}`).join("\n")}`,
          ``,
          `الفرص المتاحة:\n${result.opportunities.map(o => `• ${o}`).join("\n")}`,
          ``,
          `التوصية: ${result.recommendation}`,
        ].join("\n")}
        filename={`smart-inspector-${domain?.id ?? "report"}`}
        showVault
        showHumanReview
        className="justify-start"
      />

      {/* CTA — book lawyer */}
      <div className={`${card} p-5`}>
        <p className={`text-[13px] font-black mb-1 ${s("text-zinc-200", "text-zinc-800")}`}>هل تريد تقييماً أشمل من محامٍ متخصص؟</p>
        <p className={`text-[11.5px] mb-4 ${s("text-zinc-500", "text-slate-400")}`}>محامون مرخصون يراجعون وضعك بالتفصيل ويضعون استراتيجية قانونية كاملة</p>
        <div className="flex gap-3 flex-wrap">
          <Link href="/dashboard/client/find-lawyer"
            className="flex-1 min-w-[160px] flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#0B3D2E] text-white text-[12.5px] font-black shadow-[0_4px_12px_0_rgba(11,61,46,0.25)] hover:bg-[#0a3328] transition-all active:scale-[0.98]">
            <CalendarCheck size={14} weight="fill" /> احجز استشارة مع محامٍ
          </Link>
          <motion.button whileTap={{ scale: 0.97 }} onClick={reset}
            className={`flex-1 min-w-[100px] flex items-center justify-center gap-1.5 py-3 rounded-2xl border text-[12.5px] font-semibold transition-all ${s("border-white/[0.08] text-zinc-400 hover:border-white/15", "border-slate-200 text-slate-500 hover:border-slate-300 bg-white")}`}>
            تقييم أخرى
          </motion.button>
        </div>
        <p className={`text-[10.5px] mt-4 leading-relaxed text-center ${s("text-zinc-700", "text-slate-400")}`}>
          هذا التقرير للمساعدة فقط ولا يُعدّ استشارة قانونية رسمية
        </p>
      </div>
    </div>
  );
}
