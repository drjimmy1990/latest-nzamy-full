"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Fingerprint, Robot, Copy, DownloadSimple, Warning, Sparkle, ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
type Step = "input" | "analyzing" | "result";
export default function EvidenceAnalyzerPage() {
  const { isDark, isRTL } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [form, setForm] = useState({ crimeType: "", evidence: "", accused: "" });
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const inp = `w-full rounded-xl border px-4 py-3 text-sm outline-none resize-none transition ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-gray-200 placeholder:text-gray-600 focus:border-indigo-500" : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-400 focus:border-indigo-500"}`;
  const isValid = form.crimeType.length > 3 && form.evidence.length > 20;
  const RESULT = {
    strength: "قوية — تستوجب المحاكمة",
    score: 78,
    gaps: ["لم يُجرَ فحص جنائي رقمي للجهاز المحجوز", "الشاهد الثاني لم يؤدِّ شهادته رسمياً"],
    recommendation: "الأدلة الحالية كافية لإحالة القضية للمحاكمة. يُوصى باستكمال التحليل الجنائي الرقمي لتعزيز الملف قبل الجلسة الأولى.",
  };
  const resultText = [
    "تقرير تحليل الأدلة الجنائية",
    "====================",
    `قوة الملف: ${RESULT.strength}`,
    `الدرجة: ${RESULT.score}%`,
    "",
    "ثغرات يُوصى بمعالجتها:",
    ...RESULT.gaps.map((gap) => `- ${gap}`),
    "",
    `التوصية: ${RESULT.recommendation}`,
  ].join("\n");
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-rose-500/10" : "bg-rose-50"}`}>
            <Fingerprint size={22} weight="duotone" className={isDark ? "text-rose-400" : "text-rose-600"} />
          </div>
          <div>
            <h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>محلل الأدلة الجنائية</h1>
            <p className={`text-xs ${muted}`}>يُقيّم قوة الأدلة ويكشف الثغرات في الملف التحقيقي</p>
          </div>
          <span className={`ms-auto text-xs font-bold px-2.5 py-1 rounded-full ${isDark ? "bg-rose-500/10 text-rose-400" : "bg-rose-100 text-rose-600"}`}>أداة نيابة</span>
        </div>
        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div key="in" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
              <div className={`${card} p-5 shadow-sm space-y-4`}>
                <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>نوع الجريمة</label><input value={form.crimeType} onChange={e => setForm({...form, crimeType: e.target.value})} placeholder="احتيال مالي — سرقة — اختلاس..." className={inp} /></div>
                <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>الأدلة والمستندات المتوفرة</label><textarea rows={4} value={form.evidence} onChange={e => setForm({...form, evidence: e.target.value})} placeholder="اسرد الأدلة المادية والرقمية والبشرية..." className={inp} /></div>
                <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>معلومات المتهم (اختياري)</label><input value={form.accused} onChange={e => setForm({...form, accused: e.target.value})} placeholder="السوابق الجنائية، الملاحظات..." className={inp} /></div>
              </div>
              <div className={`flex items-start gap-2 p-3 rounded-xl text-xs ${isDark ? "bg-amber-500/5 border border-amber-500/15" : "bg-amber-50 border border-amber-200"}`}>
                <Warning size={14} weight="fill" className="text-amber-500 shrink-0 mt-0.5" />
                <span className={isDark ? "text-amber-400/80" : "text-amber-700"}>التحليل مساعد للتحقيق — القرار التحقيقي يعود للمحقق المختص.</span>
              </div>
              <button onClick={() => { setStep("analyzing"); setTimeout(() => setStep("result"), 2000); }} disabled={!isValid}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition ${isValid ? "bg-rose-600 text-white hover:bg-rose-700" : "opacity-40 cursor-not-allowed bg-rose-600 text-white"}`}>
                <Fingerprint size={16} /> تحليل الأدلة <Arrow size={14} />
              </button>
            </motion.div>
          )}
          {step === "analyzing" && (
            <motion.div key="an" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${card} p-16 shadow-sm text-center`}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="inline-flex mb-4">
                <Robot size={36} className={isDark ? "text-rose-400" : "text-rose-600"} weight="duotone" />
              </motion.div>
              <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>يُقيّم قوة الأدلة...</p>
            </motion.div>
          )}
          {step === "result" && (
            <motion.div key="res" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <BetaReviewGate toolId="gov.evidence-analyzer" toolName="تحليل الأدلة الجنائية" reviewScope="legal-data">
              <div className={`${card} p-5 shadow-sm`}>
                <div className="flex items-center justify-between mb-3">
                  <p className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>قوة الملف التحقيقي</p>
                  <span className={`text-xs font-black px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500`}>{RESULT.strength}</span>
                </div>
                <div className={`h-3 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"} mb-1`}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${RESULT.score}%` }} transition={{ duration: 1 }} className="h-full rounded-full bg-emerald-500" />
                </div>
                <p className={`text-xs text-end font-black text-emerald-500`}>{RESULT.score}٪</p>
              </div>
              <div className={`${card} p-5 shadow-sm`}>
                <h3 className={`text-xs font-bold text-amber-500 mb-2`}>ثغرات يُوصى بمعالجتها</h3>
                <ul className="space-y-2">{RESULT.gaps.map((g, i) => (<li key={i} className={`flex items-start gap-2 text-xs ${isDark ? "text-gray-300" : "text-gray-700"}`}><Warning size={12} weight="fill" className="text-amber-500 shrink-0 mt-0.5" />{g}</li>))}</ul>
              </div>
              <div className={`${card} p-5 shadow-sm`}>
                <div className="flex items-center gap-2 mb-2"><Sparkle size={13} className="text-rose-500" weight="fill" /><h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>التوصية</h3></div>
                <p className={`text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>{RESULT.recommendation}</p>
              </div>
              <AiResultActions text={resultText} filename="gov-evidence-analysis" showShare />
              </BetaReviewGate>
              <div className="flex gap-3">
                <button onClick={() => setStep("input")} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>تحليل جديد</button>
                <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold ${isDark ? "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20" : "bg-rose-50 text-rose-700 hover:bg-rose-100"} transition`}><Copy size={14} /> نسخ</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
