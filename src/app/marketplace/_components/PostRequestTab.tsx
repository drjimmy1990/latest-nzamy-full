"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, Sparkle, ArrowRight } from "@phosphor-icons/react";
import Link from "next/link";
import { LETTER_TYPES, CITIES } from "../_data";

export function PostRequestTab({ isDark, isGuest }: { isDark: boolean; isGuest: boolean }) {
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const card  = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const inp   = `w-full rounded-xl border px-4 py-2.5 text-sm outline-none ${isDark ? "border-[#2d3748] bg-[#0c0f12] text-white placeholder-gray-600" : "border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400"}`;

  const [step, setStep]         = useState(1);
  const [reqType, setReqType]   = useState("");
  const [city, setCity]         = useState("");
  const [urgency, setUrgency]   = useState("");
  const [budget, setBudget]     = useState({ min: "", max: "" });
  const [desc, setDesc]         = useState("");
  const [submitted, setSubmit]  = useState(false);

  if (isGuest) {
    return (
      <div className={`${card} p-12 text-center`}>
        <Sparkle size={48} className="mx-auto mb-4 text-[#C8A762] opacity-50" weight="fill" />
        <h3 className={`text-lg font-bold mb-2 ${isDark ? "text-white" : "text-gray-800"}`}>سجّل لنشر طلبك</h3>
        <p className={`text-sm mb-6 ${muted}`}>انشر طلبك ويتنافس المهنيون على خدمتك بأفضل الأسعار</p>
        <Link href="/login" className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B3D2E] text-white font-bold rounded-xl text-sm">
          تسجيل <ArrowRight size={16} className="rotate-180" />
        </Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className={`${card} p-12 text-center space-y-4`}>
        <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
          <CheckCircle size={32} weight="fill" className="text-emerald-500" />
        </div>
        <h3 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}>تم نشر طلبك بنجاح!</h3>
        <p className={`text-sm ${muted}`}>سيتواصل معك مزودو الخدمة المؤهلون قريباً. متوسط وقت أول رد: <strong>٢٤ دقيقة</strong></p>
        <div className="flex gap-3 justify-center flex-wrap">
          <button onClick={() => { setSubmit(false); setStep(1); setReqType(""); setDesc(""); }}
            className="px-5 py-2.5 bg-[#0B3D2E] text-white font-bold rounded-xl text-sm">
            انشر طلباً آخر
          </button>
          <Link href="/marketplace" className={`px-5 py-2.5 border font-bold rounded-xl text-sm ${isDark ? "border-[#2d3748] text-gray-300" : "border-gray-200 text-gray-700"}`}>
            عرض طلباتي
          </Link>
        </div>
      </motion.div>
    );
  }

  const STEPS = ["نوع الخدمة", "التفاصيل", "الميزانية"];

  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <div className={`${card} p-4`}>
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const isDone   = step > n;
            const isActive = step === n;
            return (
              <div key={n} className="flex items-center gap-1 flex-1">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0 transition-all ${
                  isDone ? "bg-emerald-500 text-white" : isActive ? "bg-[#0B3D2E] text-white" : isDark ? "bg-[#2d3748] text-gray-500" : "bg-gray-100 text-gray-400"
                }`}>
                  {isDone ? <CheckCircle size={12} weight="fill" /> : n}
                </div>
                <span className={`text-[10px] hidden sm:block font-medium ${isActive ? isDark ? "text-white" : "text-gray-800" : isDark ? "text-gray-600" : "text-gray-400"}`}>{s}</span>
                {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-1 ${isDone ? "bg-emerald-500/40" : isDark ? "bg-[#2d3748]" : "bg-gray-200"}`} />}
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* Step 1 — نوع الخدمة */}
        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className={`${card} p-5 space-y-4`}>
            <p className={`text-sm font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>ما الخدمة التي تحتاجها؟</p>
            <div className="grid grid-cols-2 gap-2">
              {LETTER_TYPES.map(lt => (
                <button key={lt.id} onClick={() => setReqType(lt.id)}
                  className={`rounded-2xl border px-3 py-3 text-right transition-all ${
                    reqType === lt.id
                      ? isDark ? "border-[#C8A762]/40 bg-[#C8A762]/10 text-[#C8A762]" : "border-[#0B3D2E]/40 bg-[#0B3D2E]/8 text-[#0B3D2E] shadow-sm"
                      : isDark ? "border-[#2d3748] text-gray-400 hover:border-gray-600" : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"
                  }`}>
                  <p className={`text-[13px] font-bold mb-0.5 ${reqType === lt.id ? "" : isDark ? "text-gray-200" : "text-gray-800"}`}>{lt.label}</p>
                  <p className={`text-[10px] leading-snug ${reqType === lt.id ? "opacity-70" : isDark ? "text-gray-600" : "text-gray-400"}`}>{lt.desc}</p>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button onClick={() => setStep(2)} disabled={!reqType}
                className="px-6 py-2.5 bg-[#0B3D2E] text-white font-bold rounded-xl text-sm disabled:opacity-40">
                التالي →
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 2 — التفاصيل */}
        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className={`${card} p-5 space-y-4`}>
            <p className={`text-sm font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>تفاصيل الطلب</p>
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-gray-500" : "text-gray-400"}`}>المدينة</label>
              <select value={city} onChange={e => setCity(e.target.value)} className={inp}>
                <option value="">اختر المدينة</option>
                {CITIES.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-gray-500" : "text-gray-400"}`}>الأولوية الزمنية</label>
              <div className="flex gap-2">
                {[{ id: "urgent", label: "عاجل 🔴" }, { id: "normal", label: "عادي" }, { id: "flexible", label: "مرن ✅" }].map(u => (
                  <button key={u.id} onClick={() => setUrgency(u.id)}
                    className={`flex-1 py-2 rounded-xl border text-[12px] font-semibold transition-all ${
                      urgency === u.id
                        ? "bg-[#0B3D2E] border-[#0B3D2E] text-white"
                        : isDark ? "border-[#2d3748] text-gray-400" : "border-gray-200 text-gray-500"
                    }`}>{u.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-gray-500" : "text-gray-400"}`}>اشرح ما تحتاجه بالتفصيل</label>
              <textarea value={desc} onChange={e => setDesc(e.target.value)}
                placeholder="اذكر التفاصيل: الأطراف، الوثائق المطلوبة، الموعد... كلما زاد التفصيل جذب أفضل المهنيين"
                rows={4} className={inp + " resize-none"} />
              {desc.length > 0 && desc.length < 20 && <p className="text-[11px] text-amber-500 mt-1">أضف ٢٠ حرفاً على الأقل</p>}
            </div>
            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className={`px-4 py-2 rounded-xl border text-sm font-semibold ${isDark ? "border-[#2d3748] text-gray-400" : "border-gray-200 text-gray-500"}`}>← رجوع</button>
              <button onClick={() => setStep(3)} disabled={!city || !urgency || desc.trim().length < 20}
                className="px-6 py-2.5 bg-[#0B3D2E] text-white font-bold rounded-xl text-sm disabled:opacity-40">التالي →</button>
            </div>
          </motion.div>
        )}

        {/* Step 3 — الميزانية */}
        {step === 3 && (
          <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            className={`${card} p-5 space-y-4`}>
            <p className={`text-sm font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>الميزانية المقترحة</p>
            <div className={`rounded-xl p-3 border ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-100 bg-amber-50"}`}>
              <p className={`text-[12px] ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>
                💡 المنصة تعرض نطاق سعر مقترح للمهنيين — يمكنهم تعديله عند تقديم عرضهم
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>الحد الأدنى (ر.س)</label>
                <input type="number" value={budget.min} onChange={e => setBudget(p => ({ ...p, min: e.target.value }))} placeholder="مثال: 200" className={inp} />
              </div>
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>الحد الأقصى (ر.س)</label>
                <input type="number" value={budget.max} onChange={e => setBudget(p => ({ ...p, max: e.target.value }))} placeholder="مثال: 600" className={inp} />
              </div>
            </div>
            <div className={`rounded-xl p-3 border ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-gray-100 bg-gray-50"}`}>
              <p className={`text-xs font-semibold mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>ملخص طلبك:</p>
              <ul className={`text-xs space-y-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                <li>• النوع: {LETTER_TYPES.find(l => l.id === reqType)?.label ?? "—"}</li>
                <li>• المدينة: {city || "—"} · الأولوية: {urgency === "urgent" ? "عاجل" : urgency === "normal" ? "عادي" : "مرن"}</li>
                <li>• الميزانية: {budget.min || "—"} – {budget.max || "—"} ر.س</li>
              </ul>
            </div>
            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className={`px-4 py-2 rounded-xl border text-sm font-semibold ${isDark ? "border-[#2d3748] text-gray-400" : "border-gray-200 text-gray-500"}`}>← رجوع</button>
              <button onClick={() => setSubmit(true)} disabled={!budget.min || !budget.max}
                className="px-6 py-2.5 font-bold rounded-xl text-sm text-white bg-gradient-to-l from-[#0B3D2E] to-[#1a6b50] disabled:opacity-40 shadow-md">
                نشر الطلب ✓
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
