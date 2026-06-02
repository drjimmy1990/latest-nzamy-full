"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChatCircleDots, ArrowRight, MagnifyingGlass,
  Sparkle, BookOpen, ArrowSquareOut, CheckCircle,
  Clock, Warning, Globe, Database, Lightning,
  CaretDown, Gavel, Scroll, Detective, Buildings,
  Users, ArrowLeft, PaperPlaneTilt,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import Link from "next/link";
import BetaReviewGate from "@/components/BetaReviewGate";

// ─── Types ────────────────────────────────────────────────────────────────────

type SearchMode = "fast" | "deep";
type WizardStep = "mode" | "query" | "result";

// ─── Constants ────────────────────────────────────────────────────────────────

const MODES: {
  key: SearchMode;
  icon: React.ElementType;
  label: string;
  badge?: string;
  tagline: string;
  sources: { icon: React.ElementType; label: string; color: string }[];
  time: string;
  color: string;
}[] = [
  {
    key: "fast",
    icon: Lightning,
    label: "بحث نظامي",
    tagline: "إجابة مباشرة من قاعدة بيانات نظامي",
    time: "~٢ ث",
    color: "#0B3D2E",
    sources: [
      { icon: Database,  label: "قاعدة نظامي الداخلية",        color: "#10b981" },
      { icon: Scroll,    label: "الأنظمة واللوائح السعودية",   color: "#10b981" },
      { icon: Gavel,     label: "المراسيم الملكية المُدرجة",   color: "#10b981" },
    ],
  },
  {
    key: "deep",
    icon: Globe,
    label: "بحث شامل",
    badge: "أدق",
    tagline: "نظامي + الإنترنت + ٣ نماذج AI",
    time: "~١٢ ث",
    color: "#2563eb",
    sources: [
      { icon: Database,  label: "قاعدة نظامي الداخلية",                color: "#10b981" },
      { icon: Buildings, label: "المواقع الحكومية (وزارات، هيئات)",    color: "#3b82f6" },
      { icon: Users,     label: "مواقع محامين ومستشارين",              color: "#8b5cf6" },
      { icon: Sparkle,   label: "٣ نماذج AI (GPT-4 · Gemini · Claude)", color: "#C8A762" },
    ],
  },
];

const EXAMPLE_QUESTIONS = [
  "ما ميعاد الاستئناف في المنازعات التجارية؟",
  "هل يجوز الطعن بالنقض في أحكام محاكم الاستئناف؟",
  "ما شروط قبول دعوى إلزام بالأداء أمام المحكمة التجارية؟",
  "ما حد الغرامة في مخالفات نظام العمل؟",
  "ما مدة سقوط حق الموظف في المطالبة بحقوقه العمالية؟",
];

// ─── Mock result ──────────────────────────────────────────────────────────────

