"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calculator, Money, CaretLeft, Gavel, Clock,
  ArrowCounterClockwise, CheckCircle, Info, ChartBar, Receipt,
  Buildings, Users, CalendarBlank, ArrowsLeftRight, Warning, Sparkle,
  // Case Type Icons
  HardHat, Storefront, Scales, Lock, UsersThree, House, Bank
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import dynamic from "next/dynamic";
import { HIJRI_MONTHS_AR } from "@/lib/services/hijri";
import { CASE_VALUE_RULE, HOURS_RULE, lawyerFeeInputError, parseBounded } from "@/components/calculators/calcInputs";
import { convertGregorianToHijri, convertHijriToGregorian } from "@/components/calculators/dateConvert";

const CalcCourtFees  = dynamic(() => import("@/components/calculators/CalcCourtFees"),  { ssr: false });
const CalcLaborRights = dynamic(() => import("@/components/calculators/CalcLaborRights"), { ssr: false });
const CalcLegalDeadlines = dynamic(() => import("@/components/calculators/CalcLegalDeadlines"), { ssr: false });

// ─── Types & Constants — Lawyer Fee Calculator ────────────────────────────────

type CaseType = "labor" | "commercial" | "civil" | "criminal" | "family" | "real_estate" | "admin";
type FeeModel = "hourly" | "fixed" | "contingency";

interface FeeInputs {
  caseType:      CaseType | "";
  feeModel:      FeeModel | "";
  caseValue:     string;
  estimatedHours:string;
  complexity:    "simple" | "medium" | "complex" | "";
  stages:        string[];
}

const CASE_TYPES: { id: CaseType; label: string; Icon: React.ElementType }[] = [
  { id: "labor",       label: "عمالي",           Icon: HardHat },
  { id: "commercial",  label: "تجاري",            Icon: Storefront },
  { id: "civil",       label: "مدني",             Icon: Scales },
  { id: "criminal",    label: "جنائي",            Icon: Lock },
  { id: "family",      label: "أحوال شخصية",      Icon: UsersThree },
  { id: "real_estate", label: "عقاري",            Icon: House },
  { id: "admin",       label: "إداري",            Icon: Bank },
];

const spring = { type: "spring" as const, stiffness: 320, damping: 26 };

const FEE_RANGES: Record<CaseType, { min: number; max: number; label: string }> = {
  labor:       { min: 3000,  max: 25000,  label: "٣,٠٠٠ – ٢٥,٠٠٠ ر.س" },
  commercial:  { min: 8000,  max: 100000, label: "٨,٠٠٠ – ١٠٠,٠٠٠ ر.س" },
  civil:       { min: 4000,  max: 40000,  label: "٤,٠٠٠ – ٤٠,٠٠٠ ر.س" },
  criminal:    { min: 10000, max: 80000,  label: "١٠,٠٠٠ – ٨٠,٠٠٠ ر.س" },
  family:      { min: 3500,  max: 20000,  label: "٣,٥٠٠ – ٢٠,٠٠٠ ر.س" },
  real_estate: { min: 5000,  max: 60000,  label: "٥,٠٠٠ – ٦٠,٠٠٠ ر.س" },
  admin:       { min: 6000,  max: 50000,  label: "٦,٠٠٠ – ٥٠,٠٠٠ ر.س" },
};

function calculateFee(inputs: FeeInputs) {
  if (!inputs.caseType || !inputs.complexity) return null;
  const range = FEE_RANGES[inputs.caseType];
  const complexityMult = inputs.complexity === "simple" ? 0.5 : inputs.complexity === "medium" ? 1 : 1.8;
  const stagesCount = inputs.stages.length || 1;
  const base = range.min + (range.max - range.min) * (complexityMult - 0.5) / 1.3;
  let low = 0, mid = 0, high = 0;

  // LIVE-F30: bounded numbers only — −5 hours used to give negative fees, and
  // an empty field fell back silently to the fixed-fee formula.
  if (inputs.feeModel === "hourly") {
    const hours = parseBounded(inputs.estimatedHours, HOURS_RULE);
    if (!hours.ok) return null;
    low = hours.value * 300; mid = hours.value * 550; high = hours.value * 800;
  } else if (inputs.feeModel === "contingency") {
    const value = parseBounded(inputs.caseValue, CASE_VALUE_RULE);
    if (!value.ok) return null;
    low = value.value * 0.05; mid = value.value * 0.1; high = value.value * 0.15;
  } else {
    low = base * 0.7 * stagesCount; mid = base * stagesCount; high = base * 1.4 * stagesCount;
  }

  const breakdown = [
    { label: "أتعاب الأساسية", amount: Math.round(mid * 0.7) },
    { label: "نفقات المحكمة والتبليغ", amount: Math.round(mid * 0.1) },
    { label: "أتعاب المراحل الإضافية", amount: Math.round(mid * 0.15 * (stagesCount - 1)) },
    { label: "مصاريف متنوعة", amount: Math.round(mid * 0.05) },
  ].filter(b => b.amount > 0);

  return {
    low: Math.round(low / 100) * 100,
    mid: Math.round(mid / 100) * 100,
    high: Math.round(high / 100) * 100,
    breakdown,
  };
}

