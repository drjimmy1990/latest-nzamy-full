"use client";

import { memo, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChartLine, ChartBar, ArrowUpRight, ArrowDown,
  Gavel, Money, Users, CalendarCheck, TrendUp, Download,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const KPIS = [
  { label: "معدل الفوز",         value: "٧٢%",        trend: "+٤%",  up: true,  color: "text-emerald-500", bg: "bg-emerald-500/10", icon: Gavel,       sub: "من إجمالي القضايا المغلقة" },
  { label: "متوسط وقت الحل",    value: "٤.٢ شهر",    trend: "-٠.٨", up: true,  color: "text-blue-500",    bg: "bg-blue-500/10",    icon: CalendarCheck,sub: "من تقديم إلى حكم" },
  { label: "رضا الموكلين",       value: "٤.٧/٥",      trend: "+٠.٢", up: true,  color: "text-amber-500",   bg: "bg-amber-500/10",   icon: Users,       sub: "استناداً لـ ٨٦ تقييم" },
  { label: "الإيراد لكل قضية",  value: "٣٢,٠٠٠ ﷼",  trend: "+١٢%", up: true,  color: "text-purple-500",  bg: "bg-purple-500/10",  icon: Money,       sub: "متوسط أتعاب قضية واحدة" },
];

const CASE_TYPES = [
  { label: "تجاري",           pct: 38, count: 15, color: "bg-royal",        win: 80 },
  { label: "عمالي",           pct: 22, count: 9,  color: "bg-emerald-500",  win: 78 },
  { label: "مدني",            pct: 17, count: 7,  color: "bg-amber-500",    win: 65 },
  { label: "أحوال شخصية",    pct: 12, count: 5,  color: "bg-purple-500",   win: 70 },
  { label: "إداري",           pct: 11, count: 4,  color: "bg-blue-500",     win: 60 },
];

const MONTHLY_TREND = [
  { month: "نوفمبر", new: 3, closed: 2 },
  { month: "ديسمبر", new: 5, closed: 3 },
  { month: "يناير",  new: 4, closed: 5 },
  { month: "فبراير", new: 7, closed: 4 },
  { month: "مارس",   new: 6, closed: 6 },
  { month: "أبريل",  new: 8, closed: 5 },
];
const maxTrend = Math.max(...MONTHLY_TREND.flatMap(m => [m.new, m.closed]));

const TEAM_PERF = [
  { id: "1", name: "سارة المنصور",  cases: 12, won: 9,  revenue: "٧٢,٠٠٠" },
  { id: "2", name: "تركي العمر",    cases: 9,  won: 6,  revenue: "٤٨,٠٠٠" },
  { id: "3", name: "نورة الشمري",   cases: 11, won: 8,  revenue: "٥٦,٠٠٠" },
  { id: "4", name: "خالد الحربي",   cases: 8,  won: 5,  revenue: "٤٠,٠٠٠" },
];

// ─── Micro-Components (Isolated for Performance) ──────────────────────────────

const PerpetualPulse = memo(({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => {
  return (
    <motion.div
      animate={{ opacity: [1, 0.7, 1], scale: [1, 0.99, 1] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay }}
    >
      {children}
    </motion.div>
  );
});
PerpetualPulse.displayName = "PerpetualPulse";

const AnimatedBar = memo(({ height, color, delay }: { height: number; color: string; delay: number }) => {
  return (
    <motion.div
      className={`w-full rounded-t-md ${color}`}
      initial={{ height: 0 }}
      animate={{ height: `${height}%` }}
      transition={{ duration: 0.8, delay, type: "spring", stiffness: 80, damping: 15 }}
      style={{ minHeight: 4 }}
    >
      <motion.div 
        className="w-full h-full opacity-50 bg-gradient-to-t from-transparent to-white/20"
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear", delay }}
      />
    </motion.div>
  );
});
AnimatedBar.displayName = "AnimatedBar";

const LiquidCard = ({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => {
  const { isDark } = useTheme();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, type: "spring", stiffness: 100, damping: 20 }}
      className={`
        relative overflow-hidden rounded-[2.5rem] p-8 sm:p-10
        ${isDark 
          ? "bg-[#0d1117]/80 backdrop-blur-xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" 
          : "bg-white border border-slate-200/50 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]"
        }
        ${className}
      `}
    >
      {children}
    </motion.div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FirmAnalyticsPage() {
  const { isDark } = useTheme();

  return (
    <div className="max-w-[1400px] mx-auto pb-12" dir="rtl">
      
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, filter: "blur(4px)" }} 
        animate={{ opacity: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.8 }}
        className="mb-10 px-2 flex flex-col sm:flex-row sm:items-end justify-between gap-4"
      >
        <div className="space-y-2">
          <h1 className={`text-4xl md:text-5xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`} style={{ fontFamily: "var(--font-brand)" }}>
            التحليلات والأداء
          </h1>
          <p className={`text-base ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
            نظرة شاملة على مؤشرات الأداء الحية لمكتب المحاماة · الربع الأول ٢٠٢٦
          </p>
        </div>
        <button className={`flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-semibold transition-all active:scale-[0.98] ${
          isDark 
            ? "bg-white/5 hover:bg-white/10 text-white border border-white/10" 
            : "bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/10"
        }`}>
          <Download size={18} weight="bold" />
          <span>تصدير التقرير</span>
        </button>
      </motion.div>

      {/* Bento Grid Architecture */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* ROW 1: KPIs */}
        {KPIS.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <LiquidCard key={i} delay={i * 0.1} className="md:col-span-6 xl:col-span-3 flex flex-col justify-between group">
              <div className="flex justify-between items-start mb-8">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${kpi.bg}`}>
                  <Icon size={28} weight="duotone" className={kpi.color} />
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${kpi.up ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                  {kpi.up ? <ArrowUpRight size={14} weight="bold" /> : <ArrowDown size={14} weight="bold" />}
                  <span className="font-mono">{kpi.trend}</span>
                </div>
              </div>
              
              <div>
                <PerpetualPulse delay={i * 0.2}>
                  <p className={`text-4xl md:text-5xl font-mono tracking-tighter font-bold mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>
                    {kpi.value}
                  </p>
                </PerpetualPulse>
                <p className={`text-sm font-bold ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{kpi.label}</p>
                <p className={`text-xs mt-1.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{kpi.sub}</p>
              </div>
            </LiquidCard>
          );
        })}

        {/* ROW 2: Charts */}
        <LiquidCard delay={0.4} className="md:col-span-12 xl:col-span-8 flex flex-col">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h2 className={`text-2xl font-bold tracking-tight mb-2 ${isDark ? "text-white" : "text-slate-800"}`}>
                حركة القضايا
              </h2>
              <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-500"}`}>مقارنة القضايا الواردة والمغلقة شهرياً</p>
            </div>
            <div className="flex items-center gap-5 text-sm font-semibold">
              <span className={`flex items-center gap-2 ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                <span className="w-3.5 h-3.5 rounded-full bg-royal shadow-[0_0_12px_rgba(var(--color-royal-rgb),0.5)]" /> واردة
              </span>
              <span className={`flex items-center gap-2 ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]" /> مغلقة
              </span>
            </div>
          </div>
          
          <div className="flex-1 flex items-end gap-3 sm:gap-8 h-[280px] pt-4 border-b border-dashed border-slate-200/20 dark:border-white/5 pb-2 relative">
            {MONTHLY_TREND.map((d, i) => (
              <div key={d.month} className="flex-1 flex flex-col justify-end h-full relative group">
                <div className="flex items-end justify-center gap-2 sm:gap-4 h-full z-10">
                  <AnimatedBar height={(d.new / maxTrend) * 100} color="bg-royal" delay={0.5 + i * 0.1} />
                  <AnimatedBar height={(d.closed / maxTrend) * 100} color="bg-emerald-500" delay={0.55 + i * 0.1} />
                </div>
                <div className="absolute -bottom-10 left-0 right-0 text-center">
                  <p className={`text-sm font-medium ${isDark ? "text-zinc-500 group-hover:text-zinc-300" : "text-slate-400 group-hover:text-slate-600"} transition-colors`}>
                    {d.month}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </LiquidCard>

        {/* ROW 2.5: Case Types Distribution */}
        <LiquidCard delay={0.5} className="md:col-span-12 xl:col-span-4 flex flex-col">
          <h2 className={`text-2xl font-bold tracking-tight mb-2 ${isDark ? "text-white" : "text-slate-800"}`}>
            التوزيع النوعي
          </h2>
          <p className={`text-sm mb-10 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>نسب القضايا الجارية وأنواعها</p>
          
          <div className="space-y-6 flex-1 flex flex-col justify-center">
            {CASE_TYPES.map((t, i) => (
              <div key={t.label} className="group">
                <div className="flex items-center justify-between text-base mb-3">
                  <span className={`font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{t.label}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                      فوز <span className="font-mono">{t.win}%</span>
                    </span>
                    <span className={`font-mono font-bold text-lg ${isDark ? "text-white" : "text-slate-900"}`}>{t.count}</span>
                  </div>
                </div>
                <div className={`h-3 rounded-full overflow-hidden ${isDark ? "bg-white/5" : "bg-slate-100"}`}>
                  <motion.div 
                    className={`h-full rounded-full ${t.color}`}
                    initial={{ width: 0 }} 
                    animate={{ width: `${t.pct}%` }}
                    transition={{ duration: 1, delay: 0.6 + i * 0.1, type: "spring", stiffness: 50 }} 
                  />
                </div>
              </div>
            ))}
          </div>
        </LiquidCard>

        {/* ROW 3: Intelligent List (Team Performance) */}
        <LiquidCard delay={0.6} className="col-span-12 !p-0">
          <div className="flex items-center justify-between mb-6 p-8 sm:p-10 pb-0">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? "bg-white/5" : "bg-slate-100"}`}>
                <TrendUp size={24} className="text-royal" weight="duotone" />
              </div>
              <div>
                <h2 className={`text-2xl font-bold tracking-tight mb-1 ${isDark ? "text-white" : "text-slate-800"}`}>أداء الفريق</h2>
                <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-500"}`}>مؤشرات الإنجاز والمطالبات المحصلة للمحامين</p>
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto px-8 sm:px-10 pb-8 sm:pb-10">
            <table className="w-full text-base">
              <thead>
                <tr className={`text-sm font-semibold uppercase tracking-wider text-right ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  <th className="px-6 py-5 border-b border-slate-200/20 dark:border-white/5">المحامي</th>
                  <th className="px-6 py-5 border-b border-slate-200/20 dark:border-white/5">إجمالي القضايا</th>
                  <th className="px-6 py-5 border-b border-slate-200/20 dark:border-white/5">القضايا الرابحة</th>
                  <th className="px-6 py-5 border-b border-slate-200/20 dark:border-white/5 hidden sm:table-cell">معدل الإنجاز</th>
                  <th className="px-6 py-5 border-b border-slate-200/20 dark:border-white/5 hidden md:table-cell">الإيراد المحقق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-slate-200/20 dark:divide-white/5">
                <AnimatePresence>
                  {TEAM_PERF.map((m, i) => {
                    const winRate = Math.round((m.won / m.cases) * 100);
                    return (
                      <motion.tr 
                        key={m.id}
                        layout
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        transition={{ delay: 0.7 + i * 0.05, type: "spring", stiffness: 100 }}
                        className={`group transition-colors ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50"}`}
                      >
                        <td className={`px-6 py-6 font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${isDark ? "bg-white/10 text-white" : "bg-slate-200 text-slate-700"}`}>
                              {m.name.split(" ")[0][0]}
                            </div>
                            {m.name}
                          </div>
                        </td>
                        <td className={`px-6 py-6 font-mono font-semibold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{m.cases}</td>
                        <td className={`px-6 py-6 font-mono text-emerald-500 font-bold`}>{m.won}</td>
                        <td className="px-6 py-6 hidden sm:table-cell">
                          <div className="flex items-center gap-4">
                            <div className={`h-2.5 w-32 rounded-full overflow-hidden ${isDark ? "bg-white/5" : "bg-slate-100"}`}>
                              <motion.div 
                                className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-emerald-600"
                                initial={{ width: 0 }} 
                                animate={{ width: `${winRate}%` }}
                                transition={{ duration: 1.2, delay: 0.8 + i * 0.1, type: "spring" }} 
                              />
                            </div>
                            <span className={`text-sm font-mono font-bold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{winRate}%</span>
                          </div>
                        </td>
                        <td className={`px-6 py-6 hidden md:table-cell font-mono font-bold text-lg ${isDark ? "text-zinc-200" : "text-slate-900"}`}>
                          {m.revenue} <span className={`text-xs font-sans font-normal ${isDark ? "text-zinc-500" : "text-slate-400"}`}>ر.س</span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </LiquidCard>

      </div>
    </div>
  );
}
