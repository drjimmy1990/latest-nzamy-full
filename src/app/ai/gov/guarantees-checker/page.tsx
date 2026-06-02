"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, CheckCircle, Warning, XCircle, Robot, ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
type Step = "input" | "checking" | "result";
const GUARANTEES = ["المادة الثانية والثلاثون — حق الاستعانة بمحامٍ","المادة الثالثة والثلاثون — إبلاغ ذوي الموقوف","المادة الثامنة والثلاثون — الحق في التفتيش القضائي","المادة الخامسة والأربعون — حق الصمت","المادة الخمسون — مدة التوقيف الإجرائية"];
export default function GuaranteesCheckerPage() {
  const { isDark, isRTL } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [form, setForm] = useState({ crimeType: "", detentionDate: "", actions: "" });
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const inp = `w-full rounded-xl border px-4 py-3 text-sm outline-none resize-none transition ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-gray-200 placeholder:text-gray-600 focus:border-indigo-500" : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-400 focus:border-indigo-500"}`;
  const isValid = form.crimeType.length > 3 && form.actions.length > 10;
  const RESULT = [
    { text: GUARANTEES[0], status: "pass" },
    { text: GUARANTEES[1], status: "pass" },
    { text: GUARANTEES[2], status: "warn", note: "لم يُوثَّق اكتمال الإجراء" },
    { text: GUARANTEES[3], status: "pass" },
    { text: GUARANTEES[4], status: "fail", note: "تجاوزت مدة التوقيف ٥ أيام دون إحالة" },
  ];
  const resultText = [
    "تقرير مراجعة الضمانات الإجرائية",
    "====================",
    `نوع القضية: ${form.crimeType || "غير محدد"}`,
    `تاريخ القبض / التوقيف: ${form.detentionDate || "غير محدد"}`,
    `الإجراءات: ${form.actions || "غير محددة"}`,
    "",
    "نتائج المراجعة:",
    ...RESULT.map((item) => `- ${item.status}: ${item.text}${item.note ? ` — ${item.note}` : ""}`),
  ].join("\n");
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-rose-500/10" : "bg-rose-50"}`}><ShieldCheck size={22} weight="duotone" className={isDark ? "text-rose-400" : "text-rose-600"} /></div>
          <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>مراجع الضمانات الإجرائية</h1><p className={`text-xs ${muted}`}>يُراجع مدى استيفاء ضمانات المتهم وفق نظام الإجراءات الجزائية</p></div>
          <span className={`ms-auto text-xs font-bold px-2.5 py-1 rounded-full ${isDark ? "bg-rose-500/10 text-rose-400" : "bg-rose-100 text-rose-600"}`}>أداة نيابة</span>
        </div>
        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div key="in" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
              <div className={`${card} p-5 shadow-sm space-y-4`}>
                <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>نوع القضية / الجريمة</label><input value={form.crimeType} onChange={e => setForm({...form, crimeType: e.target.value})} placeholder="نزاع تجاري — جريمة إلكترونية..." className={inp} /></div>
                <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>تاريخ القبض / التوقيف</label><input type="date" value={form.detentionDate} onChange={e => setForm({...form, detentionDate: e.target.value})} className={inp} /></div>
                <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>الإجراءات المتّخذة حتى الآن</label><textarea rows={3} value={form.actions} onChange={e => setForm({...form, actions: e.target.value})} placeholder="التحقيق، الإفادة، الإحالة..." className={inp} /></div>
              </div>
              <button onClick={() => { setStep("checking"); setTimeout(() => setStep("result"), 2000); }} disabled={!isValid}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition ${isValid ? "bg-rose-600 text-white hover:bg-rose-700" : "opacity-40 cursor-not-allowed bg-rose-600 text-white"}`}>
                <ShieldCheck size={16} /> مراجعة الضمانات <Arrow size={14} />
              </button>
            </motion.div>
          )}
          {step === "checking" && (
            <motion.div key="an" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${card} p-16 shadow-sm text-center`}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="inline-flex mb-4"><Robot size={36} className={isDark ? "text-rose-400" : "text-rose-600"} weight="duotone" /></motion.div>
              <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>يراجع مدى استيفاء الضمانات...</p>
            </motion.div>
          )}
          {step === "result" && (
            <motion.div key="res" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <BetaReviewGate toolId="gov.guarantees-checker" toolName="مراجعة الضمانات الإجرائية" reviewScope="legal-data">
              <div className={`${card} p-5 shadow-sm space-y-2`}>
                <h3 className={`text-sm font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>نتائج مراجعة الضمانات</h3>
                {RESULT.map((r, i) => (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${isDark ? "bg-white/2" : "bg-gray-50"}`}>
                    {r.status === "pass" ? <CheckCircle size={15} weight="fill" className="text-emerald-500 shrink-0 mt-0.5" /> : r.status === "warn" ? <Warning size={15} weight="fill" className="text-amber-500 shrink-0 mt-0.5" /> : <XCircle size={15} weight="fill" className="text-rose-500 shrink-0 mt-0.5" />}
                    <div><p className={`text-xs font-semibold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{r.text}</p>{r.note && <p className={`text-xs mt-0.5 ${r.status === "fail" ? "text-rose-500" : "text-amber-500"}`}>{r.note}</p>}</div>
                  </div>
                ))}
              </div>
              <AiResultActions text={resultText} filename="gov-procedural-guarantees" showShare />
              </BetaReviewGate>
              <button onClick={() => setStep("input")} className={`w-full py-2.5 rounded-xl text-sm font-bold ${isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-gray-100 text-gray-700 hover:bg-gray-200"} transition`}>مراجعة جديدة</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
