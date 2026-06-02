"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Info, ChartBar, Warning, CheckCircle, ArrowCounterClockwise,
  Receipt, Scales
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type TerminationType = "resignation" | "employer_without_cause" | "employer_with_cause" | "mutual" | "contract_end";

interface LaborInputs {
  salary:       string;   // ريال/شهر
  housingAllowance: string;
  otherAllowances: string;
  yearsOfService: string;
  monthsOfService: string; // < 12 months
  terminationType: TerminationType | "";
  hasUnusedLeave: boolean;
  unusedLeaveDays: string;
  hasNoticePeriod: boolean;
  noticePeriodMonths: string;
}

const TERMINATION_TYPES: { id: TerminationType; label: string; desc: string; color: string }[] = [
  { id: "resignation",            label: "استقالة طوعية",           desc: "المستخدم أنهى العقد بإرادته",              color: "text-blue-500" },
  { id: "employer_without_cause", label: "فصل تعسفي (بلا سبب)",     desc: "صاحب العمل أنهى دون خطأ من الموظف",       color: "text-red-500" },
  { id: "employer_with_cause",    label: "فصل بسبب مشروع",           desc: "ارتكب الموظف مخالفة تبرر الفصل",           color: "text-orange-500" },
  { id: "mutual",                 label: "إنهاء بالتراضي",           desc: "اتفق الطرفان على إنهاء العلاقة",           color: "text-emerald-500" },
  { id: "contract_end",           label: "انتهاء العقد المحدد المدة", desc: "انتهاء مدة العقد دون تجديد",              color: "text-purple-500" },
];

// ─── Labor Rights Computation ─────────────────────────────────────────────────
// يستند إلى: المادة 84، 85، 109-116 من نظام العمل المحدَّث 2025

interface LaborResult {
  gratuity:    number;
  noticePay:   number;
  leavePay:    number;
  noticePeriodRequired: number; // months
  entitlements: { label: string; amount: number; article: string }[];
  total: number;
  notes: string[];
  isEligibleGratuity: boolean;
}

