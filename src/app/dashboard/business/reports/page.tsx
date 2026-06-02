"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ChartBar, TrendUp, TrendDown, ArrowLeft,
  Scales, Clock, CurrencyDollar, Users,
  CalendarBlank, Buildings, ArrowRight,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const DEPT_REPORTS = [
  {
    id: "HR",
    nameAr: "الموارد البشرية",
    icon: Users,
    cases: 8, resolved: 6, pending: 2,
    avgDays: 21, fees: "٢٣,٤٠٠", trend: +14,
    color: "from-blue-600 to-blue-400",
  },
  {
    id: "LEGAL",
    nameAr: "الشؤون القانونية",
    icon: Scales,
    cases: 13, resolved: 9, pending: 4,
    avgDays: 34, fees: "٦١,٢٠٠", trend: +8,
    color: "from-[#0B3D2E] to-[#1a6b50]",
  },
  {
    id: "PROC",
    nameAr: "المشتريات",
    icon: Buildings,
    cases: 5, resolved: 5, pending: 0,
    avgDays: 15, fees: "١٨,٧٠٠", trend: -3,
    color: "from-purple-600 to-purple-400",
  },
  {
    id: "FIN",
    nameAr: "المالية",
    icon: CurrencyDollar,
    cases: 4, resolved: 3, pending: 1,
    avgDays: 28, fees: "١٤,١٠٠", trend: +22,
    color: "from-[#b8974f] to-[#C8A762]",
  },
];

const MONTHLY_TREND = [
  { month: "أكتوبر", cases: 7, fees: 28400 },
  { month: "نوفمبر", cases: 11, fees: 41800 },
  { month: "ديسمبر", cases: 9, fees: 35200 },
  { month: "يناير", cases: 14, fees: 52700 },
  { month: "فبراير", cases: 12, fees: 47300 },
  { month: "مارس", cases: 16, fees: 63400 },
];

const maxFees = Math.max(...MONTHLY_TREND.map(m => m.fees));
const maxCases = Math.max(...MONTHLY_TREND.map(m => m.cases));

// ─── Component ────────────────────────────────────────────────────────────────

import { RoleGuard } from "@/components/dashboard/RoleGuard";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";

