"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendUp, Users, Gift, ArrowUpRight, ArrowDownLeft,
  CheckCircle, CalendarBlank, Money, Star,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

// ─── Data ─────────────────────────────────────────────────────────────────────
const MONTHLY_DATA = [
  { month: "ديسمبر",  earned: 0,   referrals: 0 },
  { month: "يناير",   earned: 149,  referrals: 1 },
  { month: "فبراير",  earned: 448,  referrals: 2 },
  { month: "مارس",   earned: 149,  referrals: 1 },
  { month: "أبريل",  earned: 796,  referrals: 4 },
  { month: "مايو",   earned: 947,  referrals: 5 },
];

const SOURCES = [
  { label: "باقة Shield",  value: 447,  pct: 47, color: "bg-blue-500",    dot: "bg-blue-500" },
  { label: "باقة AI Pro",  value: 299,  pct: 32, color: "bg-purple-500",  dot: "bg-purple-500" },
  { label: "باقة Max",     value: 199,  pct: 21, color: "bg-[#D4AF37]",   dot: "bg-[#D4AF37]" },
];

const RECENT_TXNS = [
  { name: "بدر القحطاني",   plan: "Max",      amount: 499,  date: "مايو ٢٥",   type: "in" },
  { name: "نورة السبيعي",  plan: "Shield",   amount: 149,  date: "أبريل ٢٢",  type: "in" },
  { name: "سحب أرباح",      plan: "—",        amount: -596, date: "أبريل ١٥",  type: "out" },
  { name: "سلمى الدوسري",  plan: "AI Pro",   amount: 299,  date: "أبريل ١٢",  type: "in" },
  { name: "أحمد العنزي",   plan: "Shield",   amount: 149,  date: "أبريل ٥",   type: "in" },
];

