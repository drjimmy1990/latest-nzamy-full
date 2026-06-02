"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Buildings, Robot, Copy, DownloadSimple, Warning, CheckCircle, XCircle, ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
type Step = "input" | "reviewing" | "result";
export default function ProcurementReviewerPage() {
  const { isDark, isRTL } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [form, setForm] = useState({ type: "منافسة عامة", value: "", entity: "", details: "" });
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const inp = `w-full rounded-xl border px-4 py-3 text-sm outline-none resize-none transition ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-gray-200 placeholder:text-gray-600 focus:border-indigo-500" : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-400 focus:border-indigo-500"}`;
  const isValid = form.value.length > 0 && form.entity.length > 2;
  const CHECKS = [
    { text: "إعلان المنافسة في البوابة الرسمية قبل ٣٠ يوماً", pass: true },
    { text: "توثيق لجنة الفتح وكشف الأسعار", pass: true },
    { text: "التحقق من عدم تعارض مصالح أعضاء اللجنة", pass: true },
    { text: "استيفاء حد النصاب الكمي للمتنافسين (٣ على الأقل)", pass: false, note: "تم تلقي عرضين فقط — يُستلزم تحديد السبب" },
    { text: "الرقم الموحد للمورد مُفعَّل في المنصة", pass: true },
  ];
  const resultText = [
    "تقرير مراجعة المنافسات والمشتريات",
    "====================",
    `نوع الإجراء: ${form.type}`,
    `قيمة العقد: ${form.value || "غير محددة"}`,
    `الجهة الحكومية: ${form.entity || "غير محددة"}`,
    "",
    "نتائج المراجعة:",
    ...CHECKS.map((check) => `- ${check.pass ? "مطابق" : "مخالفة/تنبيه"}: ${check.text}${check.note ? ` — ${check.note}` : ""}`),
  ].join("\n");
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-teal-500/10" : "bg-teal-50"}`}><Buildings size={22} weight="duotone" className={isDark ? "text-teal-400" : "text-teal-600"} /></div>
          <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>مراجع المنافسات والمشتريات</h1><p className={`text-xs ${muted}`}>يُراجع مطابقة إجراءات المنافسة لنظام المنافسات والمشتريات الحكومية</p></div>
          <span className={`ms-auto text-xs font-bold px-2.5 py-1 rounded-full ${isDark ? "bg-teal-500/10 text-teal-400" : "bg-teal-100 text-teal-600"}`}>أداة مستشار</span>
        </div>
        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div key="in" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
              <div className={`${card} p-5 shadow-sm space-y-3`}>
                <div><label className={`block text-xs font-semibold mb-2 ${muted}`}>نوع إجراء التعاقد</label>
                  <div className="flex flex-wrap gap-2">
                    {["منافسة عامة","منافسة محدودة","أمر شراء مباشر","اتفاقية إطارية"].map(t => (
                      <button key={t} onClick={() => setForm({...form, type: t})}
                        className={`text-xs px-3 py-1.5 rounded-full font-bold transition ${form.type === t ? isDark ? "bg-teal-500/20 text-teal-300 border border-teal-500/40" : "bg-teal-600 text-white" : isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>قيمة العقد (ر.س)</label><input type="number" value={form.value} onChange={e => setForm({...form, value: e.target.value})} placeholder="٥٠٠٠٠٠" className={inp} /></div>
                  <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>الجهة الحكومية</label><input value={form.entity} onChange={e => setForm({...form, entity: e.target.value})} placeholder="وزارة — هيئة..." className={inp} /></div>
                </div>
                <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>تفاصيل إجراءات المنافسة</label><textarea rows={3} value={form.details} onChange={e => setForm({...form, details: e.target.value})} placeholder="أدخل الإجراءات المتّبعة حتى الآن..." className={inp} /></div>
              </div>
              <button onClick={() => { setStep("reviewing"); setTimeout(() => setStep("result"), 2000); }} disabled={!isValid}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition ${isValid ? "bg-teal-600 text-white hover:bg-teal-700" : "opacity-40 cursor-not-allowed bg-teal-600 text-white"}`}>
                <Buildings size={16} /> مراجعة إجراءات المنافسة <Arrow size={14} />
              </button>
            </motion.div>
          )}
          {step === "reviewing" && (
            <motion.div key="an" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${card} p-16 shadow-sm text-center`}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="inline-flex mb-4"><Robot size={36} className={isDark ? "text-teal-400" : "text-teal-600"} weight="duotone" /></motion.div>
              <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>يُراجع مطابقة الإجراءات للنظام...</p>
            </motion.div>
          )}
          {step === "result" && (
            <BetaReviewGate toolId="gov.procurement-reviewer" toolName="تقرير مراجعة المنافسات والمشتريات" reviewScope="legal-data">
            <motion.div key="res" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className={`${card} p-5 shadow-sm space-y-2`}>
                <h3 className={`text-sm font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>نتائج مراجعة المنافسة</h3>
                {CHECKS.map((c, i) => (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${isDark ? "bg-white/2" : "bg-gray-50"}`}>
                    {c.pass ? <CheckCircle size={15} weight="fill" className="text-emerald-500 shrink-0 mt-0.5" /> : <XCircle size={15} weight="fill" className="text-rose-500 shrink-0 mt-0.5" />}
                    <div><p className={`text-xs font-semibold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{c.text}</p>{c.note && <p className="text-xs text-rose-500 mt-0.5">{c.note}</p>}</div>
                  </div>
                ))}
              </div>
              <AiResultActions text={resultText} filename="gov-procurement-review" showShare />
              <div className="flex gap-3">
                <button onClick={() => setStep("input")} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-gray-100 text-gray-700 hover:bg-gray-200"} transition`}>مراجعة جديدة</button>
                <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold ${isDark ? "bg-teal-500/10 text-teal-400 hover:bg-teal-500/20" : "bg-teal-50 text-teal-700 hover:bg-teal-100"} transition`}><Copy size={14} /> نسخ التقرير</button>
              </div>
            </motion.div>
            </BetaReviewGate>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
