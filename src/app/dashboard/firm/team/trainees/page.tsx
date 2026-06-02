"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  GraduationCap, CalendarBlank, Clock, CheckCircle,
  Star, FileText, ChartLine, ArrowUpRight, Plus,
  Buildings, UserCircle, Scales, Brain, Trophy,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Mock Data ──────────────────────────────────────────────────────────────

interface Trainee {
  name: string;
  avatar: string;
  startDate: string;
  endDate: string;
  university: string;
  supervisor: string;
  hoursCompleted: number;
  hoursRequired: number;
  casesAssisted: number;
  rating: number;
  status: "active" | "completed" | "pending";
  skills: string[];
}

const TRAINEES: Trainee[] = [
  {
    name: "أ. نايف الحربي",
    avatar: "ن",
    startDate: "١ يناير ٢٠٢٥",
    endDate: "٣٠ يونيو ٢٠٢٥",
    university: "جامعة الملك سعود",
    supervisor: "أ. فهد العتيبي",
    hoursCompleted: 720,
    hoursRequired: 1200,
    casesAssisted: 8,
    rating: 4.2,
    status: "active",
    skills: ["بحث قانوني", "صياغة مذكرات", "حضور جلسات"],
  },
  {
    name: "أ. لمى الشهري",
    avatar: "ل",
    startDate: "١ مارس ٢٠٢٥",
    endDate: "٢٨ أغسطس ٢٠٢٥",
    university: "جامعة أم القرى",
    supervisor: "أ. سارة القحطاني",
    hoursCompleted: 280,
    hoursRequired: 1200,
    casesAssisted: 3,
    rating: 4.5,
    status: "active",
    skills: ["بحث قانوني", "مراجعة عقود"],
  },
  {
    name: "أ. فيصل الدوسري",
    avatar: "ف",
    startDate: "١ يوليو ٢٠٢٤",
    endDate: "٣١ ديسمبر ٢٠٢٤",
    university: "جامعة الملك عبدالعزيز",
    supervisor: "أ. فهد العتيبي",
    hoursCompleted: 1200,
    hoursRequired: 1200,
    casesAssisted: 15,
    rating: 4.8,
    status: "completed",
    skills: ["بحث قانوني", "صياغة مذكرات", "ترافع", "تحكيم"],
  },
];

const STATUS_MAP = {
  active: { label: "نشط", cls: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  completed: { label: "مكتمل", cls: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  pending: { label: "في الانتظار", cls: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function TraineesPage() {
  const { isDark } = useTheme();
  const [selected, setSelected] = useState(0);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const trainee = TRAINEES[selected];
  const pct = Math.round((trainee.hoursCompleted / trainee.hoursRequired) * 100);

  return (
    <div className="max-w-[1100px] mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-xl font-bold mb-0.5 flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            <GraduationCap className="text-[#C8A762]" weight="duotone" /> إدارة المتدربين
          </h1>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            متابعة فترة التدريب وتقييم الأداء — متطلبات الهيئة السعودية للمحامين
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
          <Plus size={14} weight="bold" /> إضافة متدرب
        </button>
      </motion.div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "متدربون نشطون", value: TRAINEES.filter(t => t.status === "active").length.toString(), icon: UserCircle, color: "text-emerald-500", bg: "bg-emerald-500/8" },
          { label: "إجمالي القضايا المساعدة", value: TRAINEES.reduce((s, t) => s + t.casesAssisted, 0).toString(), icon: Scales, color: "text-royal", bg: "bg-royal/8" },
          { label: "ساعات التدريب (المجموع)", value: TRAINEES.reduce((s, t) => s + t.hoursCompleted, 0).toLocaleString("ar-SA"), icon: Clock, color: "text-blue-500", bg: "bg-blue-500/8" },
          { label: "متوسط التقييم", value: (TRAINEES.reduce((s, t) => s + t.rating, 0) / TRAINEES.length).toFixed(1), icon: Star, color: "text-[#C8A762]", bg: "bg-[#C8A762]/8" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`${card} p-4`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${kpi.bg}`}>
                <Icon size={18} weight="duotone" className={kpi.color} />
              </div>
              <p className={`text-[11px] mb-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{kpi.label}</p>
              <p className={`text-lg font-bold font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{kpi.value}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Trainee cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {TRAINEES.map((t, i) => {
          const st = STATUS_MAP[t.status];
          const progress = Math.round((t.hoursCompleted / t.hoursRequired) * 100);
          const isSelected = selected === i;

          return (
            <motion.button
              key={i}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.07 }}
              onClick={() => setSelected(i)}
              className={`${card} p-5 text-right transition-all w-full ${isSelected ? "ring-2 ring-royal/40" : ""}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold ${isDark ? "bg-royal/20 text-royal" : "bg-royal/10 text-royal"}`}>
                    {t.avatar}
                  </div>
                  <div>
                    <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{t.name}</p>
                    <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{t.university}</p>
                  </div>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
              </div>

              {/* Progress */}
              <div className="mb-2">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className={isDark ? "text-zinc-500" : "text-slate-400"}>إنجاز الساعات</span>
                  <span className={`font-mono font-semibold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{progress}%</span>
                </div>
                <div className={`h-1.5 rounded-full ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                  <motion.div
                    className={`h-full rounded-full ${progress >= 100 ? "bg-emerald-500" : "bg-royal"}`}
                    initial={{ width: 0 }} animate={{ width: `${Math.min(progress, 100)}%` }}
                    transition={{ duration: 0.7, delay: 0.3 + i * 0.1 }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px]">
                <span className={isDark ? "text-zinc-600" : "text-slate-400"}>{t.casesAssisted} قضية</span>
                <span className="flex items-center gap-0.5 text-[#C8A762]">
                  <Star size={10} weight="fill" /> {t.rating}
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Selected trainee detail */}
      <motion.div key={selected} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className={`${card} p-5`}>
        <h2 className={`text-sm font-bold mb-4 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
          تفاصيل التدريب — {trainee.name}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "المشرف", value: trainee.supervisor },
            { label: "بداية التدريب", value: trainee.startDate },
            { label: "نهاية التدريب", value: trainee.endDate },
            { label: "الساعات", value: `${trainee.hoursCompleted.toLocaleString("ar-SA")} / ${trainee.hoursRequired.toLocaleString("ar-SA")}` },
          ].map((item, i) => (
            <div key={i}>
              <p className={`text-[10px] mb-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{item.label}</p>
              <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{item.value}</p>
            </div>
          ))}
        </div>

        {/* Skills */}
        <div className="mt-4 pt-4 border-t border-white/[0.06] dark:border-white/[0.06]">
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>المهارات المكتسبة</p>
          <div className="flex flex-wrap gap-1.5">
            {trainee.skills.map((skill, i) => (
              <span key={i} className={`text-[11px] px-2.5 py-1 rounded-lg font-medium ${
                isDark ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15" : "bg-emerald-50 text-emerald-600 border border-emerald-100"
              }`}>
                {skill}
              </span>
            ))}
          </div>
        </div>

        {trainee.status === "completed" && (
          <div className={`mt-4 p-3 rounded-xl flex items-center gap-3 ${isDark ? "bg-[#C8A762]/5 border border-[#C8A762]/15" : "bg-amber-50/60 border border-amber-200/50"}`}>
            <Trophy size={18} className="text-[#C8A762]" weight="fill" />
            <div>
              <p className={`text-[12px] font-bold ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>أكمل فترة التدريب بنجاح</p>
              <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-amber-600/70"}`}>يمكن إصدار شهادة إتمام التدريب وتقييم الأداء النهائي</p>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
