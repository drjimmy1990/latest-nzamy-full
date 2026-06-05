"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Compass, MagnifyingGlass, BookOpen, Gavel, CheckCircle,
  ArrowRight, CaretLeft, Copy, Check, DownloadSimple,
  PencilSimple, Scales, ArrowsClockwise, Sparkle, Warning,
  BookmarkSimple, ArrowSquareOut, PaperPlaneTilt, Basket,
  Bank, GlobeHemisphereWest,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import { addToInbox } from "@/lib/services/researchService";
import { GlobalCaseCard, PrecedentCard } from "./direction-support.cards";
import {
  BADGE_COLORS,
  BRANCHES,
  EXAMPLES,
  MOCK_CASES,
  MOCK_PRECEDENTS,
  MOCK_TEXTS,
  RELEVANCE_COLORS,
} from "./direction-support.data";
import type { LegalText, Precedent, ResultTab, SearchModes, Stage } from "./direction-support.types";

const SEARCH_MODE_OPTIONS: { id: keyof SearchModes; label: string; sub: string; icon: typeof BookOpen; color: string; active: string }[] = [
  { id:"texts",      label:"نصوص ومبادئ",     sub:"أنظمة · لوائح · مبادئ قضائية",       icon:BookOpen,  color:"text-teal-400",   active:"from-teal-700 to-teal-500"   },
  { id:"precedents", label:"سوابق قضائية",  sub:"أحكام مشابهة ١٠%+ مع تسبيبها",     icon:Gavel,     color:"text-amber-400",  active:"from-amber-600 to-amber-400" },
  { id:"cases",      label:"وقائع استئناسية", sub:"محلية و دولية — لتعزيز الحجج",  icon:Scales,    color:"text-blue-400",   active:"from-blue-700 to-blue-500"   },
];

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function DirectionSupportPage() {
  const { isDark } = useTheme();
  const [stage,        setStage]       = useState<Stage>("input");
  const [searchModes,  setSearchModes] = useState<SearchModes>({ texts: true, precedents: true, cases: true });
  const [resultTab,    setResultTab]   = useState<ResultTab>("texts");
  const [direction,    setDirection]   = useState("");
  const [branch,       setBranch]      = useState<string | null>(null);
  const [savedTexts,   setSavedTexts]  = useState<string[]>([]);
  const [savedPrec,    setSavedPrec]   = useState<string[]>([]);
  const [copiedId,     setCopiedId]    = useState<string | null>(null);
  const [sentId,       setSentId]      = useState<string | null>(null);
  const [basketCount,  setBasketCount] = useState(0);
  const [progress,     setProgress]    = useState(0);
  const [exampleIdx,   setExampleIdx]  = useState(0);
  const [refSources,   setRefSources]  = useState({
    laws: true, principles: true, appeal: true, fiqh: false, fatwa: false,
  });
  const toggleSrc = (k: keyof typeof refSources) => setRefSources(p => ({ ...p, [k]: !p[k] }));
  const toggleMode = (k: keyof SearchModes) => setSearchModes(p => ({ ...p, [k]: !p[k] }));
  const anySrc  = Object.values(refSources).some(Boolean);
  const anyMode = Object.values(searchModes).some(Boolean);

  const canProcess = direction.trim().length >= 20 && !!branch && anySrc && anyMode;

  // Send item to Saye'gh inbox
  const handleSendToSayegh = useCallback(async (title: string, content: string, type: "text" | "precedent" | "case" | "principle") => {
    await addToInbox("direction-support", type, title, content);
    setBasketCount(p => p + 1);
    setSentId(title); setTimeout(() => setSentId(null), 2000);
  }, []);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70"
    : "rounded-2xl border border-slate-200 bg-white shadow-sm";

  // Processing steps adapt to mode
  const processingSteps = [
    { label: "تحليل الاتجاه المطلوب دعمه",                done: progress >= 20 },
    ...(searchModes.texts ? [
      { label: `البحث في الأنظمة واللوائح — ${branch ?? ""}`, done: progress >= 40 },
      { label: "استخلاص المبادئ القضائية الداعمة",           done: progress >= 60 },
    ] : []),
    ...(searchModes.precedents ? [
      { label: "البحث في قاعدة الأحكام القضائية",           done: progress >= 80 },
    ] : []),
    ...(searchModes.cases ? [
      { label: "البحث في السوابق المحلية والدولية",          done: progress >= 90 },
    ] : []),
    { label: "ترتيب النتائج حسب قوة التشابه والدعم",      done: progress >= 100 },
  ];

  function handleProcess() {
    if (!canProcess) return;
    setStage("processing"); setProgress(0);
    const steps = [15, 35, 55, 75, 95, 100];
    steps.forEach((p, i) => {
      setTimeout(() => {
        setProgress(p);
        if (i === steps.length - 1) setTimeout(() => setStage("result"), 400);
      }, i * 600);
    });
  }

  function handleCopyText(item: LegalText) {
    navigator.clipboard.writeText(`${item.ref}\n\n${item.fullText}`);
    setCopiedId(item.id); setTimeout(() => setCopiedId(null), 2000);
  }

  function handleCopyPrec(item: Precedent) {
    const text = `${item.court} — ${item.caseNo}\n\nالوقائع: ${item.factsMatch}\n\nالمنطوق: ${item.verdict}\n\nالتسبيب: ${item.reasoning}`;
    navigator.clipboard.writeText(text);
    setCopiedId(item.id); setTimeout(() => setCopiedId(null), 2000);
  }

  function handleReset() {
    setDirection(""); setBranch(null);
    setSavedTexts([]); setSavedPrec([]);
    setStage("input"); setProgress(0); setBasketCount(0);
    setResultTab("texts");
  }

  const savedCount = resultTab === "texts" ? savedTexts.length : savedPrec.length;

  // Filter only to show supporting by default for precedents, warn about contrary
  const supportingPrec = MOCK_PRECEDENTS.filter(p => p.outcome === "مع");
  const contraryPrec   = MOCK_PRECEDENTS.filter(p => p.outcome === "ضد");

  return (
    <div className={`max-w-3xl mx-auto p-5 md:p-7 space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px]">
        <Link href="/ai" className={`transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>نظامي AI</Link>
        <CaretLeft size={11} className={isDark ? "text-zinc-700" : "text-slate-300"} />
        <span className={isDark ? "text-zinc-300" : "text-slate-600"}>داعم الاتجاه</span>
      </div>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-700 to-teal-600 flex items-center justify-center flex-shrink-0">
          <Compass size={24} weight="duotone" className="text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>داعم الاتجاه</h1>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isDark ? "border-teal-700/30 bg-teal-900/10 text-teal-400" : "border-teal-200 bg-teal-50 text-teal-700"}`}>جديد</span>
          </div>
          <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            نصوص ومبادئ قانونية · سوابق قضائية مشابهة — كل ما يُقوّي موقفك أمام المحكمة
          </p>
        </div>
      </motion.div>

      {/* Info callout */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className={`flex items-start gap-3 p-3.5 rounded-xl border ${isDark ? "border-teal-700/20 bg-teal-900/10" : "border-teal-200 bg-teal-50/60"}`}>
        <BookOpen size={14} className="text-teal-500 flex-shrink-0 mt-0.5" weight="duotone" />
        <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
          هذه الأداة <span className="font-bold">مكملة للصائغ</span> — بعد الحصول على النصوص والسوابق، يمكنك إرسالها مباشرة لخطوة &quot;المستندات والأحكام&quot; في الصائغ القانوني.
        </p>
      </motion.div>

      <AnimatePresence mode="wait">

        {/* ── Input ── */}
        {stage === "input" && (
          <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* ── Step 1: اتجاه البحث + المصادر ── */}
            <div className={`${card} p-4 space-y-3`}>
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${isDark ? "bg-teal-900/40 text-teal-400" : "bg-teal-100 text-teal-700"}`}>١</span>
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-slate-500"}`}>ماذا تريد البحث عنه؟</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {SEARCH_MODE_OPTIONS.map(m => {
                  const Icon = m.icon;
                  const active = searchModes[m.id];
                  return (
                    <motion.button key={m.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      onClick={() => toggleMode(m.id)}
                      className={`relative flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                        active
                          ? `bg-gradient-to-br ${m.active} border-transparent text-white shadow-md`
                          : isDark ? "border-white/[0.07] bg-zinc-800/40 hover:border-white/[0.14]" : "border-slate-200 bg-slate-50 hover:border-slate-300"
                      }`}>
                      {/* checkbox corner */}
                      <span className={`absolute top-2 left-2 w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-all ${
                        active ? "border-white/60 bg-white/20" : isDark ? "border-zinc-600" : "border-zinc-300"
                      }`}>
                        {active && <Check size={8} weight="bold" className="text-white" />}
                      </span>
                      <Icon size={18} weight="duotone" className={active ? "text-white" : m.color} />
                      <p className={`text-[11px] font-bold leading-tight ${active ? "text-white" : isDark ? "text-zinc-300" : "text-zinc-700"}`}>{m.label}</p>
                      <p className={`text-[9px] leading-snug ${active ? "text-white/70" : isDark ? "text-zinc-600" : "text-slate-400"}`}>{m.sub}</p>
                    </motion.button>
                  );
                })}
              </div>
              {!anyMode && <p className="text-[10px] text-red-400 font-semibold">اختر نوعاً واحداً على الأقل</p>}
              {/* Sources — sub-section */}
              <div className={`rounded-xl border p-3 space-y-2 ${isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                <p className={`text-[9px] font-black uppercase tracking-widest ${isDark ? "text-zinc-600" : "text-slate-400"}`}>مصادر البحث</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {([
                    { key:"laws",       label:"الأنظمة واللوائح",         sub:"هيئة الخبراء + نظامي" },
                    { key:"principles", label:"مبادئ قضائية عليا",        sub:"المحكمة العليا + مجلس القضاء" },
                    { key:"appeal",     label:"أحكام محاكم الاستئناف",    sub:"سوابق قضائية منشورة" },
                    { key:"fiqh",       label:"الفقه القانوني",            sub:"آراء فقهية ودراسات" },
                    { key:"fatwa",      label:"الفتاوى الشرعية",           sub:"هيئة كبار العلماء" },
                  ] as const).map(s => (
                    <button key={s.key} onClick={() => toggleSrc(s.key)}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-start transition-all ${
                        refSources[s.key]
                          ? isDark ? "border-teal-600/40 bg-teal-900/15" : "border-teal-400/40 bg-teal-50"
                          : isDark ? "border-white/[0.06] hover:border-white/10" : "border-slate-200 hover:border-slate-300"
                      }`}>
                      <div className={`w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                        refSources[s.key] ? "border-teal-500" : isDark ? "border-zinc-700" : "border-zinc-300"
                      }`}>
                        {refSources[s.key] && <div className="w-1.5 h-1.5 rounded-sm bg-teal-500" />}
                      </div>
                      <div>
                        <p className={`text-[10px] font-bold leading-none mb-0.5 ${refSources[s.key] ? isDark ? "text-teal-300" : "text-teal-700" : isDark ? "text-zinc-400" : "text-zinc-600"}`}>{s.label}</p>
                        <p className={`text-[9px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{s.sub}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Step 2: الاتجاه ── */}


            <div className={`${card} p-4 space-y-3`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${isDark ? "bg-teal-900/40 text-teal-400" : "bg-teal-100 text-teal-700"}`}>٢</span>
                  <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-slate-500"}`}>اكتب الاتجاه الذي تريد دعمه</p>
                </div>
                <button onClick={() => { setDirection(EXAMPLES[exampleIdx]); setExampleIdx(i => (i + 1) % EXAMPLES.length); }}
                  className={`flex items-center gap-1 text-[10px] font-semibold transition ${isDark ? "text-zinc-600 hover:text-teal-400" : "text-slate-400 hover:text-teal-600"}`}>
                  <Sparkle size={11} />مثال
                </button>
              </div>
              <textarea value={direction} onChange={e => setDirection(e.target.value)} rows={4}
                placeholder="أريد نصوصاً وأحكاماً قضائية تدعم موقفي في أن..."
                className={`w-full px-3.5 py-3 rounded-xl border text-[13px] leading-relaxed resize-none outline-none transition ${
                  isDark ? "border-white/[0.06] bg-zinc-800/80 text-zinc-200 placeholder-zinc-600 focus:border-teal-500/30" : "border-slate-200 bg-slate-50 text-zinc-800 placeholder-slate-400 focus:border-teal-300"
                }`} />
              <div className="flex justify-between items-center">
                <span className={`text-[10px] ${isDark ? "text-zinc-700" : "text-slate-300"}`}>{direction.length} حرف</span>
                <span className={`text-[10px] ${direction.length < 20 ? "text-red-400" : isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  {direction.length < 20 ? `${20 - direction.length} حرف إضافي على الأقل` : <span className="flex items-center gap-1"><Check size={12} weight="bold" /> يمكن المتابعة</span>}
                </span>
              </div>
            </div>

            {/* ── Step 3: الفرع القانوني ── */}
            <div className={`${card} p-4 space-y-3`}>
              <div className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${isDark ? "bg-teal-900/40 text-teal-400" : "bg-teal-100 text-teal-700"}`}>٣</span>
                <p className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-slate-500"}`}>الفرع القانوني</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {BRANCHES.map(b => (
                  <button key={b} onClick={() => setBranch(b === branch ? null : b)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all ${
                      branch === b
                        ? isDark ? "bg-teal-900/30 border-teal-700/30 text-teal-300" : "bg-teal-50 border-teal-300 text-teal-700"
                        : isDark ? "border-white/[0.06] text-zinc-500 hover:border-white/10" : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}>
                    {b}
                  </button>
                ))}
              </div>
            </div>


            {/* Submit */}
            <motion.button whileHover={canProcess ? { scale: 1.015 } : {}} whileTap={canProcess ? { scale: 0.985 } : {}}
              onClick={handleProcess} disabled={!canProcess}
              className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white text-[13px] font-bold shadow-md transition-all ${
                canProcess ? "bg-gradient-to-l from-emerald-800 to-teal-600" : "bg-gradient-to-l from-emerald-800/40 to-teal-600/40 cursor-not-allowed"
              }`}>
              <MagnifyingGlass size={16} weight="duotone" />
              {!direction || direction.length < 20 ? "اكتب الاتجاه أولاً (٢٠ حرف على الأقل)"
               : !branch ? "اختر الفرع القانوني"
               : !anyMode ? "اختر نوع البحث"
               : `ابحث في ${[searchModes.texts?"النصوص":"", searchModes.precedents?"السوابق":"", searchModes.cases?"الوقائع":""].filter(Boolean).join(" + ")} — ${branch}`}
            </motion.button>
          </motion.div>
        )}

        {/* ── Processing ── */}
        {stage === "processing" && (
          <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`${card} p-10 space-y-6`}>
            <div className="flex flex-col items-center text-center gap-3">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-14 h-14 rounded-full border-2 border-teal-500/20 border-t-teal-500" />
              <div>
                <p className={`text-[15px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>جارٍ البحث في النصوص والسوابق...</p>
                <p className={`text-[12px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>الفرع: <span className="font-bold text-teal-500">{branch}</span></p>
              </div>
            </div>
            <div className="space-y-2 max-w-xs mx-auto w-full">
              {processingSteps.map((step, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                    step.done ? "bg-teal-500" : isDark ? "bg-zinc-800 border border-zinc-700" : "bg-slate-100 border border-slate-200"
                  }`}>
                    {step.done && <CheckCircle size={12} weight="fill" className="text-white" />}
                  </div>
                  <p className={`text-[12px] ${step.done ? isDark ? "text-zinc-300" : "text-zinc-600" : isDark ? "text-zinc-600" : "text-slate-400"}`}>{step.label}</p>
                </motion.div>
              ))}
            </div>
            <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
              <motion.div animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }}
                className="h-full rounded-full bg-gradient-to-l from-emerald-600 to-teal-500" />
            </div>
            <p className={`text-center text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{progress}%</p>
          </motion.div>
        )}

        {/* ── Result ── */}
        {stage === "result" && (
          <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

            {/* Floating basket badge */}
            {basketCount > 0 && (
              <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}
                className={`flex items-center gap-2.5 p-3 rounded-xl border ${
                  isDark ? "border-blue-700/30 bg-blue-900/20" : "border-blue-200 bg-blue-50"
                }`}>
                <Basket size={16} weight="duotone" className="text-blue-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className={`text-[11px] font-bold ${isDark ? "text-blue-300" : "text-blue-700"}`}>
                    أرسلت {basketCount} عنصر للصائغ القانوني
                  </p>
                  <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>ستجدها في خطوة &quot;المستندات والأحكام&quot; بالصائغ</p>
                </div>
                <Link href="/ai/draft" className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition ${
                  isDark ? "bg-blue-900/40 text-blue-300 hover:bg-blue-900/60" : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                }`}>اذهب للصائغ ←</Link>
              </motion.div>
            )}

            {/* Context echo */}
            <div className={`px-4 py-2.5 rounded-xl border text-[12px] border-dashed ${isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-500"}`}>
              <span className="font-bold">الاتجاه: </span>{direction}
            </div>

            {/* ── Tab switcher ── */}
            <div className={`flex rounded-2xl border p-1 gap-0.5 ${isDark ? "border-white/[0.07] bg-zinc-900/60" : "border-slate-200 bg-slate-50"}`}>
              <button onClick={() => setResultTab("texts")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-bold transition-all ${
                  resultTab === "texts"
                    ? isDark ? "bg-teal-900/40 text-teal-300 border border-teal-700/30" : "bg-white text-teal-700 border border-teal-200 shadow-sm"
                    : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
                }`}>
                <BookOpen size={13} weight={resultTab === "texts" ? "duotone" : "regular"} />
                نصوص
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-500"}`}>
                  {MOCK_TEXTS.length}
                </span>
              </button>
              <button onClick={() => setResultTab("precedents")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-bold transition-all ${
                  resultTab === "precedents"
                    ? isDark ? "bg-amber-900/30 text-amber-300 border border-amber-700/20" : "bg-white text-amber-700 border border-amber-200 shadow-sm"
                    : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
                }`}>
                <Gavel size={13} weight={resultTab === "precedents" ? "duotone" : "regular"} />
                سوابق
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isDark ? "bg-amber-900/20 text-amber-500" : "bg-amber-50 text-amber-600"}`}>
                  {MOCK_PRECEDENTS.length}
                </span>
              </button>
              <button onClick={() => setResultTab("cases")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-bold transition-all ${
                  resultTab === "cases"
                    ? isDark ? "bg-blue-900/30 text-blue-300 border border-blue-700/20" : "bg-white text-blue-700 border border-blue-200 shadow-sm"
                    : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
                }`}>
                <ArrowSquareOut size={13} weight={resultTab === "cases" ? "duotone" : "regular"} />
                وقائع
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isDark ? "bg-blue-900/20 text-blue-500" : "bg-blue-50 text-blue-600"}`}>
                  {MOCK_CASES.length}
                </span>
              </button>
            </div>

            {/* Summary bar */}
            <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
              <div className="flex items-center gap-2">
                <CheckCircle size={14} weight="fill" className="text-teal-500" />
                <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                  {resultTab === "texts"
                    ? `${MOCK_TEXTS.length} نص داعم — ${branch}`
                    : resultTab === "precedents"
                    ? `${supportingPrec.length} سابقة داعمة · ${contraryPrec.length} مخالفة — ${branch}`
                    : `${MOCK_CASES.filter(c=>c.scope==="محلية").length} محلية · ${MOCK_CASES.filter(c=>c.scope==="دولية").length} دولية — للاستئناس`}
                </p>
              </div>
              {savedCount > 0 && (
                <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${isDark ? "bg-teal-900/30 text-teal-400" : "bg-teal-50 text-teal-700"}`}>
                  {savedCount} محفوظ
                </span>
              )}
            </div>

            {/* ── Texts tab ── */}
            <AnimatePresence mode="wait">
              {resultTab === "texts" && (
                <motion.div key="texts" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                  {MOCK_TEXTS.map((item, i) => {
                    const bc = BADGE_COLORS[item.source];
                    const rc = RELEVANCE_COLORS[item.relevance];
                    const isSaved  = savedTexts.includes(item.id);
                    const isCopied = copiedId === item.id;
                    return (
                      <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                        className={`${card} p-4 space-y-3`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isDark ? bc.dark : bc.light}`}>{item.source}</span>
                            <div className="flex items-center gap-1">
                              <span className={`w-1.5 h-1.5 rounded-full ${rc.dot}`} />
                              <span className={`text-[10px] font-semibold ${isDark ? rc.dark : rc.light}`}>صلة {item.relevance}</span>
                            </div>
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                            <button onClick={() => setSavedTexts(prev => prev.includes(item.id) ? prev.filter(x => x !== item.id) : [...prev, item.id])}
                              className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${isSaved ? "bg-teal-500/10 text-teal-500" : isDark ? "hover:bg-white/[0.06] text-zinc-600" : "hover:bg-slate-100 text-slate-400"}`}>
                              <BookmarkSimple size={13} weight={isSaved ? "fill" : "regular"} />
                            </button>
                            <button onClick={() => handleCopyText(item)}
                              className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${isCopied ? "bg-emerald-500/10 text-emerald-500" : isDark ? "hover:bg-white/[0.06] text-zinc-600" : "hover:bg-slate-100 text-slate-400"}`}>
                              {isCopied ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                            <button
                              onClick={() => handleSendToSayegh(item.ref, `${item.ref}\n\n${item.fullText}`, "text")}
                              title="إرسال للصائغ"
                              className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                                sentId === item.ref ? "bg-blue-500/10 text-blue-500" : isDark ? "hover:bg-white/[0.06] text-zinc-600" : "hover:bg-slate-100 text-slate-400"
                              }`}>
                              {sentId === item.ref ? <Check size={12} className="text-blue-500" /> : <PaperPlaneTilt size={12} />}
                            </button>
                          </div>
                        </div>
                        <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{item.ref}</p>
                        <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{item.fullText}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {item.tags.map(tag => (
                            <span key={tag} className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-slate-100 text-slate-500"}`}>{tag}</span>
                          ))}
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}

              {/* ── Precedents tab ── */}
              {resultTab === "precedents" && (
                <motion.div key="precedents" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">

                  {/* Tip */}
                  <div className={`flex items-start gap-2.5 p-3 rounded-xl border text-[11px] ${isDark ? "border-amber-700/20 bg-amber-900/8" : "border-amber-200 bg-amber-50/60"}`}>
                    <Gavel size={13} className="text-amber-500 flex-shrink-0 mt-0.5" weight="duotone" />
                    <p className={isDark ? "text-zinc-400" : "text-slate-600"}>
                      مرتبة حسب نسبة التشابه مع قضيتك — السوابق الداعمة أولاً، ثم المخالفة <span className="font-bold">للتحذير والتحضير</span>.
                    </p>
                  </div>

                  {/* Supporting precedents */}
                  {supportingPrec.length > 0 && (
                    <div className="space-y-2.5">
                      <p className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? "text-emerald-600" : "text-emerald-600"}`}>
                        <CheckCircle size={14} weight="fill" /> سوابق داعمة لموقفك ({supportingPrec.length})
                      </p>
                      {supportingPrec
                        .sort((a, b) => b.similarity - a.similarity)
                        .map(item => (
                          <PrecedentCard key={item.id} item={item} isDark={isDark}
                            saved={savedPrec.includes(item.id)}
                            onSave={() => setSavedPrec(prev => prev.includes(item.id) ? prev.filter(x => x !== item.id) : [...prev, item.id])}
                            copied={copiedId === item.id}
                            onCopy={() => handleCopyPrec(item)} />
                        ))}
                    </div>
                  )}

                  {/* Contrary precedents */}
                  {contraryPrec.length > 0 && (
                    <div className="space-y-2.5">
                      <div className={`flex items-center gap-2 p-2.5 rounded-xl border ${isDark ? "border-red-700/20 bg-red-900/8" : "border-red-200 bg-red-50"}`}>
                        <Warning size={13} weight="fill" className="text-red-500 flex-shrink-0" />
                        <p className={`text-[10px] font-bold flex items-center gap-1.5 ${isDark ? "text-red-400" : "text-red-700"}`}>
                          <Warning size={14} weight="fill" /> سوابق مخالفة — مهمة للتحضير ({contraryPrec.length}) — راجعها لتجنب حججها
                        </p>
                      </div>
                      {contraryPrec
                        .sort((a, b) => b.similarity - a.similarity)
                        .map(item => (
                          <PrecedentCard key={item.id} item={item} isDark={isDark}
                            saved={savedPrec.includes(item.id)}
                            onSave={() => setSavedPrec(prev => prev.includes(item.id) ? prev.filter(x => x !== item.id) : [...prev, item.id])}
                            copied={copiedId === item.id}
                            onCopy={() => handleCopyPrec(item)} />
                        ))}
                    </div>
                  )}
                </motion.div>
              )}
              {/* ── Cases tab ── */}
              {resultTab === "cases" && (
                <motion.div key="cases" initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }} className="space-y-3">
                  <div className={`flex items-start gap-2.5 p-3 rounded-xl border text-[11px] ${isDark ? "border-blue-700/20 bg-blue-900/8" : "border-blue-200 bg-blue-50/60"}`}>
                    <ArrowSquareOut size={13} className="text-blue-500 flex-shrink-0 mt-0.5" weight="duotone" />
                    <p className={isDark ? "text-zinc-400" : "text-slate-600"}>
                      السوابق المحلية <span className="font-bold">أولاً</span> — ثم الدولية للاستئناس فقط (غير ملزمة). اضغط على كل قضية لعرض <span className="font-bold">مفاد ذلك في نزاعنا الراهن</span>.
                    </p>
                  </div>

                  {/* Local first */}
                  {MOCK_CASES.filter(c => c.scope === "محلية").length > 0 && (
                    <div className="space-y-2.5">
                      <p className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? "text-emerald-600" : "text-emerald-700"}`}>
                        <Bank size={14} weight="fill" /> وقائع محلية سعودية — ملزمة ({MOCK_CASES.filter(c=>c.scope==="محلية").length})
                      </p>
                      {MOCK_CASES.filter(c => c.scope === "محلية").map(item => (
                        <GlobalCaseCard key={item.id} item={item} isDark={isDark}
                          copied={copiedId === item.id}
                          onCopy={() => {
                            navigator.clipboard.writeText(`${item.name}\n\nالوقائع: ${item.facts}\n\nالمبدأ: ${item.ruling}\n\nمفاد ذلك في نزاعنا: ${item.impact}`);
                            setCopiedId(item.id); setTimeout(() => setCopiedId(null), 2000);
                          }} />
                      ))}
                    </div>
                  )}

                  {/* International second */}
                  {MOCK_CASES.filter(c => c.scope === "دولية").length > 0 && (
                    <div className="space-y-2.5">
                      <div className={`flex items-center gap-2 p-2.5 rounded-xl border ${isDark ? "border-amber-700/20 bg-amber-900/8" : "border-amber-200 bg-amber-50"}`}>
                        <Warning size={13} weight="fill" className="text-amber-500 flex-shrink-0" />
                        <p className={`text-[10px] font-bold flex items-center gap-1.5 ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                          <GlobeHemisphereWest size={14} weight="fill" /> وقائع دولية — للاستئناس والتعزيز فقط، لا ملزمة ({MOCK_CASES.filter(c=>c.scope==="دولية").length})
                        </p>
                      </div>
                      {MOCK_CASES.filter(c => c.scope === "دولية").map(item => (
                        <GlobalCaseCard key={item.id} item={item} isDark={isDark}
                          copied={copiedId === item.id}
                          onCopy={() => {
                            navigator.clipboard.writeText(`${item.name}\n\nالوقائع: ${item.facts}\n\nالمبدأ: ${item.ruling}\n\nمفاد ذلك في نزاعنا: ${item.impact}`);
                            setCopiedId(item.id); setTimeout(() => setCopiedId(null), 2000);
                          }} />
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

            </AnimatePresence>

            {/* ── Action buttons ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <Link href="/ai/draft"
                className={`flex items-center gap-3 p-4 rounded-2xl border transition-all hover:scale-[1.02] ${isDark ? "border-white/[0.07] bg-zinc-900 hover:border-[#C8A762]/30" : "border-slate-200 bg-white shadow-sm hover:border-amber-300 hover:shadow-md"}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
                  <PencilSimple size={18} weight="duotone" className="text-[#C8A762]" />
                </div>
                <div className="flex-1">
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>أرسل للصائغ</p>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>استخدم هذه النتائج في صياغة المذكرة</p>
                </div>
                <ArrowRight size={14} className={isDark ? "text-zinc-600" : "text-slate-300"} />
              </Link>

              <button onClick={() => {
                const items = resultTab === "texts"
                  ? MOCK_TEXTS.map(r => `${r.ref}\n${r.fullText}`).join("\n\n---\n\n")
                  : MOCK_PRECEDENTS.map(r => `${r.court} — ${r.caseNo}\n${r.verdict}\n${r.reasoning}`).join("\n\n---\n\n");
                const blob = new Blob([items], { type: "text/plain;charset=utf-8" });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement("a");
                a.href = url; a.download = `direction-support-${resultTab}.txt`; a.click();
                URL.revokeObjectURL(url);
              }}
                className={`flex items-center gap-3 p-4 rounded-2xl border transition-all hover:scale-[1.02] ${isDark ? "border-white/[0.07] bg-zinc-900 hover:border-teal-500/30" : "border-slate-200 bg-white shadow-sm hover:border-teal-300 hover:shadow-md"}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-teal-900/30" : "bg-teal-50"}`}>
                  <DownloadSimple size={18} weight="duotone" className="text-teal-500" />
                </div>
                <div className="flex-1 text-right">
                  <p className={`text-[13px] font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>
                    تنزيل {resultTab === "texts" ? "النصوص" : "السوابق"}
                  </p>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    {savedCount > 0 ? `المحفوظة (${savedCount})` : "جميع النتائج"}
                  </p>
                </div>
              </button>
            </div>

            <button onClick={handleReset}
              className={`flex items-center gap-2 text-[12px] font-semibold transition ${isDark ? "text-zinc-600 hover:text-zinc-400" : "text-slate-400 hover:text-slate-600"}`}>
              <ArrowsClockwise size={13} />اتجاه جديد
            </button>

            {/* Unified Result Actions */}
            <div className={`pt-2 border-t ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
              <AiResultActions
                text={direction + "\n\n" + MOCK_TEXTS.map(t => t.ref + "\n" + t.fullText).join("\n\n")}
                filename="direction-support"
                showVault
                showHumanReview
                className="justify-start"
              />
            </div>

          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
