"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Timer, CalendarBlank, Warning, CheckCircle, Plus, Trash } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
interface Deadline { id: number; label: string; startDate: string; days: number; category: string; }
const PRESETS = [
  { label: "الطعن بالاستئناف (جزائي)", days: 30, category: "نيابة" },
  { label: "إحالة الموقوف للمحكمة", days: 5, category: "ضابط" },
  { label: "الرد على الاعتراض الإداري", days: 60, category: "مستشار" },
  { label: "التقادم الجنائي — جريمة بسيطة", days: 365, category: "نيابة" },
];
function addDays(dateStr: string, days: number): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr); d.setDate(d.getDate() + days);
  return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
}
function daysLeft(dateStr: string, days: number): number {
  if (!dateStr) return 0;
  const end = new Date(dateStr); end.setDate(end.getDate() + days);
  return Math.ceil((end.getTime() - Date.now()) / 86400000);
}
export default function DeadlineCalculatorPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [form, setForm] = useState({ label: "", startDate: "", days: 30, category: "نيابة" });
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const inp = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition ${isDark ? "bg-[#0c0f12] border-[#2d3748] text-gray-200 focus:border-indigo-500" : "bg-white border-gray-200 text-gray-800 focus:border-indigo-500"}`;
  const add = () => {
    if (!form.label || !form.startDate) return;
    setDeadlines(prev => [...prev, { ...form, id: Date.now() }]);
    setForm({ label: "", startDate: "", days: 30, category: "نيابة" });
  };
  const remove = (id: number) => setDeadlines(prev => prev.filter(d => d.id !== id));
  const deadlinesText = [
    "تقرير المواعيد الإجرائية",
    "====================",
    ...deadlines.map((deadline) => {
      const left = daysLeft(deadline.startDate, deadline.days);
      const status = left < 0 ? `انتهى منذ ${Math.abs(left)} يوم` : `${left} يوم متبقٍ`;
      return `- ${deadline.label} (${deadline.category})\n  تاريخ البداية: ${deadline.startDate}\n  المدة: ${deadline.days} يوم\n  ينتهي: ${addDays(deadline.startDate, deadline.days)}\n  الحالة: ${status}`;
    }),
  ].join("\n");
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-amber-500/10" : "bg-amber-50"}`}><Timer size={22} weight="duotone" className={isDark ? "text-amber-400" : "text-amber-600"} /></div>
          <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>حاسبة المواعيد الإجرائية</h1><p className={`text-xs ${muted}`}>يحسب المواعيد القانونية ويُنبّه قبل انتهائها</p></div>
        </div>
        {/* Presets */}
        <div className={`${card} p-4 shadow-sm`}>
          <p className={`text-xs font-bold mb-3 ${muted}`}>قوالب شائعة</p>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => setForm({...form, label: p.label, days: p.days, category: p.category})}
                className={`text-start text-xs px-3 py-2 rounded-xl border transition ${isDark ? "border-[#2d3748] bg-white/2 text-gray-400 hover:bg-white/5" : "border-gray-100 text-gray-600 hover:bg-gray-50"}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {/* Add form */}
        <div className={`${card} p-5 shadow-sm`}>
          <h2 className={`text-sm font-bold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>إضافة موعد إجرائي</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>اسم الميعاد</label><input value={form.label} onChange={e => setForm({...form, label: e.target.value})} placeholder="الطعن بالاستئناف..." className={inp} /></div>
            <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>تاريخ البداية</label><input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} className={inp} /></div>
            <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>المدة (يوم)</label><input type="number" value={form.days} onChange={e => setForm({...form, days: parseInt(e.target.value)||0})} className={inp} /></div>
            <div><label className={`block text-xs font-semibold mb-1 ${muted}`}>الجهة</label>
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className={inp}>
                {["نيابة","ضابط","قاضي","مستشار"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <button onClick={add} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition">
            <Plus size={15} /> إضافة
          </button>
        </div>
        {/* Deadlines list */}
        {deadlines.length > 0 && (
          <BetaReviewGate toolId="gov.deadline-calculator" toolName="حساب المواعيد الإجرائية" reviewScope="legal-data">
          <div className="space-y-3">
            {deadlines.map(d => {
              const left = daysLeft(d.startDate, d.days);
              const isUrgent = left <= 7; const isExpired = left < 0;
              return (
                <motion.div key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={`${card} p-4 shadow-sm flex items-center gap-4`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isExpired ? "bg-rose-500/10" : isUrgent ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
                    {isExpired ? <Warning size={18} weight="fill" className="text-rose-500" /> : isUrgent ? <Warning size={18} weight="fill" className="text-amber-500" /> : <CheckCircle size={18} weight="fill" className="text-emerald-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${isDark ? "text-white" : "text-gray-900"}`}>{d.label}</p>
                    <p className={`text-xs ${muted}`}>
                      ينتهي: {addDays(d.startDate, d.days)} · 
                      <span className={`font-bold ms-1 ${isExpired ? "text-rose-500" : isUrgent ? "text-amber-500" : "text-emerald-500"}`}>
                        {isExpired ? `انتهى منذ ${Math.abs(left)} يوم` : `${left} يوم متبقٍ`}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-600"}`}>{d.category}</span>
                    <button onClick={() => remove(d.id)} className={`p-1.5 rounded-lg ${isDark ? "hover:bg-rose-500/10 text-gray-500 hover:text-rose-400" : "hover:bg-rose-50 text-gray-400 hover:text-rose-600"} transition`}><Trash size={13} /></button>
                  </div>
                </motion.div>
              );
            })}
            <AiResultActions text={deadlinesText} filename="gov-deadlines-report" showShare />
          </div>
          </BetaReviewGate>
        )}
        {deadlines.length === 0 && (
          <div className={`${card} p-10 text-center shadow-sm`}>
            <CalendarBlank size={36} className={`mx-auto mb-3 ${isDark ? "text-gray-700" : "text-gray-300"}`} />
            <p className={`text-sm ${muted}`}>أضف مواعيدك الإجرائية لتتابعها</p>
          </div>
        )}
      </div>
    </div>
  );
}