// ─── Tabs Config ──────────────────────────────────────────────────────────────

type Tab = "lawyer_fees" | "court_fees" | "labor_rights" | "deadlines" | "date_convert";

const TABS: { id: Tab; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "lawyer_fees",   label: "أتعاب المحامي",     icon: Calculator,       desc: "تقدير أتعاب التمثيل القانوني" },
  // «التكاليف القضائية», the regulation's own term; the rule (owner answer
  // ١٨٢: the regulation's bands and flat amounts) and the «تقديرية استرشادية»
  // label live in components/calculators. The subtitle names every figure
  // CalcCourtFees applies.
  { id: "court_fees",   label: "التكاليف القضائية", icon: Buildings,        desc: "تقديرية استرشادية — الدرجة الأولى من ٥٪ إلى ٢٪ بحسب شريحة المطالبة بحد أقصى مليون ريال، والاستئناف ٥٬٠٠٠ ريال، والنقض ٧٬٠٠٠، والتماس إعادة النظر ١٠٬٠٠٠" },
  { id: "labor_rights", label: "مستحقات العمل",     icon: Users,            desc: "حسابات نهاية الخدمة والإشعار" },
  { id: "deadlines",    label: "المواعيد القانونية", icon: CalendarBlank,    desc: "احسب مواعيد الاعتراض والتقادم" },
  { id: "date_convert", label: "تحويل التاريخ",      icon: ArrowsLeftRight,  desc: "هجري ↔ ميلادي بدقة" },
];

// ─── Hijri ↔ Gregorian ────────────────────────────────────────────────────────
// LIVE-F31: the page's own Kuwaiti tabular routines are gone. They accepted
// 31 February and rolled it into March without a word, and they were not Umm
// al-Qura. components/calculators/dateConvert.ts refuses a day that does not
// exist (Hijri month lengths included) and converts through hijri.ts — the
// platform's one Umm al-Qura calendar.

