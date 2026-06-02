"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlass, Book, Robot, Copy, DownloadSimple,
  ArrowLeft, ArrowRight, CheckCircle, Warning, Sparkle,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";

type Step = "input" | "searching" | "result";

const MOCK_PRINCIPLES = [
  { number: "١", court: "محكمة الاستئناف الإدارية", date: "١٤٤٥/٠٣/١٢", text: "لا يُقبل الطعن في القرار الإداري إلا بعد استنفاد الطرق الإدارية وفق المادة السابعة والخمسين من نظام المرافعات." },
  { number: "٢", court: "المحكمة العليا", date: "١٤٤٤/١١/٠٥", text: "التقادم في الدعاوى التجارية يسري من تاريخ علم الدائن بالضرر أو من تاريخ وقوعه أيهما أقرب." },
  { number: "٣", court: "محكمة الاستئناف التجارية", date: "١٤٤٤/٠٨/٢٢", text: "عقد الإذعان لا يُعدّ باطلاً في مجمله بل تقع الشروط التعسفية فيه وحدها دون سواها." },
];

export default function JudicialSearchPage() {
  const { isDark, isRTL } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("تجاري");
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const bg   = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const inputClass = `w-full rounded-xl border px-4 py-3 text-sm outline-none transition ${
    isDark ? "bg-[#0c0f12] border-[#2d3748] text-gray-200 placeholder:text-gray-600 focus:border-indigo-500"
           : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-400 focus:border-indigo-500"
  }`;
  const resultText = [
    "نتائج بحث المبادئ القضائية",
    "====================",
    `التصنيف: ${category}`,
    `موضوع البحث: ${query || "غير محدد"}`,
    "",
    ...MOCK_PRINCIPLES.map((principle) => `${principle.number}. ${principle.court} — ${principle.date}\n${principle.text}`),
  ].join("\n");

  const handleSearch = () => {
    setStep("searching");
    setTimeout(() => setStep("result"), 2000);
  };

  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">

        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-indigo-500/10" : "bg-indigo-50"}`}>
            <MagnifyingGlass size={22} weight="duotone" className={isDark ? "text-indigo-400" : "text-indigo-600"} />
          </div>
          <div>
            <h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>باحث المبادئ القضائية</h1>
            <p className={`text-xs ${muted}`}>يستخرج المبادئ القضائية والسوابق ذات الصلة من قضايا مشابهة</p>
          </div>
          <span className={`ms-auto text-xs font-bold px-2.5 py-1 rounded-full ${isDark ? "bg-indigo-500/10 text-indigo-400" : "bg-indigo-100 text-indigo-600"}`}>أداة قاضي</span>
        </div>

        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div key="input" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="space-y-4">
              <div className={`${card} p-5 shadow-sm space-y-4`}>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${muted}`}>المسألة القانونية أو موضوع البحث</label>
                  <textarea rows={3} value={query} onChange={e => setQuery(e.target.value)}
                    placeholder="مثال: التقادم في العقود التجارية — الإذعان في عقود الاستهلاك..." className={inputClass} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${muted}`}>تصنيف الدعوى</label>
                  <div className="flex flex-wrap gap-2">
                    {["تجاري", "مدني", "عمالي", "إداري", "جزائي"].map(c => (
                      <button key={c} onClick={() => setCategory(c)}
                        className={`text-xs px-3 py-1.5 rounded-full font-bold transition ${
                          category === c
                            ? isDark ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40" : "bg-indigo-600 text-white"
                            : isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}>{c}</button>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={handleSearch} disabled={query.length < 10}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition ${
                  query.length >= 10 ? "bg-indigo-600 text-white hover:bg-indigo-700" : "opacity-40 cursor-not-allowed bg-indigo-600 text-white"
                }`}>
                <MagnifyingGlass size={16} /> ابحث في المبادئ <Arrow size={14} />
              </button>
            </motion.div>
          )}

          {step === "searching" && (
            <motion.div key="searching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className={`${card} p-16 shadow-sm text-center`}>
              <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
                className="inline-flex mb-4">
                <Book size={36} className={isDark ? "text-indigo-400" : "text-indigo-600"} weight="duotone" />
              </motion.div>
              <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>يبحث في قاعدة المبادئ القضائية...</p>
              <p className={`text-xs mt-1 ${muted}`}>قرارات المحكمة العليا · محاكم الاستئناف · المبادئ الموحّدة</p>
            </motion.div>
          )}

          {step === "result" && (
            <motion.div key="result" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <BetaReviewGate toolId="gov.judicial-search" toolName="بحث المبادئ القضائية" reviewScope="legal-data">
              <div className={`${card} p-4 shadow-sm flex items-center justify-between`}>
                <p className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{MOCK_PRINCIPLES.length} مبدأ وجدناه ذا صلة</p>
                <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${isDark ? "bg-indigo-500/10 text-indigo-400" : "bg-indigo-100 text-indigo-700"}`}>
                  {category}
                </span>
              </div>
              {MOCK_PRINCIPLES.map((p, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                  className={`${card} p-5 shadow-sm`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold ${isDark ? "text-[#C8A762]" : "text-indigo-700"}`}>{p.court}</span>
                    <span className={`text-xs ${muted}`}>{p.date}</span>
                  </div>
                  <p className={`text-sm leading-relaxed ${isDark ? "text-gray-200" : "text-gray-800"}`}>{p.text}</p>
                  <div className="flex gap-2 mt-3">
                    <button className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg transition ${
                      isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}><Copy size={11} /> نسخ</button>
                  </div>
                </motion.div>
              ))}
              <AiResultActions text={resultText} filename="gov-judicial-principles" showShare />
              </BetaReviewGate>
              <button onClick={() => { setStep("input"); setQuery(""); }}
                className={`w-full py-2.5 rounded-xl text-sm font-bold transition ${
                  isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}>بحث جديد</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
