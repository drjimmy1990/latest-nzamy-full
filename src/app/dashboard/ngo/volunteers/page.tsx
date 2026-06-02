"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, Plus, HandHeart, CheckCircle, Warning } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import EmptyState from "@/components/ui/EmptyState";

const VOLUNTEERS = [
  { name: "ريم الحربي",        role: "منسقة فعاليات",  status: "نشط",          hours: 47, hasContract: true },
  { name: "عبدالعزيز الدوسري", role: "مصمم جرافيك",   status: "نشط",          hours: 31, hasContract: true },
  { name: "نورة القحطاني",     role: "مدربة تطوعية",   status: "موقف مؤقتاً",  hours: 18, hasContract: false },
];

export default function NGOVolunteersPage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const bg    = isDark ? "bg-zinc-950" : "bg-slate-50";
  const card  = `rounded-2xl border ${isDark ? "bg-zinc-900/40 border-white/5" : "bg-white border-slate-200"}`;
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const head  = isDark ? "text-white" : "text-slate-900";
  const row   = isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50";
  const div   = isDark ? "divide-white/5" : "divide-slate-100";

  return (
    <div className={`${bg} min-h-[100dvh] pb-20`} dir="rtl">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-emerald-500/10" : "bg-emerald-50"}`}>
              <Users size={22} weight="duotone" className={isDark ? "text-emerald-400" : "text-emerald-600"} />
            </div>
            <div>
              <h1 className={`text-lg font-black ${head}`}>المتطوعون</h1>
              <p className={`text-xs ${muted}`}>{VOLUNTEERS.length} متطوع · {VOLUNTEERS.filter(v => v.status === "نشط").length} نشط</p>
            </div>
          </div>
          <div className="flex gap-2">
            <a href="/ai/ngo/volunteer-contract"
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition ${isDark ? "bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400" : "bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700"}`}>
              <HandHeart size={14} /> صائغ عقد تطوع
            </a>
            <button className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition ${isDark ? "bg-white/5 border border-white/10 hover:bg-white/10 text-gray-200" : "bg-gray-100 border border-gray-200 hover:bg-gray-200 text-gray-700"}`}>
              <Plus size={14} /> متطوع جديد
            </button>
          </div>
        </div>

        {/* Table */}
        <div className={`${card} overflow-hidden shadow-sm`}>
          <div className={`grid grid-cols-[1fr_1fr_auto_auto_auto] px-5 py-3 text-xs font-bold border-b ${isDark ? "text-slate-500 bg-zinc-950 border-white/5" : "text-slate-400 bg-slate-50 border-slate-100"}`}>
            <span>الاسم</span><span>الدور</span><span>الساعات</span><span>العقد</span><span>الحالة</span>
          </div>
          <div className={`divide-y ${div}`}>
            {VOLUNTEERS.length === 0 ? (
              <EmptyState
                icon={<Users size={28} weight="duotone" />}
                title="لا يوجد متطوعون حتى الآن"
                description="اضغط «متطوع جديد» أو استخدم صائغ عقد التطوع لإضافة أوّل متطوع"
                action={{ label: "إضافة متطوع", href: '/dashboard/ngo/volunteers/new' }}
                secondaryAction={{ label: "صائغ عقد", href: '/ai/ngo/volunteer-contract' }}
                size="sm"
              />
            ) : (
              VOLUNTEERS.map((v, i) => (
                <motion.div key={v.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}
                  className={`grid grid-cols-[1fr_1fr_auto_auto_auto] px-5 py-4 items-center gap-4 transition ${row}`}>
                  <span className={`font-semibold text-sm ${isDark ? "text-gray-200" : "text-gray-800"}`}>{v.name}</span>
                  <span className={`text-sm ${muted}`}>{v.role}</span>
                  <span className={`text-sm font-mono font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{v.hours}</span>
                  <span>
                    {v.hasContract
                      ? <span className="flex items-center gap-1 text-xs text-emerald-500 font-bold"><CheckCircle size={11} weight="fill" /> مفعّل</span>
                      : <span className="flex items-center gap-1 text-xs text-amber-500 font-bold"><Warning size={11} weight="fill" /> مطلوب</span>}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs border font-bold ${v.status === "نشط" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"}`}>
                    {v.status}
                  </span>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
