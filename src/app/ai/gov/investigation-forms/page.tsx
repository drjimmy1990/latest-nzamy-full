"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ClipboardText, Robot, Copy, DownloadSimple, Warning, ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
type Step = "input" | "generating" | "result";
const TEMPLATES = ["محضر إفادة شاهد","محضر استجواب متهم","طلب تفتيش","أمر ضبط وإحضار","طلب الاستعانة بخبير"];
export default function InvestigationFormsPage() {
  const { isDark, isRTL } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [selected, setSelected] = useState(TEMPLATES[0]);
  const [details, setDetails] = useState("");
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const inp = `w-full rounded-xl border px-4 py-3 text-sm outline-none resize-none transition ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-gray-200 placeholder:text-gray-600 focus:border-indigo-500" : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-400 focus:border-indigo-500"}`;
  const DRAFT = `النموذج: ${selected}\n\nبسم الله الرحمن الرحيم\nالمملكة العربية السعودية — النيابة العامة\n\nتاريخ: …/…/١٤٤٦ هـ\nالرقم المرجعي: NP-…\n\n[بيانات القضية وتفاصيلها]\n${details}\n\n[الجهة المختصة تملأ هذا الجزء]\n\nالمحقق: _______________ التوقيع: _______________`;
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-rose-500/10" : "bg-rose-50"}`}><ClipboardText size={22} weight="duotone" className={isDark ? "text-rose-400" : "text-rose-600"} /></div>
          <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>نماذج التحقيق</h1><p className={`text-xs ${muted}`}>يُعدّ نماذج التحقيق والضبط وفق أنظمة النيابة العامة</p></div>
          <span className={`ms-auto text-xs font-bold px-2.5 py-1 rounded-full ${isDark ? "bg-rose-500/10 text-rose-400" : "bg-rose-100 text-rose-600"}`}>أداة نيابة</span>
        </div>
        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div key="in" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
              <div className={`${card} p-5 shadow-sm space-y-4`}>
                <div>
                  <label className={`block text-xs font-semibold mb-2 ${muted}`}>نوع النموذج</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {TEMPLATES.map(t => (
                      <button key={t} onClick={() => setSelected(t)}
                        className={`text-start text-xs px-3 py-2.5 rounded-xl font-semibold border transition ${selected === t ? isDark ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : "border-rose-400 bg-rose-50 text-rose-700" : isDark ? "border-[#2d3748] bg-white/2 text-gray-400 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>تفاصيل القضية</label><textarea rows={3} value={details} onChange={e => setDetails(e.target.value)} placeholder="اسم المتهم/الشاهد، رقم القضية، الوقائع المختصرة..." className={inp} /></div>
              </div>
              <button onClick={() => { setStep("generating"); setTimeout(() => setStep("result"), 2000); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-rose-600 text-white hover:bg-rose-700 transition">
                <ClipboardText size={16} /> إنشاء النموذج <Arrow size={14} />
              </button>
            </motion.div>
          )}
          {step === "generating" && (
            <motion.div key="an" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${card} p-16 shadow-sm text-center`}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="inline-flex mb-4"><Robot size={36} className={isDark ? "text-rose-400" : "text-rose-600"} weight="duotone" /></motion.div>
              <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>جارٍ إنشاء النموذج...</p>
            </motion.div>
          )}
          {step === "result" && (
            <motion.div key="res" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <BetaReviewGate toolId="gov.investigation-forms" toolName="نموذج التحقيق" reviewScope="legal-data">
              <div className={`${card} p-5 shadow-sm`}>
                <p className={`text-xs font-bold mb-3 ${isDark ? "text-rose-400" : "text-rose-600"}`}>{selected}</p>
                <pre className={`text-xs leading-7 whitespace-pre-wrap font-sans ${isDark ? "text-gray-300" : "text-gray-700"}`}>{DRAFT}</pre>
              </div>
              <AiResultActions text={DRAFT} filename="gov-investigation-form" showShare />
              </BetaReviewGate>
              <div className="flex gap-3">
                <button onClick={() => setStep("input")} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-gray-100 text-gray-700 hover:bg-gray-200"} transition`}>نموذج جديد</button>
                <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold ${isDark ? "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20" : "bg-rose-50 text-rose-700 hover:bg-rose-100"} transition`}><Copy size={14} /> نسخ</button>
                <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold ${isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"} transition`}><DownloadSimple size={14} /> تحميل</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