export default function BusinessReportsPage() {
  const { isDark } = useTheme();

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  const fadeUp = {
    hidden: { opacity: 0, y: 18 },
    show: (i: number) => ({
      opacity: 1, y: 0,
      transition: { delay: i * 0.07, duration: 0.4, ease: "easeOut" as const },
    }),
  };

  return (
    <RoleGuard blockedRoles={["employee"]}>
    <SubscriptionGuard featureKey="reports">
    <div className={`p-5 md:p-8 space-y-6 max-w-7xl mx-auto ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}
        className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/dashboard/business" className={`flex items-center gap-1 text-[13px] ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
              لوحة التحكم <ArrowLeft size={13} />
            </Link>
          </div>
          <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>
            تقارير الأقسام
          </h1>
          <p className={`text-sm mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>مارس ٢٠٢٦ — الزهراني للمقاولات</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-xl px-3 py-1.5 text-[12px] font-medium border flex items-center gap-1.5 ${isDark ? "border-white/[0.06] bg-zinc-800 text-zinc-300" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>
            <CalendarBlank size={13} />
            الربع الأول ٢٠٢٦
          </span>
        </div>
      </motion.div>

      {/* ── Summary KPIs ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "إجمالي القضايا", value: "٣٠", sub: "هذا الربع", icon: Scales, color: "text-[#0B3D2E]", trend: +11 },
          { label: "معدل الإنجاز", value: "٧٩٪", sub: "٢٣ من ٣٠", icon: ChartBar, color: "text-emerald-600", trend: +5 },
          { label: "متوسط الحل", value: "٢٤ يوم", sub: "عبر كل الأقسام", icon: Clock, color: "text-blue-600", trend: -8 },
          { label: "إجمالي الأتعاب", value: "١١٧,٤٠٠", sub: "ريال سعودي", icon: CurrencyDollar, color: "text-[#C8A762]", trend: +18 },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          const isUp = kpi.trend > 0;
          return (
            <motion.div
              key={i} variants={fadeUp} initial="hidden" animate="show" custom={i + 1}
              whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 280, damping: 22 }}
              className={`${card} p-5 shadow-sm`}
            >
              <div className="flex items-start justify-between mb-3">
                <Icon size={20} className={kpi.color} weight="duotone" />
                <span className={`flex items-center gap-0.5 text-[11px] font-bold ${isUp ? "text-emerald-500" : "text-red-400"}`}>
                  {isUp ? <TrendUp size={11} /> : <TrendDown size={11} />}
                  {Math.abs(kpi.trend)}٪
                </span>
              </div>
              <p className={`font-mono text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>{kpi.value}</p>
              <p className={`text-[12px] font-medium mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>{kpi.label}</p>
              <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{kpi.sub}</p>
            </motion.div>
          );
        })}
      </div>

      {/* ── Dept table + Chart ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

        {/* Dept breakdown — 3fr */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={5}
          className={`xl:col-span-3 ${card} overflow-hidden shadow-sm`}>
          <div className={`flex items-center gap-2 px-6 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
            <Buildings size={16} weight="fill" className={isDark ? "text-emerald-400" : "text-[#0B3D2E]"} />
            <h2 className="font-bold text-[15px]">أداء الأقسام</h2>
          </div>
          <div className={`divide-y ${isDark ? "divide-white/[0.04]" : "divide-zinc-50"}`}>
            {DEPT_REPORTS.map((d) => {
              const Icon = d.icon;
              const pct = Math.round((d.resolved / d.cases) * 100);
              const isUp = d.trend > 0;
              return (
                <Link key={d.id} href={`/dashboard/business/departments`}>
                  <div className={`px-6 py-4 transition-colors ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-zinc-50/70"}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`h-9 w-9 flex-shrink-0 rounded-xl bg-gradient-to-br ${d.color} flex items-center justify-center shadow-sm`}>
                        <Icon size={16} weight="fill" className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{d.nameAr}</p>
                          <span className={`flex items-center gap-0.5 text-[11px] font-bold ${isUp ? "text-emerald-500" : "text-red-400"}`}>
                            {isUp ? <TrendUp size={11} /> : <TrendDown size={11} />}
                            {Math.abs(d.trend)}٪
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{d.cases} قضية</span>
                          <span className={`text-[11px] text-emerald-500`}>{d.resolved} منجز</span>
                          {d.pending > 0 && <span className={`text-[11px] text-amber-500`}>{d.pending} معلق</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`flex-1 h-1.5 rounded-full ${isDark ? "bg-white/[0.06]" : "bg-zinc-100"}`}>
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                          transition={{ delay: 0.5, duration: 0.7, ease: "easeOut" }}
                          className={`h-full rounded-full bg-gradient-to-r ${d.color}`}
                        />
                      </div>
                      <span className={`text-[11px] font-mono font-bold flex-shrink-0 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{pct}٪</span>
                      <span className={`text-[11px] font-mono flex-shrink-0 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{d.fees} ر.س</span>
                      <ArrowRight size={12} className={isDark ? "text-zinc-700" : "text-zinc-300"} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </motion.div>

        {/* Activity chart — 2fr */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" custom={6}
          className={`xl:col-span-2 ${card} overflow-hidden shadow-sm`}>
          <div className={`px-5 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
            <h2 className="font-bold text-[15px]">النشاط الشهري</h2>
            <p className={`text-[12px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>القضايا والأتعاب — آخر ٦ أشهر</p>
          </div>
          <div className="p-5">
            {/* Fee bars */}
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>الأتعاب (ر.س)</p>
            <div className="flex items-end gap-1.5 h-28" dir="ltr">
              {MONTHLY_TREND.map((m, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(m.fees / maxFees) * 100}%` }}
                    transition={{ delay: 0.3 + i * 0.08, duration: 0.6, ease: "easeOut" }}
                    className="w-full rounded-t-lg bg-gradient-to-t from-[#0B3D2E] to-[#1a6b50] min-h-[4px]"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 mt-1.5" dir="ltr">
              {MONTHLY_TREND.map((m, i) => (
                <p key={i} className={`flex-1 text-center text-[9px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                  {m.month.slice(0, 3)}
                </p>
              ))}
            </div>

            <div className={`my-4 border-t ${isDark ? "border-white/[0.05]" : "border-zinc-100"}`} />

            {/* Cases dots */}
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>عدد القضايا</p>
            <div className="flex items-end gap-1.5 h-16" dir="ltr">
              {MONTHLY_TREND.map((m, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(m.cases / maxCases) * 100}%` }}
                    transition={{ delay: 0.5 + i * 0.08, duration: 0.6, ease: "easeOut" }}
                    className="w-full rounded-t-md bg-gradient-to-t from-[#C8A762]/80 to-[#C8A762] min-h-[4px]"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 mt-1.5" dir="ltr">
              {MONTHLY_TREND.map((m, i) => (
                <p key={i} className={`flex-1 text-center text-[9px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                  {m.cases}
                </p>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

    </div>
    </SubscriptionGuard>
    </RoleGuard>
  );
}