function calcLaborRights(inp: LaborInputs): LaborResult | null {
  if (!inp.salary || !inp.terminationType || (!inp.yearsOfService && !inp.monthsOfService)) return null;

  const baseSalary = parseFloat(inp.salary.replace(/,/g, "")) || 0;
  const housing    = parseFloat(inp.housingAllowance.replace(/,/g, "")) || 0;
  const other      = parseFloat(inp.otherAllowances.replace(/,/g, "")) || 0;
  const fullSalary = baseSalary + housing + other;
  const years      = parseFloat(inp.yearsOfService) || 0;
  const months     = parseFloat(inp.monthsOfService) || 0;
  const totalYears = years + (months / 12);

  const notes: string[] = [];
  let gratuity = 0;
  let noticePay = 0;
  let leavePay = 0;
  let isEligibleGratuity = true;

  // ─── نظام العمل — المادة 84 ──────────────────────────────────────────────
  // مكافأة نهاية الخدمة:
  // - سنوات 1-4: نصف شهر عن كل سنة
  // - سنوات 5+: شهر كامل عن كل سنة

  if (inp.terminationType === "resignation") {
    if (totalYears < 2) {
      isEligibleGratuity = false;
      notes.push("الاستقالة قبل سنتين: لا يستحق مكافأة نهاية الخدمة (المادة 85).");
    } else if (totalYears < 5) {
      gratuity = (baseSalary / 2) * Math.min(totalYears, 4);
      notes.push("استقالة بين 2-5 سنوات: يُصرف ثلث المكافأة (المادة 85).");
      gratuity = gratuity * (1/3);
    } else if (totalYears < 10) {
      const firstFour = (baseSalary / 2) * 4;
      const remaining = baseSalary * (totalYears - 4);
      gratuity = (firstFour + remaining) * (2/3);
      notes.push("استقالة بين 5-10 سنوات: يُصرف ثلثا المكافأة (المادة 85).");
    } else {
      const firstFour = (baseSalary / 2) * 4;
      const remaining = baseSalary * (totalYears - 4);
      gratuity = firstFour + remaining;
      notes.push("استقالة بعد 10 سنوات: يستحق المكافأة كاملة (المادة 85).");
    }
  } else if (inp.terminationType === "employer_with_cause") {
    isEligibleGratuity = false;
    notes.push("الفصل بسبب مشروع وفق المادة 80: لا يستحق مكافأة نهاية الخدمة كاملة — يُراجَع المحامي لتحديد التفاصيل.");
  } else {
    // Employer without cause / mutual / contract end
    if (totalYears > 0) {
      const firstFour = (baseSalary / 2) * Math.min(totalYears, 4);
      const remaining = totalYears > 4 ? baseSalary * (totalYears - 4) : 0;
      gratuity = firstFour + remaining;
    }
  }

  // ─── إشعار الإنهاء (المادة 75) ──────────────────────────────────────────
  // 60 يوم للعقود غير المحددة المدة إذا تجاوزت 5 سنوات ، وإلا 30 يوم
  const requiredNotice = totalYears >= 5 ? 2 : 1; // months

  if (inp.terminationType === "employer_without_cause" || inp.terminationType === "mutual") {
    if (!inp.hasNoticePeriod) {
      noticePay = fullSalary * requiredNotice;
      notes.push(`مكافأة بدل إشعار ${requiredNotice === 2 ? "٦٠" : "٣٠"} يوماً لعدم الإشعار المسبق (المادة 75).`);
    } else if (inp.noticePeriodMonths) {
      const givenMonths = parseFloat(inp.noticePeriodMonths) || 0;
      const diff = requiredNotice - givenMonths;
      if (diff > 0) {
        noticePay = fullSalary * diff;
        notes.push("تم احتساب فارق مدة الإشعار.");
      }
    }
  }

  // ─── الإجازة السنوية (المادة 109) ──────────────────────────────────────
  if (inp.hasUnusedLeave && inp.unusedLeaveDays) {
    const days = parseFloat(inp.unusedLeaveDays) || 0;
    leavePay = (fullSalary / 30) * days;
    notes.push(`تم احتساب بدل ${days} يوم إجازة غير مستخدمة (المادة 109).`);
  }

  const entitlements: { label: string; amount: number; article: string }[] = [
    { label: "مكافأة نهاية الخدمة", amount: Math.round(gratuity), article: "م. 84-85" },
    { label: "بدل الإشعار", amount: Math.round(noticePay), article: "م. 75" },
    { label: "بدل الإجازة السنوية غير المستخدمة", amount: Math.round(leavePay), article: "م. 109" },
  ].filter(e => e.amount > 0);

  return {
    gratuity: Math.round(gratuity),
    noticePay: Math.round(noticePay),
    leavePay: Math.round(leavePay),
    noticePeriodRequired: requiredNotice,
    entitlements,
    total: Math.round(gratuity + noticePay + leavePay),
    notes,
    isEligibleGratuity,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CalcLaborRights() {
  const { isDark } = useTheme();
  const [inp, setInp] = useState<LaborInputs>({
    salary: "", housingAllowance: "", otherAllowances: "",
    yearsOfService: "", monthsOfService: "",
    terminationType: "",
    hasUnusedLeave: false, unusedLeaveDays: "",
    hasNoticePeriod: false, noticePeriodMonths: "",
  });
  const [result, setResult] = useState<LaborResult | null>(null);
  const [done, setDone] = useState(false);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-sm";

  const inp_style = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400"}`;

  const calc = () => { setResult(calcLaborRights(inp)); setDone(true); };
  const reset = () => {
    setInp({ salary: "", housingAllowance: "", otherAllowances: "", yearsOfService: "", monthsOfService: "", terminationType: "", hasUnusedLeave: false, unusedLeaveDays: "", hasNoticePeriod: false, noticePeriodMonths: "" });
    setResult(null); setDone(false);
  };

  const canCalc = !!inp.salary && !!inp.terminationType && (!!inp.yearsOfService || !!inp.monthsOfService);

  const labelCls = `block text-[11px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`;

  return (
    <div className="space-y-5">

      {/* 2025 notice banner */}
      <div className={`flex gap-3 p-3.5 rounded-2xl border ${isDark ? "border-emerald-700/30 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"}`}>
        <CheckCircle size={16} className="text-emerald-500 flex-shrink-0 mt-0.5" weight="fill" />
        <p className={`text-[12px] ${isDark ? "text-emerald-300" : "text-emerald-800"}`}>
          <span className="font-bold">نظام العمل المحدَّث 2025:</span> تم تحديث الحد الأدنى لمكافأة نهاية الخدمة وإجازات الأمومة/الأبوة. الحسابات مستندة لآخر التعديلات.
        </p>
      </div>

      {/* Form */}
      <div className={`${card} p-5 space-y-5`}>

        {/* Salary */}
        <div>
          <label className={labelCls}>الراتب الأساسي (ريال/شهر)</label>
          <input type="text" placeholder="مثال: 8,000" value={inp.salary}
            onChange={e => setInp(p => ({ ...p, salary: e.target.value }))} className={inp_style} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>بدل السكن</label>
            <input type="text" placeholder="اختياري" value={inp.housingAllowance}
              onChange={e => setInp(p => ({ ...p, housingAllowance: e.target.value }))} className={inp_style} />
          </div>
          <div>
            <label className={labelCls}>بدلات أخرى</label>
            <input type="text" placeholder="اختياري" value={inp.otherAllowances}
              onChange={e => setInp(p => ({ ...p, otherAllowances: e.target.value }))} className={inp_style} />
          </div>
        </div>

        {/* Service duration */}
        <div>
          <label className={labelCls}>مدة الخدمة</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <input type="number" min="0" placeholder="سنوات" value={inp.yearsOfService}
                onChange={e => setInp(p => ({ ...p, yearsOfService: e.target.value }))} className={inp_style} />
            </div>
            <div>
              <input type="number" min="0" max="11" placeholder="شهور (< 11)" value={inp.monthsOfService}
                onChange={e => setInp(p => ({ ...p, monthsOfService: e.target.value }))} className={inp_style} />
            </div>
          </div>
        </div>

        {/* Termination type */}
        <div>
          <label className={labelCls}>طريقة إنهاء العقد</label>
          <div className="space-y-2">
            {TERMINATION_TYPES.map(t => (
              <button key={t.id} onClick={() => setInp(p => ({ ...p, terminationType: t.id }))}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-right transition-all ${inp.terminationType === t.id ? isDark ? "border-[#C8A762]/40 bg-[#C8A762]/8" : "border-[#C8A762]/40 bg-[#C8A762]/5" : isDark ? "border-white/[0.06] hover:border-white/10" : "border-slate-100 hover:border-slate-200"}`}>
                <Scales size={14} className={inp.terminationType === t.id ? "text-[#C8A762]" : isDark ? "text-zinc-600" : "text-slate-300"} />
                <div className="flex-1 text-right">
                  <p className={`text-[12px] font-bold ${inp.terminationType === t.id ? "text-[#C8A762]" : isDark ? "text-zinc-300" : "text-slate-700"}`}>{t.label}</p>
                  <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{t.desc}</p>
                </div>
                {inp.terminationType === t.id && <CheckCircle size={14} className="text-[#C8A762]" weight="fill" />}
              </button>
            ))}
          </div>
        </div>

        {/* Unused leave */}
        <div className={`rounded-xl border p-3.5 space-y-3 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <div className="flex items-center justify-between">
            <label className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>يوجد إجازة سنوية غير مستخدمة؟</label>
            <button onClick={() => setInp(p => ({ ...p, hasUnusedLeave: !p.hasUnusedLeave }))}
              className={`w-10 h-5 rounded-full transition-all ${inp.hasUnusedLeave ? "bg-[#0B3D2E]" : isDark ? "bg-zinc-700" : "bg-slate-200"}`}>
              <motion.div animate={{ x: inp.hasUnusedLeave ? 20 : 2 }} className="w-4 h-4 rounded-full bg-white shadow-sm" />
            </button>
          </div>
          {inp.hasUnusedLeave && (
            <input type="number" min="0" placeholder="عدد الأيام غير المستخدمة" value={inp.unusedLeaveDays}
              onChange={e => setInp(p => ({ ...p, unusedLeaveDays: e.target.value }))} className={inp_style} />
          )}
        </div>

        {/* Notice period */}
        <div className={`rounded-xl border p-3.5 space-y-3 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <div className="flex items-center justify-between">
            <label className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>هل أُعطي إشعار مسبق بالإنهاء؟</label>
            <button onClick={() => setInp(p => ({ ...p, hasNoticePeriod: !p.hasNoticePeriod }))}
              className={`w-10 h-5 rounded-full transition-all ${inp.hasNoticePeriod ? "bg-[#0B3D2E]" : isDark ? "bg-zinc-700" : "bg-slate-200"}`}>
              <motion.div animate={{ x: inp.hasNoticePeriod ? 20 : 2 }} className="w-4 h-4 rounded-full bg-white shadow-sm" />
            </button>
          </div>
          {inp.hasNoticePeriod && (
            <input type="number" min="0" placeholder="عدد الأشهر المُعطاة" value={inp.noticePeriodMonths}
              onChange={e => setInp(p => ({ ...p, noticePeriodMonths: e.target.value }))} className={inp_style} />
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={calc} disabled={!canCalc}
            className={`flex-1 py-3 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 transition-all ${canCalc ? "bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50] text-white shadow-md" : isDark ? "bg-white/[0.04] text-zinc-600 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}>
            <Users size={15} weight="duotone" /> احسب مستحقات العمل
          </button>
          {done && <button onClick={reset} className={`px-4 py-3 rounded-xl border text-[12px] ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}><ArrowCounterClockwise size={14} /></button>}
        </div>
      </div>

      {/* Results */}
      <AnimatePresence>
        {done && result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* Total highlight */}
            <div className={`p-5 rounded-2xl border-2 ${isDark ? "border-[#C8A762]/30 bg-[#C8A762]/5" : "border-[#C8A762]/40 bg-amber-50"} text-center`}>
              <p className={`text-[12px] font-semibold mb-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>إجمالي المستحقات التقديرية</p>
              <p className={`text-[32px] font-black font-mono ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
                {result.total.toLocaleString()} <span className="text-[16px]">ر.س</span>
              </p>
            </div>

            {/* Breakdown */}
            <div className={`${card} p-5`}>
              <div className="flex items-center gap-2 mb-4">
                <Receipt size={15} className="text-[#C8A762]" weight="duotone" />
                <h3 className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تفصيل المستحقات</h3>
              </div>
              <div className="space-y-3">
                {result.entitlements.map((e, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <span className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{e.label}</span>
                      <span className={`ms-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isDark ? "bg-white/[0.06] text-zinc-500" : "bg-slate-100 text-slate-400"}`}>{e.article}</span>
                    </div>
                    <span className={`text-[13px] font-black font-mono ${isDark ? "text-zinc-200" : "text-slate-800"}`}>
                      {e.amount.toLocaleString()} ر.س
                    </span>
                  </div>
                ))}
                {result.entitlements.length === 0 && (
                  <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا توجد مستحقات بناءً على المعطيات المُدخلة.</p>
                )}
              </div>
            </div>

            {/* Legal notes */}
            {result.notes.length > 0 && (
              <div className={`rounded-2xl border p-4 space-y-2 ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
                <p className={`text-[11px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-amber-400" : "text-amber-700"}`}>ملاحظات قانونية</p>
                {result.notes.map((n, i) => (
                  <p key={i} className={`text-[12px] leading-relaxed ${isDark ? "text-amber-300/80" : "text-amber-800"}`}>
                    <Warning size={11} className="inline me-1" weight="fill" />{n}
                  </p>
                ))}
              </div>
            )}

            <div className={`flex gap-3 p-4 rounded-2xl border ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
              <Info size={14} className={`flex-shrink-0 mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`} />
              <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                هذه التقديرات لأغراض استرشادية. المستحقات الفعلية تحددها المحكمة العمالية عند النزاع. الأرقام مستندة لنظام العمل السعودي المحدَّث 2025 (المواد 75، 84، 85، 109–116).
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