// ─── Micro bar chart ──────────────────────────────────────────────────────────
function BarChart({ isDark }: { isDark: boolean }) {
  const maxVal = Math.max(...MONTHLY_DATA.map(d => d.earned), 1);
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="relative h-32 flex items-end gap-1.5 pt-4">
      {MONTHLY_DATA.map((d, i) => {
        const pct = d.earned === 0 ? 4 : (d.earned / maxVal) * 100;
        const isHov = hovered === i;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group"
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            <AnimatePresence>
              {isHov && d.earned > 0 && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={`absolute -top-1 left-1/2 -translate-x-1/2 px-2 py-1 rounded-lg text-[10px] font-black z-10 whitespace-nowrap ${
                    isDark ? "bg-zinc-800 border border-white/10 text-white" : "bg-white border border-slate-200 shadow-md text-zinc-900"
                  }`} style={{ left: `${(i / (MONTHLY_DATA.length - 1)) * 100}%` }}>
                  {d.earned} ر.س · {d.referrals} إحالة
                </motion.div>
              )}
            </AnimatePresence>
            <motion.div
              initial={{ height: 0 }} animate={{ height: `${pct}%` }}
              transition={{ delay: i * 0.05, type: "spring", stiffness: 200, damping: 25 }}
              className={`w-full rounded-t-md transition-all cursor-pointer ${
                d.earned === 0
                  ? isDark ? "bg-zinc-800" : "bg-slate-100"
                  : isHov
                    ? "bg-[#D4AF37]"
                    : isDark ? "bg-[#D4AF37]/60" : "bg-[#D4AF37]/80"
              }`} />
            <span className={`text-[9px] font-bold truncate w-full text-center ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{d.month}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Donut-style source breakdown ─────────────────────────────────────────────
function SourceBreakdown({ isDark }: { isDark: boolean }) {
  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-400" : "text-zinc-500";
  return (
    <div className="space-y-2.5">
      {SOURCES.map((s, i) => (
        <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06 }}
          className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
              <span className={`text-[12px] font-bold ${tp}`}>{s.label}</span>
            </div>
            <span className={`text-[12px] font-black font-mono ${isDark ? "text-[#D4AF37]" : "text-amber-700"}`}>{s.value} ر.س</span>
          </div>
          <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${s.pct}%` }} transition={{ delay: 0.2 + i * 0.06, type: "spring", stiffness: 120, damping: 20 }}
              className={`h-full rounded-full ${s.color}`} />
          </div>
          <p className={`text-[10px] ${ts}`}>{s.pct}% من إجمالي الأرباح</p>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AmbassadorAnalyticsPage() {
  const { isDark } = useTheme();
  const [period, setPeriod] = useState<"month" | "all">("month");

  const card = isDark
    ? "rounded-3xl border border-white/10 bg-black/40 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
    : "rounded-3xl border border-white/60 bg-white/70 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,1),0_4px_24px_-8px_rgba(0,0,0,0.06)]";

  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-400" : "text-zinc-500";

  const currentMonth = MONTHLY_DATA[MONTHLY_DATA.length - 1];
  const lastMonth    = MONTHLY_DATA[MONTHLY_DATA.length - 2];
  const totalAll     = MONTHLY_DATA.reduce((s, d) => s + d.earned, 0);
  const growth = lastMonth.earned > 0
    ? Math.round(((currentMonth.earned - lastMonth.earned) / lastMonth.earned) * 100)
    : 100;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8" dir="rtl">

      {/* Ambient glow */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#D4AF37]/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="relative z-10">
        <motion.div animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 3, repeat: Infinity }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-[#D4AF37] text-[10px] font-black mb-3">
          <Star size={10} weight="fill" /> سفير نظامي
        </motion.div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className={`text-3xl font-black tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>لوحة الإحصائيات</h1>
            <p className={`text-sm mt-1 ${ts}`}>أرباحك، مصادر دخلك، وأداء إحالاتك</p>
          </div>
          <div className={`flex items-center gap-1 p-1 rounded-xl ${isDark ? "bg-zinc-900 border border-white/10" : "bg-slate-100"}`}>
            {(["month", "all"] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 rounded-lg text-[12px] font-black transition-all ${
                  period === p
                    ? isDark ? "bg-zinc-700 text-white" : "bg-white text-zinc-900 shadow-sm"
                    : ts
                }`}>
                {p === "month" ? "هذا الشهر" : "الكل"}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* KPI Row — asymmetric 3-col grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Primary KPI — wide */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className={`md:col-span-1 p-6 relative overflow-hidden ${card}`}>
          <div className="absolute -top-6 -left-6 w-24 h-24 bg-[#D4AF37]/10 rounded-full blur-2xl" />
          <p className={`text-[11px] font-black uppercase tracking-widest mb-2 ${ts}`}>
            {period === "month" ? "أرباح هذا الشهر" : "إجمالي الأرباح"}
          </p>
          <p className={`text-5xl font-black font-mono ${isDark ? "text-[#D4AF37]" : "text-amber-600"}`}>
            {period === "month" ? currentMonth.earned : totalAll}
            <span className="text-lg ms-1">ر.س</span>
          </p>
          {period === "month" && (
            <div className={`flex items-center gap-1.5 mt-3 text-[12px] font-bold ${growth >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {growth >= 0 ? <TrendUp size={14} /> : <ArrowDownLeft size={14} />}
              {growth >= 0 ? "+" : ""}{growth}% مقارنة بالشهر الماضي
            </div>
          )}
        </motion.div>

        {/* Secondary KPIs */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className={`p-6 flex flex-col justify-between ${card}`}>
          <div className="flex items-start justify-between">
            <p className={`text-[11px] font-black uppercase tracking-widest ${ts}`}>إحالات الشهر</p>
            <Users size={18} weight="duotone" className={isDark ? "text-zinc-500" : "text-slate-400"} />
          </div>
          <p className={`text-4xl font-black font-mono mt-4 ${tp}`}>{currentMonth.referrals}</p>
          <p className={`text-[11px] mt-2 ${ts}`}>{lastMonth.referrals} الشهر الماضي</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className={`p-6 flex flex-col justify-between ${card}`}>
          <div className="flex items-start justify-between">
            <p className={`text-[11px] font-black uppercase tracking-widest ${ts}`}>معدل التحويل</p>
            <ArrowUpRight size={18} weight="duotone" className={isDark ? "text-zinc-500" : "text-slate-400"} />
          </div>
          <p className={`text-4xl font-black font-mono mt-4 ${tp}`}>٨١<span className="text-2xl">٪</span></p>
          <div className="flex items-center gap-1.5 mt-2">
            <div className={`h-1.5 flex-1 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
              <motion.div initial={{ width: 0 }} animate={{ width: "81%" }} transition={{ delay: 0.5, type: "spring" }}
                className="h-full bg-emerald-500 rounded-full" />
            </div>
            <span className="text-[10px] text-emerald-500 font-black">ممتاز</span>
          </div>
        </motion.div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Bar chart — wide */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className={`lg:col-span-3 p-6 ${card}`}>
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-[14px] font-black ${tp}`}>الأرباح الشهرية</h2>
            <div className={`flex items-center gap-1.5 text-[11px] font-bold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              <span className="w-2 h-2 rounded-full bg-[#D4AF37]" /> ريال سعودي
            </div>
          </div>
          <BarChart isDark={isDark} />
        </motion.div>

        {/* Source breakdown */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className={`lg:col-span-2 p-6 ${card}`}>
          <h2 className={`text-[14px] font-black mb-6 ${tp}`}>مصادر الدخل</h2>
          <SourceBreakdown isDark={isDark} />
          <div className={`mt-4 pt-4 border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
            <p className={`text-[10px] ${ts}`}>استناداً لأرباح آخر ٦ أشهر</p>
          </div>
        </motion.div>
      </div>

      {/* Recent transactions */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className={`p-6 ${card}`}>
        <div className="flex items-center justify-between mb-5">
          <h2 className={`text-[14px] font-black ${tp}`}>آخر الحركات</h2>
          <Link href="/dashboard/client/celebrity/referrals"
            className={`flex items-center gap-1 text-[11px] font-black transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-200" : "text-slate-400 hover:text-slate-700"}`}>
            كل الإحالات <ArrowUpRight size={11} />
          </Link>
        </div>
        <div className="space-y-0 divide-y divide-white/[0.04]">
          {RECENT_TXNS.map((t, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.32 + i * 0.04 }}
              className={`flex items-center justify-between py-3.5`}>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  t.type === "out"
                    ? isDark ? "bg-red-900/30" : "bg-red-50"
                    : isDark ? "bg-[#D4AF37]/10" : "bg-amber-50"
                }`}>
                  {t.type === "out"
                    ? <ArrowDownLeft size={15} className="text-red-500" />
                    : <Gift size={15} className={isDark ? "text-[#D4AF37]" : "text-amber-600"} />
                  }
                </div>
                <div>
                  <p className={`text-[13px] font-bold ${tp}`}>{t.name}</p>
                  <p className={`text-[10px] ${ts}`}>{t.plan !== "—" ? `باقة ${t.plan} · ` : ""}{t.date}</p>
                </div>
              </div>
              <span className={`text-[14px] font-black font-mono ${
                t.type === "out" ? "text-red-500" : isDark ? "text-[#D4AF37]" : "text-amber-600"
              }`}>
                {t.type === "out" ? "" : "+"}{t.amount} ر.س
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Bottom CTA */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
        className="grid grid-cols-2 gap-4">
        <Link href="/dashboard/client/celebrity/referrals"
          className={`flex items-center justify-center gap-2 py-3.5 rounded-2xl border text-[13px] font-black transition-all ${
            isDark ? "border-white/10 text-zinc-300 hover:bg-white/[0.04]" : "border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}>
          <Users size={15} /> الإحالات والعمولات
        </Link>
        <Link href="/dashboard/client/celebrity/code"
          className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] text-black font-black text-[13px] transition-all hover:opacity-90 hover:scale-[1.01]">
          <Gift size={15} /> شارك رابط الإحالة
        </Link>
      </motion.div>
    </div>
  );
}
