"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Crown, Check, X, ChartLine, CurrencyCircleDollar,
  ArrowUpRight, Users, Robot, TrendDown, TrendUp, Warning,
  Sparkle, Receipt, Circle,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Plan Data ────────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: "free",
    name: "مجاني",
    color: "text-slate-400",
    bg: "bg-slate-400/10",
    border: "border-slate-300/30",
    price: 0,
    users: 42,
    mrr: 0,
    churnRate: 28,
    features: ["٥ قضايا", "٣ عقود/شهر", "مستشار AI محدود", "×لا دعم فني"],
    limits: { cases: 5, contracts: 3, credits: 20 },
  },
  {
    id: "pro",
    name: "Pro",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    price: 299,
    users: 31,
    mrr: 9269,
    churnRate: 8,
    features: ["قضايا غير محدودة", "٢٠ عقد/شهر", "AI محترف", "دعم فني بالدردشة", "الصائغ القانوني"],
    limits: { cases: -1, contracts: 20, credits: 300 },
  },
  {
    id: "max",
    name: "Max",
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    price: 599,
    users: 18,
    mrr: 10782,
    churnRate: 4,
    features: ["كل ميزات Pro", "عقود غير محدودة", "AI MAX (استخدام واسع)", "محاكاة الخصم", "تقارير متقدمة", "دعم أولوية"],
    limits: { cases: -1, contracts: -1, credits: 1200 },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    price: 1999,
    users: 5,
    mrr: 9995,
    churnRate: 1,
    features: ["كل شيء في Max", "استخدام غير محدود", "تكامل API", "مدير حساب مخصص", "SLA 99.9%", "تدريب الفريق"],
    limits: { cases: -1, contracts: -1, credits: -1 },
  },
];

const REVENUE_HISTORY = [
  { month: "يناير", mrr: 18500 },
  { month: "فبراير", mrr: 22300 },
  { month: "مارس",  mrr: 27800 },
  { month: "أبريل", mrr: 30046 },
];

// ─── Mini Spark Bar ───────────────────────────────────────────────────────────