const H_MONTHS = HIJRI_MONTHS_AR;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FeeCalculatorPage() {
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>("lawyer_fees");

  // Deadline calc state

  // Date converter state
  const [convDir,    setConvDir]    = useState<"g2h" | "h2g">("g2h");
  const [gYear,  setGYear]  = useState("");
  const [gMonth, setGMonth] = useState("");
  const [gDay,   setGDay]   = useState("");
  const [hYear,  setHYear]  = useState("");
  const [hMonth, setHMonth] = useState("");
  const [hDay,   setHDay]   = useState("");
  const [convResult, setConvResult] = useState<string | null>(null);
  const [convError, setConvError] = useState<string | null>(null);
  // LIVE-F30: the lawyer-fee inputs are bounded before calculating.
  const [feeError, setFeeError] = useState<string | null>(null);

  const [inputs, setInputs] = useState<FeeInputs>({
    caseType: "", feeModel: "", caseValue: "",
    estimatedHours: "", complexity: "", stages: ["first"],
  });
  const [result, setResult] = useState<ReturnType<typeof calculateFee>>(null);
  const [calculated, setCalculated] = useState(false);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-sm";

  const inputCls = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 focus:border-[#C8A762]/40" : "border-slate-200 bg-slate-50 text-slate-700 placeholder:text-slate-400"}`;

  const handleCalc = useCallback(() => {
    const issue = lawyerFeeInputError(inputs);
    if (issue) { setFeeError(issue); setResult(null); setCalculated(false); return; }
    setFeeError(null);
    setResult(calculateFee(inputs));
    setCalculated(true);
  }, [inputs]);

  const toggleStage = (stage: string) =>
    setInputs(prev => ({ ...prev, stages: prev.stages.includes(stage) ? prev.stages.filter(s => s !== stage) : [...prev.stages, stage] }));

  const resetAll = () => {
    setInputs({ caseType: "", feeModel: "", caseValue: "", estimatedHours: "", complexity: "", stages: ["first"] });
    setResult(null); setCalculated(false); setFeeError(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 mb-4 text-sm">
          <Link href="/ai" className={`transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>ذكاء نظامي</Link>
          <CaretLeft size={12} className={isDark ? "text-zinc-600" : "text-slate-300"} />
          <span className={isDark ? "text-zinc-300" : "text-slate-600"}>مركز الحاسبات القانونية</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#C8A762]/10 flex items-center justify-center flex-shrink-0">
            <Calculator size={24} weight="duotone" className="text-[#C8A762]" />
          </div>
          <div>
            <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
              الحاسبة القانونية
            </h1>
            <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              أتعاب · تكاليف قضائية · مستحقات · مواعيد · تحويل التاريخ
            </p>
          </div>
        </div>
      </motion.div>

      {/* Tab switcher */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className={`p-1.5 rounded-2xl flex gap-1 ${isDark ? "bg-zinc-800/80" : "bg-slate-100"}`}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 px-2 rounded-xl transition-all ${isActive ? isDark ? "bg-zinc-700 shadow-sm" : "bg-white shadow-sm" : "hover:bg-black/5 dark:hover:bg-white/5"}`}>
                <Icon size={16} className={isActive ? "text-[#C8A762]" : isDark ? "text-zinc-500" : "text-slate-400"} />
                <span className={`text-[11px] font-bold hidden sm:block ${isActive ? isDark ? "text-zinc-200" : "text-slate-700" : isDark ? "text-zinc-500" : "text-slate-400"}`}>{tab.label}</span>
              </button>
            );
          })}
        </div>
        <p className={`text-center text-[11px] mt-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
          {TABS.find(t => t.id === activeTab)?.desc}
        </p>
      </motion.div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>

          {/* ── Tab 1: Lawyer Fees ─────────────────────────────────────────── */}
          {activeTab === "lawyer_fees" && (
            <div className="space-y-5">
              <div className={`${card} p-6 space-y-5`}>

                {/* Case type */}
                <div>
                  <label className={`block text-xs font-bold mb-2 uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>نوع القضية</label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {CASE_TYPES.map(ct => {
                      const IconComp = ct.Icon;
                      return (
                        <motion.button key={ct.id} onClick={() => setInputs(p => ({ ...p, caseType: ct.id }))}
                          whileHover={{ scale: 1.025, transition: spring }} whileTap={{ scale: 0.975, transition: spring }}
                          className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-[12px] font-medium transition-all ${inputs.caseType === ct.id ? "bg-[#0B3D2E]/10 border-[#0B3D2E]/30 text-[#0B3D2E] dark:text-emerald-400 dark:border-emerald-700/40" : isDark ? "border-white/[0.06] text-zinc-500 hover:border-white/10 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-[#0B3D2E]/20 hover:text-[#0B3D2E]"}`}>
                          <IconComp size={18} weight="duotone" className={inputs.caseType === ct.id ? "text-[#0B3D2E] dark:text-emerald-400" : isDark ? "text-zinc-500" : "text-slate-400"} />
                          {ct.label}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Complexity */}
                <div>
                  <label className={`block text-xs font-bold mb-2 uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>تعقيد القضية</label>
                  <div className="flex gap-2">
                    {(["simple", "medium", "complex"] as const).map((val) => (
                      <button key={val} onClick={() => setInputs(p => ({ ...p, complexity: val }))}
                        className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${inputs.complexity === val ? "bg-[#0B3D2E]/10 border-[#0B3D2E]/30 text-[#0B3D2E] dark:text-emerald-400" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500"}`}>
                        {val === "simple" ? "بسيطة" : val === "medium" ? "متوسطة" : "معقدة"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stages */}
                <div>
                  <label className={`block text-xs font-bold mb-2 uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>مراحل التقاضي المتوقعة</label>
                  <div className="flex gap-2 flex-wrap">
                    {([["first", "الابتدائية"], ["appeal", "الاستئناف"], ["cassation", "النقض"]] as const).map(([val, label]) => (
                      <button key={val} onClick={() => toggleStage(val)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${inputs.stages.includes(val) ? "bg-[#0B3D2E] text-white border-[#0B3D2E]" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500"}`}>
                        {inputs.stages.includes(val) && <CheckCircle size={13} />}
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fee model */}
                <div>
                  <label className={`block text-xs font-bold mb-2 uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>نموذج الأتعاب</label>
                  <div className="flex gap-2">
                    {(["fixed", "hourly", "contingency"] as const).map(val => (
                      <button key={val} onClick={() => setInputs(p => ({ ...p, feeModel: val }))}
                        className={`flex-1 py-2.5 rounded-xl border text-[12px] font-medium transition-all ${inputs.feeModel === val ? "bg-[#C8A762]/10 border-[#C8A762]/30 text-[#C8A762]" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500"}`}>
                        {val === "fixed" ? "مبلغ محدد" : val === "hourly" ? "بالساعة" : "نسبة من القضية"}
                      </button>
                    ))}
                  </div>
                </div>

                <AnimatePresence>
                  {inputs.feeModel === "hourly" && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>عدد الساعات المتوقعة</label>
                      <input type="number" min="1" placeholder="مثال: 40" value={inputs.estimatedHours}
                        onChange={e => { setFeeError(null); setInputs(p => ({ ...p, estimatedHours: e.target.value })); }} className={inputCls} />
                    </motion.div>
                  )}
                  {inputs.feeModel === "contingency" && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <label className={`block text-xs font-bold mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>قيمة النزاع (ريال)</label>
                      <input type="text" placeholder="مثال: 500,000" value={inputs.caseValue}
                        onChange={e => { setFeeError(null); setInputs(p => ({ ...p, caseValue: e.target.value })); }} className={inputCls} />
                    </motion.div>
                  )}
                </AnimatePresence>

                {feeError && (
                  <p role="alert" className={`flex items-start gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold ${isDark ? "border-red-500/20 bg-red-500/10 text-red-400" : "border-red-200 bg-red-50 text-red-700"}`}>
                    <Warning size={13} weight="fill" className="mt-0.5 flex-shrink-0" />{feeError}
                  </p>
                )}

                <div className="flex gap-3">
                  <motion.button onClick={handleCalc} disabled={!inputs.caseType || !inputs.complexity}
                    whileHover={inputs.caseType && inputs.complexity ? { scale: 1.02 } : {}}
                    whileTap={inputs.caseType && inputs.complexity ? { scale: 0.98 } : {}}
                    className={`flex-1 py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${inputs.caseType && inputs.complexity ? "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] shadow-md" : isDark ? "bg-white/[0.04] text-zinc-600 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}>
                    <Calculator size={16} /> احسب الأتعاب التقديرية
                  </motion.button>
                  {calculated && <button onClick={resetAll} className={`px-4 py-3.5 rounded-xl border text-xs font-medium ${isDark ? "border-white/[0.06] text-zinc-500" : "border-slate-200 text-slate-400"}`}><ArrowCounterClockwise size={14} /></button>}
                </div>
              </div>

              <AnimatePresence>
                {calculated && result && (
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                    <div className={`${card} p-6`}>
                      <div className="flex items-center gap-2 mb-5">
                        <ChartBar size={16} weight="duotone" className="text-[#C8A762]" />
                        <h3 className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>النطاق التقديري للأتعاب</h3>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mb-5">
                        {[
                          { label: "الحد الأدنى", value: result.low, color: "text-emerald-500", border: "border-emerald-500/20 bg-emerald-500/5" },
                          { label: "المتوسط",      value: result.mid, color: "text-[#C8A762]",   border: "border-[#C8A762]/20 bg-[#C8A762]/5" },
                          { label: "الحد الأعلى", value: result.high, color: "text-amber-500",   border: "border-amber-500/20 bg-amber-500/5" },
                        ].map(r => (
                          <div key={r.label} className={`rounded-xl border p-3 text-center ${r.border}`}>
                            <p className={`text-[10px] mb-1 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{r.label}</p>
                            <p className={`text-[15px] font-bold font-mono ${r.color}`}>{r.value.toLocaleString()} <span className="text-[11px]">ر.س</span></p>
                          </div>
                        ))}
                      </div>
                      <div className={`rounded-xl border p-4 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                        <div className="flex items-center gap-1.5 mb-3">
                          <Receipt size={13} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                          <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>تفصيل تقديري</p>
                        </div>
                        <div className="space-y-2">
                          {result.breakdown.map((item, i) => (
                            <div key={i} className="flex justify-between items-center">
                              <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{item.label}</span>
                              <span className={`text-[12px] font-mono font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{item.amount.toLocaleString()} ر.س</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {inputs.caseType && (
                      <div className={`${card} p-4 flex gap-3 items-center`}>
                        <div className="w-9 h-9 rounded-xl bg-[#C8A762]/10 flex items-center justify-center flex-shrink-0">
                          <Money size={18} weight="duotone" className="text-[#C8A762]" />
                        </div>
                        <div>
                          <p className={`text-[12px] font-bold mb-0.5 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                            النطاق السوقي للقضايا {CASE_TYPES.find(c => c.id === inputs.caseType)?.label}
                          </p>
                          <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{FEE_RANGES[inputs.caseType as CaseType].label}</p>
                        </div>
                      </div>
                    )}
                    <div className={`p-4 rounded-2xl border flex gap-3 ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
                      <Info size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-amber-700"}`}>
                        هذه التقديرات للإرشاد فقط. الأتعاب الفعلية تختلف بحسب خبرة المحامي، موقعه الجغرافي، وتفاصيل القضية.
                      </p>
                    </div>
                    <AiResultActions
                      text={[
                        `حاسبة أتعاب المحامي — تقرير`,
                        `نوع القضية: ${CASE_TYPES.find(c => c.id === inputs.caseType)?.label ?? ""}`,
                        `التعقيد: ${inputs.complexity}`,
                        `الحد الأدنى: ${result.low.toLocaleString()} ر.س`,
                        `المتوسط: ${result.mid.toLocaleString()} ر.س`,
                        `الحد الأعلى: ${result.high.toLocaleString()} ر.س`,
                        `
التفصيل التقديري:`,
                        ...result.breakdown.map(b => `• ${b.label}: ${b.amount.toLocaleString()} ر.س`),
                      ].join("\n")}
                      filename="fee-calculation"
                      showVault
                      className="justify-start"
                    />
                    <div className="flex gap-3">
                      <Link href="/dashboard/lawyer/clients" className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-colors ${isDark ? "border-white/[0.06] text-zinc-300 hover:bg-white/[0.04]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                        <Gavel size={15} /> إنشاء عقد أتعاب
                      </Link>
                      <Link href="/ai/contracts" className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-sm font-semibold hover:bg-[#0a3328] transition-colors">
                        <Clock size={15} /> صياغة اتفاقية أتعاب
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* ── Tab 2: Court Fees ─────────────────────────────────────────── */}
          {activeTab === "court_fees" && <CalcCourtFees />}

          {/* ── Tab 3: Labor Rights ───────────────────────────────────────── */}
          {activeTab === "labor_rights" && <CalcLaborRights />}

          {/* ── Tab 4: Legal Deadlines ──────────────────────────────────────── */}
          {/* LIVE-F33: the shared deadline engine, rules and court holidays — the radar's maths. */}
          {activeTab === "deadlines" && <CalcLegalDeadlines />}

          {/* ── Tab 5: Date Converter ────────────────────────────────────────── */}
          {activeTab === "date_convert" && (
            <div className="space-y-5">
              <div className={`${card} p-6 space-y-5`}>
                <div className={`flex rounded-xl overflow-hidden border ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
                  {(["g2h","h2g"] as const).map(dir => (
                    <button key={dir} onClick={() => { setConvDir(dir); setConvResult(null); setConvError(null); }}
                      className={`flex-1 py-2.5 text-[13px] font-bold transition-all flex items-center justify-center gap-2 ${
                        convDir === dir ? "bg-[#0B3D2E] text-[#C8A762]" : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:bg-slate-50"
                      }`}>
                      {dir === "g2h" ? <><span>ميلادي</span><ArrowsLeftRight size={13}/><span>هجري</span></> : <><span>هجري</span><ArrowsLeftRight size={13}/><span>ميلادي</span></>}
                    </button>
                  ))}
                </div>

                {convDir === "g2h" && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>أدخل التاريخ الميلادي</p>
                    <div className="grid grid-cols-3 gap-3">
                      {([{label:"اليوم",val:gDay,set:setGDay,ph:"01"},{label:"الشهر",val:gMonth,set:setGMonth,ph:"01"},{label:"السنة",val:gYear,set:setGYear,ph:"2024"}]).map(f => (
                        <div key={f.label}>
                          <label className={`block text-[10px] font-bold mb-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{f.label}</label>
                          <input type="number" placeholder={f.ph} min="1" value={f.val}
                            onChange={e => { f.set(e.target.value); setConvResult(null); setConvError(null); }}
                            className={`w-full rounded-xl border px-3 py-2.5 text-sm text-center font-mono outline-none ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-200" : "border-slate-200 bg-slate-50 text-slate-700"}`} />
                        </div>
                      ))}
                    </div>
                    <button onClick={() => {
                        const r = convertGregorianToHijri(gDay, gMonth, gYear);
                        if (r.ok) { setConvError(null); setConvResult(r.text); }
                        else { setConvResult(null); setConvError(r.error); }
                      }}
                      disabled={!gYear||!gMonth||!gDay}
                      className="w-full py-3 rounded-xl bg-[#0B3D2E] text-[#C8A762] font-bold text-[13px] disabled:opacity-40">
                      تحويل إلى هجري ✨
                    </button>
                  </motion.div>
                )}

                {convDir === "h2g" && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>أدخل التاريخ الهجري</p>
                    <div className="grid grid-cols-3 gap-3">
                      {([{label:"اليوم",val:hDay,set:setHDay,ph:"01"},{label:"الشهر",val:hMonth,set:setHMonth,ph:"01"},{label:"السنة",val:hYear,set:setHYear,ph:"1445"}]).map(f => (
                        <div key={f.label}>
                          <label className={`block text-[10px] font-bold mb-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{f.label}</label>
                          <input type="number" placeholder={f.ph} min="1" value={f.val}
                            onChange={e => { f.set(e.target.value); setConvResult(null); setConvError(null); }}
                            className={`w-full rounded-xl border px-3 py-2.5 text-sm text-center font-mono outline-none ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-200" : "border-slate-200 bg-slate-50 text-slate-700"}`} />
                        </div>
                      ))}
                    </div>
                    <div>
                      <label className={`block text-[10px] font-bold mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>أو اختر الشهر</label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {H_MONTHS.map((m,i) => (
                          <button key={m} onClick={() => { setHMonth(String(i+1)); setConvResult(null); setConvError(null); }}
                            className={`py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                              hMonth === String(i+1) ? "bg-[#0B3D2E] text-white border-[#0B3D2E]" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-[#0B3D2E]/20"
                            }`}>{m}</button>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => {
                        const r = convertHijriToGregorian(hDay, hMonth, hYear);
                        if (r.ok) { setConvError(null); setConvResult(r.text); }
                        else { setConvResult(null); setConvError(r.error); }
                      }}
                      disabled={!hYear||!hMonth||!hDay}
                      className="w-full py-3 rounded-xl bg-[#0B3D2E] text-[#C8A762] font-bold text-[13px] disabled:opacity-40">
                      تحويل إلى ميلادي ✨
                    </button>
                  </motion.div>
                )}

                {convError && (
                  <p role="alert" className={`flex items-start gap-1.5 rounded-xl border px-3 py-2.5 text-[12px] font-semibold ${isDark ? "border-red-500/20 bg-red-500/10 text-red-400" : "border-red-200 bg-red-50 text-red-700"}`}>
                    <Warning size={13} weight="fill" className="mt-0.5 flex-shrink-0" />{convError}
                  </p>
                )}

                <AnimatePresence>
                  {convResult && (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                      className={`rounded-2xl border p-6 text-center ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
                      <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-amber-600"}`}>
                        {convDir === "g2h" ? "التاريخ الهجري المقابل" : "التاريخ الميلادي المقابل"}
                      </p>
                      <p className={`text-3xl font-black ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>{convResult}</p>
                      <button onClick={() => setConvResult(null)}
                        className={`mt-4 text-[11px] underline ${isDark ? "text-zinc-600" : "text-amber-500"}`}>تحويل جديد</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
