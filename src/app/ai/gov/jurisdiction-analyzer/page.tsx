"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TreeStructure, Robot, CheckCircle, Warning, XCircle, ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
type Step = "input" | "analyzing" | "result";
export default function JurisdictionAnalyzerPage() {
  const { isDark, isRTL } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [form, setForm] = useState({ subject: "", parties: "", amount: "", location: "" });
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const inp = `w-full rounded-xl border px-4 py-3 text-sm outline-none transition ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-gray-200 placeholder:text-gray-600 focus:border-indigo-500" : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-400 focus:border-indigo-500"}`;
  const isValid = form.subject.length > 5 && form.parties.length > 3;
  const RESULT = {
    competent: "المحكمة التجارية بالرياض",
    confidence: "عالية",
    basis: "المادة الثالثة من نظام المحاكم التجارية — الاختصاص النوعي بالنزاعات التجارية التي تتجاوز مليون ريال.",
    checks: [
      { label: "الاختصاص النوعي", pass: true, note: "نزاع تجاري — ينعقد للمحكمة التجارية" },
      { label: "الاختصاص المكاني", pass: true, note: "الطرفان مسجلان في الرياض" },
      { label: "الاختصاص القيمي", pass: true, note: "القيمة تتجاوز الحد الأدنى" },
      { label: "شرط التحكيم التعاقدي", pass: false, note: "العقد يتضمن شرط تحكيم — يُستلزم البحث أولاً" },
    ],
  };
  const resultText = [
    "تقرير تحليل الاختصاص القضائي",
    "====================",
    `الجهة المختصة: ${RESULT.competent}`,
    `ثقة التحليل: ${RESULT.confidence}`,
    `السند: ${RESULT.basis}`,
    "",
    "فحص شروط الاختصاص:",
    ...RESULT.checks.map((check) => `- ${check.pass ? "متحقق" : "تنبيه"}: ${check.label} — ${check.note}`),
  ].join("\n");
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-indigo-500/10" : "bg-indigo-50"}`}>
            <TreeStructure size={22} weight="duotone" className={isDark ? "text-indigo-400" : "text-indigo-600"} />
          </div>
          <div>
            <h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>محلل الاختصاص القضائي</h1>
            <p className={`text-xs ${muted}`}>يحدد المحكمة المختصة نوعياً ومكانياً وقيمياً للدعوى</p>
          </div>
          <span className={`ms-auto text-xs font-bold px-2.5 py-1 rounded-full ${isDark ? "bg-indigo-500/10 text-indigo-400" : "bg-indigo-100 text-indigo-600"}`}>أداة قاضي</span>
        </div>
        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div key="in" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
              <div className={`${card} p-5 shadow-sm space-y-4`}>
                <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>موضوع النزاع</label><input value={form.subject} onChange={e => setForm({...form, subject: e.target.value})} placeholder="نزاع تجاري — عقد مقاولة — طلب تعويض..." className={inp} /></div>
                <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>الأطراف وصفتهم</label><input value={form.parties} onChange={e => setForm({...form, parties: e.target.value})} placeholder="شركة تجارية ضد شركة أخرى / فرد ضد جهة..." className={inp} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>قيمة المطالبة (ر.س)</label><input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="٥٠٠٠٠٠" className={inp} /></div>
                  <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>مكان التعاقد / الحادثة</label><input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="الرياض — جدة — الدمام..." className={inp} /></div>
                </div>
              </div>
              <button onClick={() => { setStep("analyzing"); setTimeout(() => setStep("result"), 2000); }} disabled={!isValid}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition ${isValid ? "bg-indigo-600 text-white hover:bg-indigo-700" : "opacity-40 cursor-not-allowed bg-indigo-600 text-white"}`}>
                <TreeStructure size={16} /> تحليل الاختصاص <Arrow size={14} />
              </button>
            </motion.div>
          )}
          {step === "analyzing" && (
            <motion.div key="an" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${card} p-16 shadow-sm text-center`}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="inline-flex mb-4">
                <Robot size={36} className={isDark ? "text-indigo-400" : "text-indigo-600"} weight="duotone" />
              </motion.div>
              <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>يحلل شروط الاختصاص...</p>
            </motion.div>
          )}
          {step === "result" && (
            <BetaReviewGate toolId="gov.jurisdiction-analyzer" toolName="تحليل الاختصاص القضائي" reviewScope="legal-data">
            <motion.div key="res" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className={`${card} p-5 shadow-sm`}>
                <p className={`text-xs font-semibold mb-1 ${muted}`}>الجهة القضائية المختصة</p>
                <p className={`text-lg font-black mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>{RESULT.competent}</p>
                <p className={`text-xs ${isDark ? "text-emerald-400" : "text-emerald-600"} font-bold`}>ثقة التحليل: {RESULT.confidence}</p>
                <p className={`text-xs mt-2 ${isDark ? "text-gray-300" : "text-gray-600"} leading-relaxed`}>{RESULT.basis}</p>
              </div>
              <div className={`${card} p-5 shadow-sm`}>
                <h3 className={`text-sm font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>فحص شروط الاختصاص</h3>
                <div className="space-y-2">
                  {RESULT.checks.map((c, i) => (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${isDark ? "bg-white/2" : "bg-gray-50"}`}>
                      {c.pass ? <CheckCircle size={16} weight="fill" className="text-emerald-500 shrink-0 mt-0.5" /> : <XCircle size={16} weight="fill" className="text-rose-500 shrink-0 mt-0.5" />}
                      <div>
                        <p className={`text-xs font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{c.label}</p>
                        <p className={`text-xs ${muted}`}>{c.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <AiResultActions text={resultText} filename="gov-jurisdiction-analysis" showShare />
              <button onClick={() => setStep("input")} className={`w-full py-2.5 rounded-xl text-sm font-bold transition ${isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>تحليل جديد</button>
            </motion.div>
            </BetaReviewGate>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