function SparkBar({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-6">
      {values.map((v, i) => (
        <div key={i} className={`flex-1 rounded-sm ${color}`} style={{ height: `${(v / max) * 100}%`, minHeight: "2px" }} />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSubscriptionsPage() {
  const { isDark } = useTheme();
  const [activePlan, setActivePlan] = useState<string | null>(null);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const totalMRR   = PLANS.reduce((s, p) => s + p.mrr, 0);
  const totalUsers = PLANS.reduce((s, p) => s + p.users, 0);
  const totalARR   = totalMRR * 12;

  return (
    <div className="max-w-5xl mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
          إدارة الاشتراكات والتسعير
        </h1>
        <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          {totalUsers} مشترك نشط · MRR: {totalMRR.toLocaleString()} ﷼ · ARR: {totalARR.toLocaleString()} ﷼
        </p>
      </motion.div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "إجمالي MRR",  value: `${totalMRR.toLocaleString()} ﷼`, icon: CurrencyCircleDollar, color: "text-emerald-500", bg: "bg-emerald-500/8", trend: "+12% هذا الشهر" },
          { label: "مشتركون",     value: totalUsers,                        icon: Users,               color: "text-royal",       bg: "bg-royal/8",       trend: "+٥ هذا الأسبوع" },
          { label: "متوسط ARPU", value: `${Math.round(totalMRR / (totalUsers - 42))} ﷼`, icon: ChartLine, color: "text-violet-500", bg: "bg-violet-500/8", trend: null },
          { label: "معدل الإلغاء", value: "٦.٢%",                          icon: TrendDown,           color: "text-red-500",     bg: "bg-red-500/8",     trend: "↓ تحسن" },
        ].map((k, i) => {
          const Icon = k.icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={`${card} p-4`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${k.bg}`}>
                <Icon size={17} weight="duotone" className={k.color} />
              </div>
              <p className={`text-[10px] mb-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{k.label}</p>
              <p className={`text-[16px] font-bold font-mono ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{k.value}</p>
              {k.trend && <p className={`text-[10px] font-bold mt-0.5 ${k.color}`}>{k.trend}</p>}
            </motion.div>
          );
        })}
      </div>

      {/* MRR History */}
      <div className={`${card} p-5`}>
        <p className={`text-[12px] font-bold mb-4 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تطور الإيرادات الشهرية (MRR)</p>
        <div className="flex items-end gap-3 h-24">
          {REVENUE_HISTORY.map((m, i) => {
            const max = Math.max(...REVENUE_HISTORY.map(r => r.mrr));
            const h = (m.mrr / max) * 100;
            const isLast = i === REVENUE_HISTORY.length - 1;
            return (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <p className={`text-[9px] font-bold ${isLast ? "text-emerald-500" : isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  {m.mrr.toLocaleString()}
                </p>
                <div className="w-full flex justify-center" style={{ height: "60px" }}>
                  <motion.div initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ duration: 0.7, delay: i * 0.1 }}
                    className={`w-full rounded-t-lg ${isLast ? "bg-emerald-500" : isDark ? "bg-zinc-700" : "bg-slate-200"}`}
                    style={{ minHeight: "4px", alignSelf: "flex-end" }} />
                </div>
                <p className={`text-[9px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{m.month}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Plans Grid */}
      <p className={`text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>الخطط والمشتركون</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PLANS.map((plan, i) => {
          const isSelected = activePlan === plan.id;
          const userPct = totalUsers ? Math.round(plan.users / totalUsers * 100) : 0;
          return (
            <motion.div key={plan.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              onClick={() => setActivePlan(isSelected ? null : plan.id)}
              className={`${card} p-5 cursor-pointer transition-all ${isSelected ? `border-${plan.id === "free" ? "slate" : plan.id === "pro" ? "blue" : plan.id === "max" ? "violet" : "amber"}-500/30` : ""}`}>
              
              {/* Plan header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${plan.bg}`}>
                    <Crown size={17} weight="duotone" className={plan.color} />
                  </div>
                  <div>
                    <p className={`text-[14px] font-black ${plan.color}`}>{plan.name}</p>
                    <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                      {plan.price > 0 ? `${plan.price} ﷼/شهر` : "مجاني"}
                    </p>
                  </div>
                </div>
                <div className="text-left">
                  <p className={`text-[18px] font-black font-mono ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{plan.users}</p>
                  <p className={`text-[9px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>مشترك</p>
                </div>
              </div>

              {/* Users bar */}
              <div className={`h-1.5 rounded-full overflow-hidden mb-3 ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${userPct}%` }} transition={{ duration: 0.7, delay: i * 0.1 }}
                  className={`h-full rounded-full ${plan.bg.replace("/10", "")}`} />
              </div>

              {/* Stats row */}
              <div className={`flex items-center justify-between text-[11px] mb-4 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                <span>{userPct}% من المستخدمين</span>
                <span className="font-bold text-emerald-500">{plan.mrr > 0 ? `${plan.mrr.toLocaleString()} ﷼ MRR` : "—"}</span>
                <span className={plan.churnRate > 10 ? "text-red-400" : "text-emerald-400"}>
                  %{plan.churnRate} churn
                </span>
              </div>

              {/* Features */}
              {isSelected && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-1.5 border-t pt-3 mt-1">
                  {plan.features.map(f => (
                    <div key={f} className={`flex items-center gap-2 text-[11px] ${f.startsWith("×") ? "opacity-50" : ""} ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                      {f.startsWith("×")
                        ? <X size={10} className="text-red-400 flex-shrink-0" />
                        : <Check size={10} className="text-emerald-500 flex-shrink-0" weight="bold" />}
                      {f.replace("×", "")}
                    </div>
                  ))}
                  <div className="pt-2 flex gap-2">
                    <button className={`flex-1 text-[11px] font-bold py-2 rounded-xl border transition-colors ${isDark ? "border-white/[0.06] text-zinc-400 hover:bg-zinc-800" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                      تعديل السعر
                    </button>
                    <button className={`flex-1 text-[11px] font-bold py-2 rounded-xl bg-[#0B3D2E] text-[#C8A762]`}>
                      إدارة المشتركين
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* High churn warning */}
      {PLANS.some(p => p.churnRate > 15) && (
        <div className={`${card} p-4 flex items-center gap-3 border-red-500/20`}>
          <Warning size={16} weight="duotone" className="text-red-500 flex-shrink-0" />
          <p className={`flex-1 text-[12px] ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
            معدل إلغاء مرتفع في الخطة المجانية — فكّر في تحسين تجربة الترقية أو تمديد فترة التجربة
          </p>
        </div>
      )}
    </div>
  );
}
