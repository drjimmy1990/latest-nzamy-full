"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { UserCirclePlus, MagnifyingGlass, CheckCircle, X } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const TYPES = ["lawyer","individual","corporate","micro","ngo","government","provider","admin"];
export default function AdminNewUserPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", userType: "individual", phone: "", notes: "" });
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const inp = `w-full rounded-xl border px-4 py-3 text-sm outline-none transition ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-gray-200 placeholder:text-gray-600 focus:border-[#C8A762]" : "bg-white border-gray-200 text-gray-800 focus:border-amber-500"}`;
  const isValid = form.name.length > 2 && form.email.includes("@");
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-2xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-amber-500/10" : "bg-amber-50"}`}><UserCirclePlus size={22} weight="duotone" className={isDark ? "text-amber-400" : "text-amber-600"} /></div>
          <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>إضافة مستخدم جديد</h1><p className={`text-xs ${muted}`}>إنشاء حساب يدوي بصلاحيات المدير</p></div>
        </div>
        {submitted ? (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className={`${card} p-12 text-center shadow-sm`}>
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} weight="fill" className="text-emerald-500" />
            </div>
            <p className={`font-black text-lg mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>تم إنشاء الحساب</p>
            <p className={`text-sm ${muted} mb-6`}>تم إرسال دعوة التفعيل إلى {form.email}</p>
            <button onClick={() => { setSubmitted(false); setForm({ name: "", email: "", userType: "individual", phone: "", notes: "" }); }}
              className="px-6 py-2.5 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-600 transition">إضافة آخر</button>
          </motion.div>
        ) : (
          <div className={`${card} p-6 shadow-sm space-y-4`}>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>الاسم الكامل</label><input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="محمد الأحمدي" className={inp} /></div>
              <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>البريد الإلكتروني</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="user@example.com" className={inp} /></div>
              <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>نوع المستخدم</label>
                <select value={form.userType} onChange={e => setForm({...form, userType: e.target.value})} className={inp}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>رقم الجوال</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+966 5x xxx xxxx" className={inp} /></div>
            </div>
            <div><label className={`block text-xs font-semibold mb-1.5 ${muted}`}>ملاحظات (اختياري)</label><textarea rows={2} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="سبب الإنشاء اليدوي..." className={inp + " resize-none"} /></div>
            <button onClick={() => isValid && setSubmitted(true)} disabled={!isValid}
              className={`w-full py-3 rounded-xl font-bold text-sm transition ${isValid ? "bg-amber-500 text-white hover:bg-amber-600" : "opacity-40 cursor-not-allowed bg-amber-500 text-white"}`}>
              إنشاء الحساب وإرسال الدعوة
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
