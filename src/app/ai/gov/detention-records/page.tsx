"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ClipboardText, Robot, Copy, DownloadSimple, Warning, ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
type Step = "input" | "generating" | "result";
export default function DetentionRecordsPage() {
  const { isDark, isRTL } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [form, setForm] = useState({ name: "", id: "", location: "", reason: "", time: "" });
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const inp = `w-full rounded-xl border px-4 py-3 text-sm outline-none transition ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-gray-200 placeholder:text-gray-600 focus:border-indigo-500" : "bg-white border-gray-200 text-gray-800 placeholder:text-gray-400 focus:border-indigo-500"}`;
  const isValid = form.name.length > 2 && form.reason.length > 5;
  const RECORD = `محضر ضبط وإيقاف\nرقم المحضر: POL-${Date.now().toString().slice(-6)}\n\nتاريخ الضبط: ${new Date().toLocaleDateString("ar-SA")}\nمكان الضبط: ${form.location || "..."}\nوقت الضبط: ${form.time || "..."}\n\nبيانات الموقوف:\nالاسم: ${form.name}\nرقم الهوية: ${form.id || "..."}\n\nسبب الضبط: ${form.reason}\n\nإجراءات التسليم:\nتم إبلاغ النيابة العامة في: ...\nتم إبلاغ ذوي الموقوف في: ...\n\nضابط الضبط: _______________ الرتبة: _______________`;
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-sky-500/10" : "bg-sky-50"}`}><ClipboardText size={22} weight="duotone" className={isDark ? "text-sky-400" : "text-sky-600"} /></div>
          <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>محاضر الضبط والإيقاف</h1><p className={`text-xs ${muted}`}>يُعدّ محضر الضبط بالبيانات المطلوبة وفق نظام الإجراءات</p></div>
          <span className={`ms-auto text-xs font-bold px-2.5 py-1 rounded-full ${isDark ? "bg-sky-500/10 text-sky-400" : "bg-sky-100 text-sky-600"}`}>أداة ضابط</span>
        </div>
        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div key="in" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
              <div className={`${card} p-5 shadow-sm space-y-3`}>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>اسم الموقوف</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="الاسم الكامل..." className={inp} /></div>
                  <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>رقم الهوية</label><input value={form.id} onChange={e => setForm({...form, id: e.target.value})} placeholder="١٠٣٢..." className={inp} /></div>
                  <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>مكان الضبط</label><input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="الرياض — حي..." className={inp} /></div>
                  <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>وقت الضبط</label><input type="time" value={form.time} onChange={e => setForm({...form, time: e.target.value})} className={inp} /></div>
                </div>
                <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>سبب الضبط</label><input value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} placeholder="التهمة أو السبب..." className={inp} /></div>
              </div>
              <div className={`flex items-start gap-2 p-3 rounded-xl text-xs ${isDark ? "bg-amber-500/5 border border-amber-500/15" : "bg-amber-50 border border-amber-200"}`}><Warning size={14} weight="fill" className="text-amber-500 shrink-0 mt-0.5" /><span className={isDark ? "text-amber-400/80" : "text-amber-700"}>يجب إبلاغ النيابة العامة فوراً وإخطار ذوي الموقوف وفق المادة ١٠٢ من نظام الإجراءات.</span></div>
              <button onClick={() => { setStep("generating"); setTimeout(() => setStep("result"), 1500); }} disabled={!isValid}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition ${isValid ? "bg-sky-600 text-white hover:bg-sky-700" : "opacity-40 cursor-not-allowed bg-sky-600 text-white"}`}>
                <ClipboardText size={16} /> إنشاء المحضر <Arrow size={14} />
              </button>
            </motion.div>
          )}
          {step === "generating" && (
            <motion.div key="an" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${card} p-16 shadow-sm text-center`}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="inline-flex mb-4"><Robot size={36} className={isDark ? "text-sky-400" : "text-sky-600"} weight="duotone" /></motion.div>
              <p className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>جارٍ إنشاء المحضر...</p>
            </motion.div>
          )}
          {step === "result" && (
            <motion.div key="res" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <BetaReviewGate toolId="gov.detention-records" toolName="محضر الضبط والإيقاف" reviewScope="legal-data">
              <div className={`${card} p-5 shadow-sm`}><pre className={`text-xs leading-7 whitespace-pre-wrap font-sans ${isDark ? "text-gray-300" : "text-gray-700"}`}>{RECORD}</pre></div>
              <AiResultActions text={RECORD} filename="gov-detention-record" showShare />
              </BetaReviewGate>
              <div className="flex gap-3">
                <button onClick={() => setStep("input")} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${isDark ? "bg-white/5 text-gray-300 hover:bg-white/10" : "bg-gray-100 text-gray-700 hover:bg-gray-200"} transition`}>محضر جديد</button>
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
