"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gavel, Info, ChartBar, Warning, CheckCircle,
  ArrowCounterClockwise, Receipt
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type CourtType  =
  | "commercial" | "general" | "labor" | "criminal" | "family_personal"
  | "real_estate" | "execution" | "admin" | "appeal_commercial"
  | "appeal_general" | "appeal_admin" | "supreme";

type CaseType   = "commercial" | "labor" | "civil" | "family" | "real_estate" | "criminal" | "admin";

interface CourtInputs {
  courtType: CourtType | "";
  caseType:  CaseType  | "";
  value:     string;
  stages:    string[];
}

const COURT_TYPES: { id: CourtType; label: string; icon: string; degree: string }[] = [
  // ── ابتدائية ──────────────────────────────────────────────
  { id: "commercial",       label: "المحكمة التجارية",              icon: "🏢", degree: "ابتدائي" },
  { id: "general",          label: "المحكمة العامة",                icon: "⚖️", degree: "ابتدائي" },
  { id: "labor",            label: "المحكمة العمالية",              icon: "👷", degree: "ابتدائي" },
  { id: "criminal",         label: "المحكمة الجزائية",              icon: "🔒", degree: "ابتدائي" },
  { id: "family_personal",  label: "محكمة الأحوال الشخصية / الأسرة", icon: "👨‍👩‍👧", degree: "ابتدائي" },
  { id: "real_estate",      label: "المحكمة العقارية",              icon: "🏠", degree: "ابتدائي" },
  { id: "execution",        label: "محكمة التنفيذ",                 icon: "⚡", degree: "ابتدائي" },
  { id: "admin",            label: "المحكمة الإدارية (ديوان المظالم)", icon: "🏛", degree: "ابتدائي" },
  // ── استئناف ───────────────────────────────────────────────
  { id: "appeal_general",   label: "محكمة استئناف عامة",           icon: "🔗", degree: "استئناف" },
  { id: "appeal_commercial",label: "محكمة استئناف تجارية",         icon: "📊", degree: "استئناف" },
  { id: "appeal_admin",     label: "محكمة استئناف إدارية",         icon: "🗂", degree: "استئناف" },
  // ── عليا ──────────────────────────────────────────────────
  { id: "supreme",          label: "المحكمة العليا",                icon: "👑", degree: "عليا" },
];

const CASE_TYPES_COURT: { id: CaseType; label: string }[] = [
  { id: "commercial",  label: "تجاري" },
  { id: "labor",       label: "عمالي" },
  { id: "civil",       label: "مدني" },
  { id: "family",      label: "أحوال شخصية" },
  { id: "real_estate", label: "عقاري" },
  { id: "criminal",    label: "جنائي" },
  { id: "admin",       label: "إداري" },
];

// ─── Court Fees Logic ─────────────────────────────────────────────────────────
// Based on: نظام الرسوم القضائية ولائحته التنفيذية

