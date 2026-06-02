"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LockKey, Robot, Copy, DownloadSimple, Warning, ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
type Step = "input" | "generating" | "result";
const TYPES = ["أمر قبض","أمر تفتيش شخصي","أمر تفتيش مسكن","أمر ضبط وإحضار"];
export default function ArrestFormsPage() {
  const { isDark, isRTL } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [form, setForm] = useState({ type: TYPES[0], target: "", address: "", reason: "", authority: "" });
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const inp = `w-full rounded-xl border px-4 py-3 text-sm outline-none resize-none transition ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-gray-200 placeholder:text-gray-600 focus:border-indigo-500" : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-400 focus:border-indigo-500"}`;
  const isValid = form.target.length > 2 && form.reason.length > 5;
  const DRAFT = `${form.type}\n\nالسلطة المصدرة: ${form.authority || "النيابة العامة / رئاسة أمن الدولة"}\nالرقم المرجعي: ARR-${Date.now().toString().slice(-6)}\nالتاريخ: ${new Date().toLocaleDateString("ar-SA")}\n\nالموجَّه إليه: قوات الأمن المختصة\n\nيُأذن بموجب هذا ${form.type} بشأن:\nالاسم / العنوان: ${form.target}\nالموقع: ${form.address || "..."}\n\nالسبب الإجرائي: ${form.reason}\n\nيُراعى تطبيق المادة ٤٠ من نظام الإجراءات الجزائية.\n\nالمسؤول المُصدر: _______________ التوقيع: _______________`;
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-sky-500/10" : "bg-sky-50"}`}><LockKey size={22} weight="duotone" className={isDark ? "text-sky-400" : "text-sky-600"} /></div>
          <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>نماذج القبض والتفتيش</h1><p className={`text-xs ${muted}`}>يُعدّ أوامر القبض والتفتيش وفق الصيغ النظامية</p></div>
          <span className={`ms-auto text-xs font-bold px-2.5 py-1 rounded-full ${isDark ? "bg-sky-500/10 text-sky-400" : "bg-sky-100 text-sky-600"}`}>أداة ضابط</span>
        </div>
        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div key="in" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
              <div className={`${card} p-5 shadow-sm space-y-3`}>
                <div><label className={`block text-xs font-semibold mb-2 ${muted}`}>نوع الأمر</label>
                  <div className="grid grid-cols-2 gap-2">{TYPES.map(t => (<button key={t} onClick={() => setForm({...form, type: t})} className={`text-xs px-3 py-2 rounded-xl font-semibold border transition text-start ${form.type === t ? isDark ? "border-sky-500/40 bg-sky-500/10 text-sky-300" : "border-sky-400 bg-sky-50 text-sky-700" : isDark ? "border-[#2d3748] bg-white/2 text-gray-400 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{t}</button>))}</div>
                </div>
                <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>اسم المستهدف / عنوان الموقع</label><input value={form.target} onChange={e => setForm({...form, target: e.target.value})} placeholder="الاسم أو العنوان..." className={inp} /></div>
                <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>العنوان التفصيلي</label><input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="حي — شارع — مبنى..." className={inp} /></div>
                <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>السبب الإجرائي / الجريمة</label><textarea rows={2} value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} placeholder="وصف الجريمة والمبرر القانوني..." className={inp} /></div>
              </div>
              <div className={`flex items-start gap-2 p-3 rounded-xl text-xs ${isDark ? "bg-amber-500/5 border border-amber-500/15" : "bg-amber-50 border border-amber-200"}`}><Warning size={14} weight="fill" className="text-amber-500 shrink-0 mt-0.5" /><span className={isDark ? "text-amber-400/80" : "text-amber-700"}>يستلزم أمر التفتيش إذناً نيابياً مسبقاً وفق المادة ٤١ من نظام الإجراءات الجزائية.</span></div>
              <button onClick={() => { setStep("generating"); setTimeout(() => setStep("result"), 1500); }} disabled={!isValid}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition ${isValid ? "bg-sky-600 text-white hover:bg-sky-700" : "opacity-40 cursor-not-allowed bg-sky-600 text-white"}`}>
                <LockKey size={16} /> إنشاء الأمر <Arrow size={14} />
              </button>
            </motion.div>
          )}
          {step === "generating" && (
            <motion.div key="an" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${card} p-16 shadow-sm text-center`}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="inline-flex mb-4"><LockKey size={36} className={isDark ? "text-sky-400" : "text-sky-600"} weight="duotone" /></motion.div>
              <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>جارٍ إنشاء الأمر...</p>
            </motion.div>
          )}
          {step === "result" && (
            <motion.div key="res" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <BetaReviewGate toolId="gov.arrest-forms" toolName="نماذج القبض والتفتيش" reviewScope="legal-data">
              <div className={`${card} p-5 shadow-sm`}><pre className={`text-xs leading-7 whitespace-pre-wrap font-sans ${isDark ? "text-gray-300" : "text-gray-700"}`}>{DRAFT}</pre></div>
              <AiResultActions text={DRAFT} filename="gov-arrest-form" showShare />
              </BetaReviewGate>
              <div className="flex gap-3">
                <button onClick={() => setStep("input")} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-gray-100 text-gray-700 hover:bg-gray-200"} transition`}>نموذج جديد</button>
                <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold ${isDark ? "bg-sky-500/10 text-sky-400 hover:bg-sky-500/20" : "bg-sky-50 text-sky-700 hover:bg-sky-100"} transition`}><Copy size={14} /> نسخ</button>
                <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold ${isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"} transition`}><DownloadSimple size={14} /> تحميل</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