const MOCK_RESULT = {
  summary: "ميعاد تقديم لائحة الاستئناف ثلاثون (٣٠) يوماً من تاريخ صدور الحكم الابتدائي أو إعلانه إذا صدر غيابياً.",
  caution: "تأكّد دائماً من الميعاد الفعلي للحكم قبل الاعتماد على هذا الرقم.",
  sources: [
    {
      label: "نظام المرافعات الشرعية — م. ١٧٩",
      type: "نظام",
      color: "#10b981",
      icon: Scroll,
      excerpt: "يُقدَّم الاستئناف خلال ثلاثين يوماً من تاريخ صدور الحكم…",
      isMain: true,
    },
    {
      label: "لائحة المحاكم التجارية — م. ٤٢",
      type: "لائحة",
      color: "#3b82f6",
      icon: Gavel,
      excerpt: "يسري ميعاد الطعن بالاستئناف على النحو المقرر في نظام المرافعات…",
      isMain: false,
    },
    {
      label: "مبدأ قضائي — الدائرة التجارية بالرياض ١٤٤٣",
      type: "مبدأ",
      color: "#8b5cf6",
      icon: Detective,
      excerpt: "درجت المحكمة على احتساب الميعاد من اليوم التالي لصدور الحكم…",
      isMain: false,
    },
  ],
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QuickAnswerPage() {
  const { isDark } = useTheme();

  const [step,       setStep]       = useState<WizardStep>("mode");
  const [mode,       setMode]       = useState<SearchMode>("fast");
  const [query,      setQuery]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<typeof MOCK_RESULT | null>(null);
  const [openSource, setOpenSource] = useState<number | null>(0);

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl shadow-sm";

  const selectedMode = MODES.find(m => m.key === mode)!;

  async function ask(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setResult(null);
    setStep("result");
    await new Promise(r => setTimeout(r, mode === "deep" ? 2800 : 1600));
    setResult(MOCK_RESULT);
    setLoading(false);
    setOpenSource(0);
  }

  function reset() {
    setStep("mode");
    setQuery("");
    setResult(null);
    setLoading(false);
  }

  // Step labels for breadcrumb
  const STEPS: { id: WizardStep; label: string }[] = [
    { id: "mode",   label: "النطاق" },
    { id: "query",  label: "السؤال" },
    { id: "result", label: "النتيجة" },
  ];

  const stepIdx = STEPS.findIndex(s => s.id === step);

  return (
    <div
      className={`max-w-2xl mx-auto p-5 md:p-8 space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`}
      dir="rtl"
    >
      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <ChatCircleDots size={18} weight="duotone" className="text-blue-500" />
          </div>
          <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
            المجيب القانوني السريع
          </h1>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
            Field Intel
          </span>
        </div>
        <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          سؤال محدد ← إجابة مباشرة مستندة للنظام السعودي
        </p>
      </div>

      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <button
              onClick={() => { if (i < stepIdx) setStep(s.id); }}
              className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full transition-all ${
                s.id === step
                  ? "bg-blue-500 text-white"
                  : i < stepIdx
                  ? isDark ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-500 hover:text-zinc-700"
                  : isDark ? "text-zinc-700" : "text-zinc-300"
              }`}
            >
              <span className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-mono font-black ${
                s.id === step ? "bg-white/20" : ""
              }`}>{i + 1}</span>
              {s.label}
            </button>
            {i < STEPS.length - 1 && (
              <ArrowLeft size={10} className={isDark ? "text-zinc-700" : "text-zinc-300"} />
            )}
          </div>
        ))}
      </div>

      {/* ════════════════════════════════════════
          STEP 1 — Select Mode
      ════════════════════════════════════════ */}
      <AnimatePresence mode="wait">
        {step === "mode" && (
          <motion.div key="step-mode" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-3">
            <p className={`text-[11px] font-black uppercase tracking-widest px-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
              اختر نطاق البحث
            </p>

            {MODES.map(m => {
              const Icon = m.icon;
              const isActive = mode === m.key;
              return (
                <motion.button
                  key={m.key}
                  whileHover={{ scale: 1.005 }}
                  whileTap={{ scale: 0.995 }}
                  onClick={() => setMode(m.key)}
                  className={`w-full text-right p-4 rounded-2xl border transition-all ${
                    isActive
                      ? isDark ? "border-blue-500/40 bg-blue-500/[0.07]" : "border-blue-500/30 bg-blue-50"
                      : isDark ? "border-white/[0.06] bg-white/[0.01] hover:border-white/[0.10]" : "border-zinc-200 bg-white hover:border-zinc-300"
                  }`}
                >
                  {/* Top row */}
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                      isActive ? "" : isDark ? "bg-white/[0.05]" : "bg-zinc-100"
                    }`} style={isActive ? { backgroundColor: m.color + "22" } : {}}>
                      <Icon size={18} weight={isActive ? "fill" : "regular"} style={{ color: isActive ? m.color : undefined }}
                        className={!isActive ? isDark ? "text-zinc-500" : "text-zinc-400" : ""} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[15px] font-black ${isActive ? "" : isDark ? "text-zinc-200" : "text-zinc-800"}`}
                          style={isActive ? { color: m.color } : {}}>{m.label}</span>
                        {m.badge && (
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                            isActive ? "bg-blue-500 text-white" : isDark ? "bg-white/[0.07] text-zinc-500" : "bg-zinc-200 text-zinc-500"
                          }`}>{m.badge}</span>
                        )}
                        <span className={`text-[10px] font-mono mr-auto ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{m.time}</span>
                      </div>
                      <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{m.tagline}</p>
                    </div>
                    {isActive && <CheckCircle size={16} weight="fill" className="text-blue-500 flex-shrink-0 mt-1" />}
                  </div>

                  {/* Sources list */}
                  <div className="mt-3 pr-12 space-y-1.5">
                    {m.sources.map((src, si) => {
                      const SIcon = src.icon;
                      return (
                        <div key={si} className="flex items-center gap-2">
                          <SIcon size={11} style={{ color: src.color }} weight="duotone" />
                          <span className={`text-[11px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{src.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </motion.button>
              );
            })}

            <motion.button
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              onClick={() => setStep("query")}
              className="w-full py-3 rounded-2xl font-bold text-[14px] flex items-center justify-center gap-2"
              style={{ backgroundColor: selectedMode.color, color: mode === "fast" ? "#C8A762" : "white" }}
            >
              متابعة — {selectedMode.label}
              <ArrowLeft size={14} />
            </motion.button>
          </motion.div>
        )}

        {/* ════════════════════════════════════════
            STEP 2 — Query Input
        ════════════════════════════════════════ */}
        {step === "query" && (
          <motion.div key="step-query" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">

            {/* Mode pill */}
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold ${
                isDark ? "border-white/[0.07] text-zinc-400" : "border-zinc-200 text-zinc-500"
              }`}>
                {mode === "fast" ? <Lightning size={11} style={{ color: "#0B3D2E" }} /> : <Globe size={11} className="text-blue-500" />}
                {selectedMode.label}
                <button onClick={() => setStep("mode")} className="mr-1 opacity-60 hover:opacity-100">
                  <ArrowRight size={10} />
                </button>
              </div>
            </div>

            {/* Input area */}
            <div className={`${card} p-4 space-y-3`}>
              <textarea
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(query); } }}
                placeholder="اكتب سؤالك القانوني المحدد هنا..."
                rows={4}
                className={`w-full bg-transparent text-[14px] outline-none resize-none ${isDark ? "text-zinc-200 placeholder:text-zinc-600" : "text-zinc-800 placeholder:text-zinc-400"}`}
              />
              <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: isDark ? "rgba(255,255,255,0.05)" : "#f1f5f9" }}>
                <span className={`text-[10px] ${isDark ? "text-zinc-700" : "text-zinc-300"}`}>Enter للإرسال · Shift+Enter لسطر جديد</span>
                <motion.button
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                  onClick={() => ask(query)}
                  disabled={!query.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold disabled:opacity-40"
                  style={{ backgroundColor: selectedMode.color, color: mode === "fast" ? "#C8A762" : "white" }}
                >
                  <PaperPlaneTilt size={13} weight="fill" />
                  اسأل
                </motion.button>
              </div>
            </div>

            {/* Example questions */}
            <div>
              <p className={`text-[11px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                أسئلة شائعة
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_QUESTIONS.map(q => (
                  <button key={q} onClick={() => { setQuery(q); ask(q); }}
                    className={`text-[11px] px-3 py-1.5 rounded-full border transition-all ${
                      isDark ? "border-white/[0.07] text-zinc-500 hover:text-blue-400 hover:border-blue-500/30"
                             : "border-zinc-200 text-zinc-500 hover:text-blue-600 hover:border-blue-400/40"
                    }`}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ════════════════════════════════════════
            STEP 3 — Result
        ════════════════════════════════════════ */}
        {step === "result" && (
          <motion.div key="step-result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">

            {/* Query recap */}
            <div className={`${card} px-4 py-3 flex items-start gap-3`}>
              <MagnifyingGlass size={14} className={isDark ? "text-zinc-600 mt-0.5" : "text-zinc-400 mt-0.5"} />
              <p className={`text-[13px] flex-1 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{query}</p>
              <button onClick={reset} className={`text-[10px] font-bold flex items-center gap-1 ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-zinc-400 hover:text-zinc-600"}`}>
                <ArrowRight size={10} /> تعديل
              </button>
            </div>

            {/* Loading state */}
            <AnimatePresence>
              {loading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className={`${card} p-6`}>
                  <div className="flex items-center gap-3 mb-4">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}>
                      {mode === "deep"
                        ? <Globe size={22} weight="duotone" className="text-blue-500" />
                        : <Sparkle size={22} weight="fill" style={{ color: "#0B3D2E" }} />
                      }
                    </motion.div>
                    <div>
                      <p className={`text-[14px] font-bold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                        {mode === "deep" ? "يبحث في نظامي والإنترنت..." : "يبحث في الأنظمة السعودية..."}
                      </p>
                      {mode === "deep" && (
                        <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                          مراجعة المواقع الحكومية ومصادر متعددة
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Animated progress dots */}
                  <div className="flex gap-1.5 pr-9">
                    {selectedMode.sources.map((src, i) => {
                      const SIcon = src.icon;
                      return (
                        <motion.div key={i}
                          initial={{ opacity: 0.2 }} animate={{ opacity: [0.2, 1, 0.2] }}
                          transition={{ duration: 1.5, delay: i * 0.3, repeat: Infinity }}
                          className="flex items-center gap-1">
                          <SIcon size={10} style={{ color: src.color }} />
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Result card */}
            <AnimatePresence>
              {result && !loading && (
                <BetaReviewGate toolId="quick-answer.result" toolName="الإجابة القانونية السريعة" reviewScope="legal-data">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">

                  {/* Summary */}
                  <div className={`${card} p-5 space-y-4`}>
                    <div className="flex items-start gap-2.5">
                      <CheckCircle size={16} weight="fill" className="text-emerald-500 flex-shrink-0 mt-0.5" />
                      <p className={`text-[14px] leading-relaxed ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                        {result.summary}
                      </p>
                    </div>

                    {result.caution && (
                      <div className={`flex gap-2 p-3 rounded-xl border ${isDark ? "border-amber-900/30 bg-amber-900/[0.08]" : "border-amber-100 bg-amber-50"}`}>
                        <Warning size={13} weight="fill" className="text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className={`text-[11px] ${isDark ? "text-amber-300" : "text-amber-700"}`}>{result.caution}</p>
                      </div>
                    )}

                    <div className={`pt-3 border-t ${isDark ? "border-white/[0.05]" : "border-zinc-100"}`}>
                      <AiResultActions
                        text={result.summary}
                        filename="quick-answer"
                        showVault
                        showHumanReview
                        className="justify-start"
                      />
                    </div>
                  </div>

                  {/* Sources accordion */}
                  <div>
                    <p className={`text-[11px] font-black uppercase tracking-widest mb-2 px-1 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                      المصادر ({result.sources.length})
                    </p>
                    <div className="space-y-2">
                      {result.sources.map((src, i) => {
                        const SIcon = src.icon;
                        const isOpen = openSource === i;
                        return (
                          <div key={i} className={`${card} overflow-hidden`}>
                            <button
                              onClick={() => setOpenSource(isOpen ? null : i)}
                              className="w-full flex items-center gap-3 p-4 text-right"
                            >
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: src.color + "18" }}>
                                <SIcon size={13} weight="duotone" style={{ color: src.color }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-[12px] font-bold truncate ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                                  {src.label}
                                </p>
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                  style={{ backgroundColor: src.color + "18", color: src.color }}>
                                  {src.type}
                                </span>
                                {src.isMain && (
                                  <span className={`text-[9px] font-bold mr-1 px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-500" : "bg-zinc-100 text-zinc-500"}`}>
                                    رئيسي
                                  </span>
                                )}
                              </div>
                              <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                                <CaretDown size={12} className={isDark ? "text-zinc-600" : "text-zinc-400"} />
                              </motion.div>
                            </button>

                            <AnimatePresence>
                              {isOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  <div className={`px-4 pb-4 border-t ${isDark ? "border-white/[0.04]" : "border-zinc-100"}`}>
                                    <p className={`text-[12px] leading-relaxed pt-3 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                                      {src.excerpt}
                                    </p>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Follow-up actions */}
                  <div className={`${card} p-4`}>
                    <p className={`text-[11px] font-black uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                      هل تحتاج تعمّقاً أكثر؟
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { href: "/ai/legal-opinion", label: "الرأي الفصل", color: "purple" },
                        { href: "/ai/case-brief",    label: "إحاطة القضية", color: "gold" },
                        { href: "/ai/wargaming",     label: "محاكاة الموقف", color: "emerald" },
                      ].map(item => (
                        <Link key={item.href} href={item.href}
                          className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl border transition-all ${
                            isDark ? "border-white/[0.07] text-zinc-400 hover:border-white/[0.15] hover:text-zinc-200"
                                   : "border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:text-zinc-800"
                          }`}>
                          {item.label} <ArrowLeft size={10} />
                        </Link>
                      ))}
                    </div>
                  </div>

                  <button onClick={reset}
                    className={`w-full py-3 rounded-2xl border text-[13px] font-medium transition-colors ${
                      isDark ? "border-white/[0.07] text-zinc-400 hover:bg-white/[0.04]"
                             : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                    }`}>
                    سؤال جديد
                  </button>
                </motion.div>
                </BetaReviewGate>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
