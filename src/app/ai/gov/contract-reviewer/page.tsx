"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Robot, Copy, DownloadSimple, Warning, CheckCircle, XCircle, ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
type Step = "input" | "reviewing" | "result";
export default function ContractReviewerPage() {
  const { isDark, isRTL } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [form, setForm] = useState({ contractType: "عقد خدمات", parties: "", value: "", terms: "" });
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const inp = `w-full rounded-xl border px-4 py-3 text-sm outline-none resize-none transition ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-gray-200 placeholder:text-gray-600 focus:border-indigo-500" : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-400 focus:border-indigo-500"}`;
  const isValid = form.parties.length > 5 && form.terms.length > 20;
  const ISSUES = [
    { text: "بند الغرامات التأخيرية موجود ومحدد (٢٪ شهرياً)", pass: true },
    { text: "شرط فض النزاعات محدد (تحكيم / قضاء)", pass: true },
    { text: "بند إنهاء العقد وإشعار مسبق ٣٠ يوماً", pass: true },
    { text: "شرط التحكيم قد يتعارض مع اختصاص محاكم التعديل", pass: false, note: "يُنصح بمراجعة الصياغة لتتوافق مع نظام المحاكم التجارية" },
    { text: "ضمان حسن التنفيذ محدد بالنسبة والمدة", pass: false, note: "غير محدد — يُوصى بإضافة ٥٪ من قيمة العقد كضمان" },
  ];
  const reviewText = [
    "تقرير مراجعة عقد حكومي",
    "====================",
    `نوع العقد: ${form.contractType}`,
    `الأطراف: ${form.parties || "غير محدد"}`,
    `القيمة: ${form.value || "غير محددة"}`,
    "",
    "نتائج الفحص:",
    ...ISSUES.map((issue) => `- ${issue.pass ? "مطابق" : "يحتاج تعديل"}: ${issue.text}${issue.note ? ` — ${issue.note}` : ""}`),
  ].join("\n");
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-teal-500/10" : "bg-teal-50"}`}><FileText size={22} weight="duotone" className={isDark ? "text-teal-400" : "text-teal-600"} /></div>
          <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>مراجع عقود الجهات الحكومية</h1><p className={`text-xs ${muted}`}>يُراجع بنود العقود الحكومية ويكشف الثغرات والمخاطر القانونية</p></div>
          <span className={`ms-auto text-xs font-bold px-2.5 py-1 rounded-full ${isDark ? "bg-teal-500/10 text-teal-400" : "bg-teal-100 text-teal-600"}`}>أداة مستشار</span>
        </div>
        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div key="in" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
              <div className={`${card} p-5 shadow-sm space-y-4`}>
                <div><label className={`block text-xs font-semibold mb-2 ${muted}`}>نوع العقد</label>
                  <div className="flex flex-wrap gap-2">
                    {["عقد خدمات","عقد إنشاء","عقد توريد","عقد استشارات","عقد صيانة"].map(t => (
                      <button key={t} onClick={() => setForm({...form, contractType: t})}
                        className={`text-xs px-3 py-1.5 rounded-full font-bold transition ${form.contractType === t ? isDark ? "bg-teal-500/20 text-teal-300 border border-teal-500/40" : "bg-teal-600 text-white" : isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{t}</button>
                    ))}
                  </div>
                </div>
                <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>أطراف العقد</label><input value={form.parties} onChange={e => setForm({...form, parties: e.target.value})} placeholder="الجهة الحكومية — اسم المورد أو المقاول..." className={inp} /></div>
                <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>قيمة العقد (ر.س)</label><input type="number" value={form.value} onChange={e => setForm({...form, value: e.target.value})} placeholder="١٠٠٠٠٠٠" className={inp} /></div>
                <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>الشروط والبنود الرئيسية</label><textarea rows={4} value={form.terms} onChange={e => setForm({...form, terms: e.target.value})} placeholder="الصق نص العقد أو أبرز البنود للمراجعة..." className={inp} /></div>
              </div>
              <div className={`flex items-start gap-2 p-3 rounded-xl text-xs ${isDark ? "bg-amber-500/5 border border-amber-500/15" : "bg-amber-50 border border-amber-200"}`}><Warning size={14} weight="fill" className="text-amber-500 shrink-0 mt-0.5" /><span className={isDark ? "text-amber-400/80" : "text-amber-700"}>المراجعة تحديد أولي — يجب إعادة الفحص القانوني الكامل قبل التوقيع.</span></div>
              <button onClick={() => { setStep("reviewing"); setTimeout(() => setStep("result"), 2000); }} disabled={!isValid}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition ${isValid ? "bg-teal-600 text-white hover:bg-teal-700" : "opacity-40 cursor-not-allowed bg-teal-600 text-white"}`}>
                <FileText size={16} /> مراجعة العقد <Arrow size={14} />
              </button>
            </motion.div>
          )}
          {step === "reviewing" && (
            <motion.div key="an" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${card} p-16 shadow-sm text-center`}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="inline-flex mb-4"><Robot size={36} className={isDark ? "text-teal-400" : "text-teal-600"} weight="duotone" /></motion.div>
              <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>يُراجع بنود العقد...</p>
            </motion.div>
          )}
          {step === "result" && (
            <motion.div key="res" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <BetaReviewGate toolId="gov.contract-reviewer" toolName="مراجعة العقد الحكومي" reviewScope="legal-data">
              <div className={`${card} p-5 shadow-sm`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>نتائج مراجعة العقد</h3>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-500`}>يحتاج تعديل</span>
                </div>
                <div className="space-y-2">
                  {ISSUES.map((c, i) => (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${isDark ? "bg-white/2" : "bg-gray-50"}`}>
                      {c.pass ? <CheckCircle size={15} weight="fill" className="text-emerald-500 shrink-0 mt-0.5" /> : <XCircle size={15} weight="fill" className="text-rose-500 shrink-0 mt-0.5" />}
                      <div><p className={`text-xs font-semibold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{c.text}</p>{c.note && <p className="text-xs text-amber-500 mt-0.5">{c.note}</p>}</div>
                    </div>
                  ))}
                </div>
              </div>
              <AiResultActions text={reviewText} filename="gov-contract-review" showShare />
              </BetaReviewGate>
              <div className="flex gap-3">
                <button onClick={() => setStep("input")} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-gray-100 text-gray-700 hover:bg-gray-200"} transition`}>مراجعة عقد آخر</button>
                <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold ${isDark ? "bg-teal-500/10 text-teal-400 hover:bg-teal-500/20" : "bg-teal-50 text-teal-700 hover:bg-teal-100"} transition`}><Copy size={14} /> نسخ</button>
                <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold ${isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"} transition`}><DownloadSimple size={14} /> تحميل</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
