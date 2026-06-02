"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scales, MagnifyingGlass, ArrowLeft, ArrowRight,
  CheckCircle, Warning, Robot, Copy, DownloadSimple, Sparkle,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";

type Step = "input" | "analyzing" | "result";

export default function JudgmentWeigherPage() {
  const { isDark, isRTL } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [form, setForm] = useState({
    claimSummary: "",
    claimEvidence: "",
    defenseSummary: "",
    defenseEvidence: "",
    legalBasis: "",
  });
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const bg   = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const inputClass = `w-full rounded-xl border px-4 py-3 text-sm outline-none resize-none transition ${
    isDark ? "bg-[#0c0f12] border-[#2d3748] text-gray-200 placeholder:text-gray-600 focus:border-indigo-500"
           : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-400 focus:border-indigo-500"
  }`;

  const isValid = form.claimSummary.length > 20 && form.defenseSummary.length > 20;

  const handleAnalyze = () => {
    setStep("analyzing");
    setTimeout(() => setStep("result"), 2000);
  };

  const MOCK_RESULT = {
    score: { claimant: 65, respondent: 35 },
    strengths: ["الدليل المستندي للمدّعي موثّق ومتسق", "المطالبة مبنية على نص نظامي صريح", "الدفاع لم يُقدّم دليلاً مادياً مضاداً"],
    weaknesses: ["المدّعي لم يُثبت الضرر المالي بدليل كمّي", "يوجد تقادم جزئي على بعض البنود"],
    recommendation: "تميل الأدلة الحالية لصالح المدّعي بنسبة ٦٥٪. يُوصى بالنظر في تسوية جزئية أو استكمال الإثبات بشهادة خبير.",
  };
  const resultText = [
    "تقرير ترجيح الأدلة",
    "====================",
    `وزن المدّعي: ${MOCK_RESULT.score.claimant}%`,
    `وزن المدّعى عليه: ${MOCK_RESULT.score.respondent}%`,
    "",
    "نقاط القوة:",
    ...MOCK_RESULT.strengths.map((item) => `- ${item}`),
    "",
    "نقاط الضعف:",
    ...MOCK_RESULT.weaknesses.map((item) => `- ${item}`),
    "",
    `التوجيه التحليلي: ${MOCK_RESULT.recommendation}`,
  ].join("\n");

  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-indigo-500/10" : "bg-indigo-50"}`}>
            <Scales size={22} weight="duotone" className={isDark ? "text-indigo-400" : "text-indigo-600"} />
          </div>
          <div>
            <h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>مُرجّح الأحكام</h1>
            <p className={`text-xs ${muted}`}>أداة تحليلية تُقيّم أوزان الأدلة وتوجّه القاضي نحو حكم متوازن</p>
          </div>
          <span className={`ms-auto text-xs font-bold px-2.5 py-1 rounded-full ${isDark ? "bg-indigo-500/10 text-indigo-400" : "bg-indigo-100 text-indigo-600"}`}>
            أداة قاضي
          </span>
        </div>

        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div key="input" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="space-y-4">
              <div className={`${card} p-5 shadow-sm space-y-4`}>
                <h2 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>موقف المدّعي</h2>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${muted}`}>ملخص الدعوى والمطالبة</label>
                  <textarea rows={3} value={form.claimSummary} onChange={e => setForm({...form, claimSummary: e.target.value})}
                    placeholder="أدخل ملخص ادعاءات المدّعي وطلباته..." className={inputClass} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${muted}`}>الأدلة والمستندات المقدّمة</label>
                  <textarea rows={2} value={form.claimEvidence} onChange={e => setForm({...form, claimEvidence: e.target.value})}
                    placeholder="العقود، الفواتير، الشهادات، التقارير..." className={inputClass} />
                </div>
              </div>

              <div className={`${card} p-5 shadow-sm space-y-4`}>
                <h2 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>موقف المدّعى عليه</h2>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${muted}`}>ملخص الدفاع</label>
                  <textarea rows={3} value={form.defenseSummary} onChange={e => setForm({...form, defenseSummary: e.target.value})}
                    placeholder="أدخل ملخص دفاع المدّعى عليه وردوده..." className={inputClass} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${muted}`}>الأدلة المضادة</label>
                  <textarea rows={2} value={form.defenseEvidence} onChange={e => setForm({...form, defenseEvidence: e.target.value})}
                    placeholder="المستندات التي تدحض المطالبة..." className={inputClass} />
                </div>
              </div>

              <div className={`${card} p-5 shadow-sm`}>
                <label className={`block text-xs font-semibold mb-1.5 ${muted}`}>السند النظامي المنطبق (اختياري)</label>
                <textarea rows={2} value={form.legalBasis} onChange={e => setForm({...form, legalBasis: e.target.value})}
                  placeholder="نظام المرافعات، نظام العمل، المادة المنطبقة..." className={inputClass} />
              </div>

              <div className={`flex items-start gap-2 p-3 rounded-xl text-xs ${isDark ? "bg-amber-500/5 border border-amber-500/15" : "bg-amber-50 border border-amber-200"}`}>
                <Warning size={14} weight="fill" className="text-amber-500 shrink-0 mt-0.5" />
                <span className={isDark ? "text-amber-400/80" : "text-amber-700"}>
                  هذه أداة مساعدة للتحليل فقط — القرار القضائي يعود حصراً للقاضي بموجب ولايته القضائية.
                </span>
              </div>

              <button onClick={handleAnalyze} disabled={!isValid}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition ${
                  isValid ? "bg-indigo-600 text-white hover:bg-indigo-700" : "opacity-40 cursor-not-allowed bg-indigo-600 text-white"
                }`}>
                <Scales size={16} /> ترجيح الأدلة <Arrow size={14} />
              </button>
            </motion.div>
          )}

          {step === "analyzing" && (
            <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={`${card} p-16 shadow-sm text-center`}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="inline-flex mb-4">
                <Robot size={36} className={isDark ? "text-indigo-400" : "text-indigo-600"} weight="duotone" />
              </motion.div>
              <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>جارٍ تحليل الأدلة وترجيحها...</p>
              <p className={`text-xs mt-1 ${muted}`}>يتحقق من التوازن القانوني بين موقف الطرفين</p>
            </motion.div>
          )}

          {step === "result" && (
            <motion.div key="result" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-4">
              <BetaReviewGate toolId="gov.judgment-weigher" toolName="ترجيح الأدلة القضائية" reviewScope="legal-data">
              {/* Scale visual */}
              <div className={`${card} p-6 shadow-sm`}>
                <h2 className={`text-sm font-bold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>وزن الأدلة</h2>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-bold text-blue-500">المدّعي</span>
                      <span className="font-black text-blue-500">{MOCK_RESULT.score.claimant}٪</span>
                    </div>
                    <div className={`h-3 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"}`}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${MOCK_RESULT.score.claimant}%` }} transition={{ duration: 1 }}
                        className="h-full rounded-full bg-blue-500" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-bold text-rose-500">المدّعى عليه</span>
                      <span className="font-black text-rose-500">{MOCK_RESULT.score.respondent}٪</span>
                    </div>
                    <div className={`h-3 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"}`}>
                      <motion.div initial={{ width: 0 }} animate={{ width: `${MOCK_RESULT.score.respondent}%` }} transition={{ duration: 1, delay: 0.2 }}
                        className="h-full rounded-full bg-rose-500" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`${card} p-4 shadow-sm`}>
                  <h3 className="text-xs font-bold text-emerald-500 mb-3">نقاط القوة</h3>
                  <ul className="space-y-2">
                    {MOCK_RESULT.strengths.map((s, i) => (
                      <li key={i} className={`flex items-start gap-2 text-xs ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                        <CheckCircle size={13} weight="fill" className="text-emerald-500 shrink-0 mt-0.5" /> {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={`${card} p-4 shadow-sm`}>
                  <h3 className="text-xs font-bold text-amber-500 mb-3">نقاط الضعف</h3>
                  <ul className="space-y-2">
                    {MOCK_RESULT.weaknesses.map((w, i) => (
                      <li key={i} className={`flex items-start gap-2 text-xs ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                        <Warning size={13} weight="fill" className="text-amber-500 shrink-0 mt-0.5" /> {w}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className={`${card} p-5 shadow-sm`}>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkle size={15} className="text-indigo-500" weight="fill" />
                  <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>التوجيه التحليلي</h3>
                </div>
                <p className={`text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>{MOCK_RESULT.recommendation}</p>
              </div>

              <AiResultActions text={resultText} filename="gov-judgment-weighing" showShare />
              </BetaReviewGate>

              <div className="flex gap-3">
                <button onClick={() => { setStep("input"); setForm({ claimSummary: "", claimEvidence: "", defenseSummary: "", defenseEvidence: "", legalBasis: "" }); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition ${
                    isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}>
                  تحليل جديد
                </button>
                <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${
                  isDark ? "bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                }`}>
                  <Copy size={14} /> نسخ
                </button>
                <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${
                  isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}>
                  <DownloadSimple size={14} /> تحميل
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