function calcCourtFees(inputs: CourtInputs): {
  baseFee: number;
  stages: { label: string; fee: number }[];
  total: number;
  notes: string[];
} | null {
  if (!inputs.courtType || !inputs.caseType || !inputs.value) return null;

  const val = parseFloat(inputs.value.replace(/,/g, "")) || 0;
  if (val <= 0) return null;

  let baseFee = 0;
  const notes: string[] = [];

  // نظام الرسوم القضائية — الجداول الرسمية (المادة 3 وما بعدها)
  if (inputs.caseType === "family") {
    baseFee = 0;
    notes.push("قضايا الأحوال الشخصية معفاة من الرسوم القضائية وفق المادة 4.");
  } else if (inputs.caseType === "labor" || inputs.courtType === "labor") {
    baseFee = 0;
    notes.push("الدعاوى العمالية معفاة من الرسوم القضائية لمحدودي الدخل وفق نظام العمل.");
  } else if (inputs.courtType === "criminal") {
    baseFee = 0;
    notes.push("القضايا الجزائية لا تخضع لرسوم قضائية على المدعي (وافق الادعاء العام).");
  } else if (inputs.courtType === "family_personal") {
    baseFee = 0;
    notes.push("قضايا الأسرة والأحوال الشخصية معفاة بالكامل من الرسوم القضائية.");
  } else if (inputs.courtType === "execution") {
    baseFee = Math.min(val * 0.01, 10000);
    notes.push("رسوم التنفيذ تُحتسب بـ 1% من قيمة المطالبة بحد أقصى 10,000 ر.س.");
  } else if (inputs.courtType === "supreme") {
    baseFee = Math.min(val * 0.005, 20000);
    notes.push("رسوم المحكمة العليا 0.5% من قيمة النزاع بحد أقصى 20,000 ر.س.");
  } else if (inputs.courtType === "appeal_admin" || inputs.courtType === "admin") {
    baseFee = Math.min(val * 0.01, 15000);
    notes.push("رسوم القضايا الإدارية أمام ديوان المظالم 1% من قيمة النزاع.");
  } else if (val <= 10000) {
    baseFee = Math.min(val * 0.05, 5000);
  } else if (val <= 100000) {
    baseFee = val * 0.025;
  } else if (val <= 1000000) {
    baseFee = val * 0.01;
  } else {
    baseFee = val * 0.005;
    notes.push("المبالغ التي تتجاوز مليون ريال تخضع لسقف رسوم — يُراجَع اللائحة التنفيذية.");
  }

  // رسوم إضافية حسب المراحل
  const stagesFees: { label: string; fee: number }[] = [];

  if (inputs.stages.includes("first")) {
    stagesFees.push({ label: "رسوم الدرجة الأولى", fee: Math.round(baseFee) });
  }
  if (inputs.stages.includes("appeal")) {
    stagesFees.push({ label: "رسوم الاستئناف (50% إضافية)", fee: Math.round(baseFee * 0.5) });
  }
  if (inputs.stages.includes("cassation")) {
    stagesFees.push({ label: "رسوم النقض / التمييز (25% إضافية)", fee: Math.round(baseFee * 0.25) });
    notes.push("رسوم النقض لدى المحاكم التجارية يُعاد تقييمها وفق قيمة النزاع في كل مرحلة.");
  }

  if ((inputs.courtType === "appeal_general" || inputs.courtType === "appeal_commercial" || inputs.courtType === "appeal_admin") && !inputs.stages.includes("appeal")) {
    stagesFees.push({ label: "رسوم محكمة الاستئناف", fee: Math.round(baseFee * 0.5) });
  }

  const total = stagesFees.reduce((sum, s) => sum + s.fee, 0);

  return { baseFee: Math.round(baseFee), stages: stagesFees, total, notes };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CalcCourtFees() {
  const { isDark } = useTheme();
  const [inputs, setInputs] = useState<CourtInputs>({
    courtType: "", caseType: "", value: "", stages: ["first"],
  });
  const [result, setResult] = useState<ReturnType<typeof calcCourtFees>>(null);
  const [done, setDone] = useState(false);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-sm";

  const inp = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400"}`;

  const toggleStage = (s: string) =>
    setInputs(p => ({ ...p, stages: p.stages.includes(s) ? p.stages.filter(x => x !== s) : [...p.stages, s] }));

  const calc = () => {
    const r = calcCourtFees(inputs);
    setResult(r);
    setDone(true);
  };

  const reset = () => { setInputs({ courtType: "", caseType: "", value: "", stages: ["first"] }); setResult(null); setDone(false); };

  const canCalc = !!inputs.courtType && !!inputs.caseType && !!inputs.value;

  return (
    <div className="space-y-5">

      {/* Form */}
      <div className={`${card} p-5 space-y-5`}>

        {/* Court type — grouped by degree */}
        <div>
          <label className={`block text-[11px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>نوع المحكمة</label>
          {/* Group by degree */}
          {[
            { degree: "ابتدائي",  color: "text-blue-500" },
            { degree: "استئناف", color: "text-orange-500" },
            { degree: "عليا",     color: "text-rose-500" },
          ].map(group => {
            const courts = COURT_TYPES.filter(ct => ct.degree === group.degree);
            if (courts.length === 0) return null;
            return (
              <div key={group.degree} className="mb-3">
                <p className={`text-[9px] font-black uppercase tracking-wider mb-1.5 ${group.color} ${isDark ? "" : ""}`}>{group.degree}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {courts.map(ct => (
                    <button key={ct.id} onClick={() => setInputs(p => ({ ...p, courtType: ct.id }))}
                      className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-[11px] font-medium transition-all text-right ${
                        inputs.courtType === ct.id
                          ? "bg-[#0B3D2E]/10 border-[#0B3D2E]/30 text-[#0B3D2E] dark:text-emerald-400 dark:border-emerald-700/40 dark:bg-emerald-900/20"
                          : isDark ? "border-white/[0.06] text-zinc-400 hover:border-white/10 hover:text-zinc-200" : "border-slate-100 text-slate-500 hover:border-slate-300"
                      }`}>
                      <span className="text-base flex-shrink-0">{ct.icon}</span>
                      <span className="truncate">{ct.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Case type */}
        <div>
          <label className={`block text-[11px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>نوع الدعوى</label>
          <div className="flex flex-wrap gap-2">
            {CASE_TYPES_COURT.map(ct => (
              <button key={ct.id} onClick={() => setInputs(p => ({ ...p, caseType: ct.id }))}
                className={`px-3 py-1.5 rounded-xl border text-[12px] font-semibold transition-all ${inputs.caseType === ct.id ? "bg-[#C8A762]/10 border-[#C8A762]/40 text-[#C8A762]" : isDark ? "border-white/[0.06] text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                {ct.label}
              </button>
            ))}
          </div>
        </div>

        {/* Value */}
        <div>
          <label className={`block text-[11px] font-black uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>قيمة النزاع (ريال)</label>
          <input type="text" placeholder="مثال: 250,000" value={inputs.value}
            onChange={e => setInputs(p => ({ ...p, value: e.target.value }))} className={inp} />
        </div>

        {/* Stages */}
        <div>
          <label className={`block text-[11px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>مراحل التقاضي المتوقعة</label>
          <div className="flex gap-2 flex-wrap">
            {[["first", "الدرجة الأولى"], ["appeal", "الاستئناف"], ["cassation", "النقض / التمييز"]].map(([val, label]) => (
              <button key={val} onClick={() => toggleStage(val)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border text-[12px] font-semibold transition-all ${inputs.stages.includes(val) ? "bg-[#0B3D2E] border-[#0B3D2E] text-white" : isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
                {inputs.stages.includes(val) && <CheckCircle size={12} weight="fill" />}
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={calc} disabled={!canCalc}
            className={`flex-1 py-3 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 transition-all ${canCalc ? "bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50] text-white shadow-md" : isDark ? "bg-white/[0.04] text-zinc-600 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}>
            <Gavel size={15} weight="duotone" /> احسب الرسوم
          </button>
          {done && <button onClick={reset} className={`px-4 py-3 rounded-xl border text-[12px] font-semibold ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}><ArrowCounterClockwise size={14} /></button>}
        </div>
      </div>

      {/* Results */}
      <AnimatePresence>
        {done && result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* Summary card */}
            <div className={`${card} p-5`}>
              <div className="flex items-center gap-2 mb-4">
                <ChartBar size={16} weight="duotone" className="text-[#C8A762]" />
                <h3 className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تفصيل الرسوم القضائية</h3>
              </div>

              <div className="space-y-2.5 mb-4">
                {result.stages.map((s, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{s.label}</span>
                    <span className={`text-[13px] font-mono font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{s.fee.toLocaleString()} ر.س</span>
                  </div>
                ))}
                <div className={`pt-2.5 border-t flex items-center justify-between ${isDark ? "border-zinc-800" : "border-slate-100"}`}>
                  <span className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>الإجمالي التقديري</span>
                  <span className={`text-[16px] font-black font-mono ${result.total === 0 ? "text-emerald-500" : "text-[#C8A762]"}`}>{result.total === 0 ? "معفى" : `${result.total.toLocaleString()} ر.س`}</span>
                </div>
              </div>

              {/* Notes */}
              {result.notes.length > 0 && (
                <div className={`rounded-xl p-3 space-y-1.5 ${isDark ? "bg-amber-500/10 border border-amber-500/20" : "bg-amber-50 border border-amber-200"}`}>
                  {result.notes.map((n, i) => (
                    <p key={i} className={`text-[11px] ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                      <Warning size={11} className="inline me-1" weight="fill" />{n}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Legal disclaimer */}
            <div className={`flex gap-3 p-4 rounded-2xl border ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
              <Info size={14} className={`flex-shrink-0 mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`} />
              <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                هذه الأرقام تقديرية مستندة لنظام الرسوم القضائية ولائحته التنفيذية. قد تختلف الرسوم الفعلية بحسب المحكمة والقاضي ونوع الطلب الفرعي. يُنصح بالتحقق من قلم المحكمة قبل الإيداع.
              </p>
            </div>
          </motion.div>
        )}
        {done && !result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`p-5 rounded-2xl border ${isDark ? "border-amber-500/20 bg-amber-500/8" : "border-amber-200 bg-amber-50"}`}>
            <p className={`text-[13px] font-semibold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
              <Warning size={14} className="inline me-1.5" weight="fill" />
              يرجى إدخال جميع البيانات المطلوبة (المحكمة، نوع الدعوى، قيمة النزاع).
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
