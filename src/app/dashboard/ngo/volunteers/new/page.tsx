"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, UserCirclePlus, CheckCircle,
  IdentificationCard, Phone, EnvelopeSimple,
  MapPin, Briefcase, CalendarBlank,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const spring = { type: "spring" as const, stiffness: 120, damping: 20 };

const SPECIALTIES = [
  "الدعم القانوني", "الخدمات الاجتماعية", "التعليم والتدريب",
  "الصحة والرعاية", "الإدارة والمالية", "التقنية والبرمجة",
  "الإعلام والتصميم", "الخدمات اللوجستية",
];

export default function NewVolunteerPage() {
  const { isDark } = useTheme();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "", id: "", phone: "", email: "",
    city: "", specialty: "", startDate: "", notes: "",
  });

  const set = (k: keyof typeof form, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const card = isDark
    ? "bg-zinc-900/60 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-slate-200 rounded-2xl shadow-sm";

  const input = `w-full px-4 py-3 rounded-xl text-sm outline-none transition-all border ${
    isDark
      ? "bg-zinc-800/60 border-white/[0.08] text-zinc-200 placeholder:text-zinc-600 focus:border-[#0B3D2E]/60"
      : "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-[#0B3D2E]/40"
  }`;

  const step1Valid = form.name && form.id && form.phone;
  const step2Valid = form.specialty && form.startDate;

  if (submitted) {
    return (
      <div className={`max-w-lg mx-auto pt-16 text-center`} dir="rtl">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring}>
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} weight="fill" className="text-emerald-500" />
          </div>
          <h1 className={`text-2xl font-bold mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>
            تم تسجيل المتطوع
          </h1>
          <p className={`text-sm mb-6 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
            تم إضافة <strong>{form.name}</strong> إلى قائمة المتطوعين بنجاح.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/dashboard/ngo/volunteers"
              className={`px-6 py-3 rounded-xl text-sm font-bold border transition-colors ${
                isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}>
              قائمة المتطوعين
            </Link>
            <button onClick={() => { setSubmitted(false); setStep(1); setForm({ name:"",id:"",phone:"",email:"",city:"",specialty:"",startDate:"",notes:"" }); }}
              className="px-6 py-3 rounded-xl text-sm font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
              إضافة متطوع آخر
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto" dir="rtl">
      {/* Breadcrumb */}
      <Link href="/dashboard/ngo/volunteers"
        className={`inline-flex items-center gap-1.5 text-[13px] mb-6 ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"} transition-colors`}>
        <ArrowRight size={13} /> إدارة المتطوعين
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
          تسجيل متطوع جديد
        </h1>
        <p className={`text-sm mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          أدخل بيانات المتطوع وستُنشأ عقد تطوع تلقائياً عند الإرسال
        </p>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2].map(s => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step >= s ? "bg-[#0B3D2E] text-[#C8A762]" : isDark ? "bg-zinc-800 text-zinc-600" : "bg-slate-100 text-slate-400"
            }`}>{s}</div>
            <span className={`text-[11px] font-medium flex-1 ${step >= s ? isDark ? "text-zinc-300" : "text-slate-600" : isDark ? "text-zinc-700" : "text-slate-400"}`}>
              {s === 1 ? "البيانات الشخصية" : "التخصص والتوقيت"}
            </span>
            {s < 2 && <div className={`h-px flex-1 ${step > s ? "bg-[#0B3D2E]/40" : isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={spring}
          className={`${card} p-6 space-y-4`}>
          <div>
            <label className={`text-[11px] font-semibold uppercase tracking-wide mb-2 block ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              <IdentificationCard size={12} className="inline ml-1" />الاسم الكامل *
            </label>
            <input value={form.name} onChange={e => set("name", e.target.value)}
              placeholder="محمد عبدالله الأحمدي" className={input} />
          </div>
          <div>
            <label className={`text-[11px] font-semibold uppercase tracking-wide mb-2 block ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              رقم الهوية الوطنية *
            </label>
            <input value={form.id} onChange={e => set("id", e.target.value)}
              placeholder="10xxxxxxxx" maxLength={10} className={input} />
          </div>
          <div>
            <label className={`text-[11px] font-semibold uppercase tracking-wide mb-2 block ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              <Phone size={12} className="inline ml-1" />رقم الجوال *
            </label>
            <input value={form.phone} onChange={e => set("phone", e.target.value)}
              placeholder="05xxxxxxxx" className={input} />
          </div>
          <div>
            <label className={`text-[11px] font-semibold uppercase tracking-wide mb-2 block ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              <EnvelopeSimple size={12} className="inline ml-1" />البريد الإلكتروني
            </label>
            <input value={form.email} onChange={e => set("email", e.target.value)}
              placeholder="example@domain.com" type="email" className={input} />
          </div>
          <div>
            <label className={`text-[11px] font-semibold uppercase tracking-wide mb-2 block ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              <MapPin size={12} className="inline ml-1" />المدينة
            </label>
            <input value={form.city} onChange={e => set("city", e.target.value)}
              placeholder="الرياض" className={input} />
          </div>
          <button onClick={() => setStep(2)} disabled={!step1Valid}
            className="w-full py-3 rounded-xl text-sm font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors disabled:opacity-40 mt-2">
            التالي — التخصص والتوقيت
          </button>
        </motion.div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={spring}
          className={`${card} p-6 space-y-4`}>
          <div>
            <label className={`text-[11px] font-semibold uppercase tracking-wide mb-2 block ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              <Briefcase size={12} className="inline ml-1" />التخصص / مجال العمل التطوعي *
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SPECIALTIES.map(sp => (
                <button key={sp} onClick={() => set("specialty", sp)}
                  className={`px-3 py-2.5 rounded-xl text-[12px] font-medium border text-right transition-all ${
                    form.specialty === sp
                      ? "bg-[#0B3D2E] text-[#C8A762] border-[#0B3D2E]"
                      : isDark ? "border-white/[0.06] text-zinc-400 hover:border-white/10" : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}>
                  {sp}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={`text-[11px] font-semibold uppercase tracking-wide mb-2 block ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              <CalendarBlank size={12} className="inline ml-1" />تاريخ بدء التطوع *
            </label>
            <input value={form.startDate} onChange={e => set("startDate", e.target.value)}
              type="date" className={input} />
          </div>
          <div>
            <label className={`text-[11px] font-semibold uppercase tracking-wide mb-2 block ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              ملاحظات إضافية
            </label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
              placeholder="أي معلومات إضافية عن المتطوع..." rows={3}
              className={`${input} resize-none`} />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)}
              className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-colors ${
                isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}>
              رجوع
            </button>
            <button onClick={() => setSubmitted(true)} disabled={!step2Valid}
              className="flex-1 py-3 rounded-xl text-sm font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              <UserCirclePlus size={16} weight="bold" />
              تسجيل المتطوع
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
