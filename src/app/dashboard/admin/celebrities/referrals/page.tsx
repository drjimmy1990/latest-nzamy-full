"use client";

import { motion } from "framer-motion";
import {
  ChartBar, Gift, CurrencyCircleDollar, TrendUp,
  ArrowLeft, ArrowRight, Star, Users, Clock, CheckCircle,
  ArrowUpRight,
} from "@phosphor-icons/react";
import Link from "next/link";

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MONTHLY = [
  { month: "نوفمبر ٢٠٢٥", referrals: 22, earned: 3278, paidOut: 3278 },
  { month: "ديسمبر ٢٠٢٥", referrals: 31, earned: 4617, paidOut: 4617 },
  { month: "يناير ٢٠٢٦",  referrals: 47, earned: 7002, paidOut: 7002 },
  { month: "فبراير ٢٠٢٦", referrals: 38, earned: 5662, paidOut: 5662 },
  { month: "مارس ٢٠٢٦",   referrals: 54, earned: 8046, paidOut: 5000 },
  { month: "أبريل ٢٠٢٦",  referrals: 61, earned: 9087, paidOut: 0 },
];

const TOP_AMB = [
  { name: "خالد المطيري",  code: "KHALED25", referrals: 87, earned: 16530, avatar: "خ" },
  { name: "أحمد الشهراني", code: "AHMED20",  referrals: 48, earned: 7152,  avatar: "أ" },
  { name: "سارة الحربي",   code: "SARA15",   referrals: 31, earned: 4185,  avatar: "س" },
];

const maxRefs = Math.max(...MONTHLY.map(m => m.referrals));

export default function AdminCelebrityReferralsPage() {
  const totalReferrals = MONTHLY.reduce((s, m) => s + m.referrals, 0);
  const totalEarned    = MONTHLY.reduce((s, m) => s + m.earned, 0);
  const totalPaid      = MONTHLY.reduce((s, m) => s + m.paidOut, 0);
  const pending        = totalEarned - totalPaid;

  return (
    <div dir="rtl" className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Link href="/dashboard/admin/celebrities"
            className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 mb-3 transition-colors">
            <ArrowRight size={12} /> العودة للسفراء
          </Link>
          <div className="flex items-center gap-2 mb-1">
            <ChartBar size={22} weight="fill" className="text-[#C8A762]" />
            <h1 className="text-2xl font-bold text-white">تقرير الإحالات</h1>
          </div>
          <p className="text-sm text-zinc-500">أداء برنامج السفراء — الإحالات والأرباح الشهرية</p>
        </motion.div>

        {/* KPI Strip */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "إجمالي الإحالات",   value: totalReferrals,               icon: Gift,                  color: "text-[#C8A762]" },
            { label: "إجمالي الأرباح (ر.س)", value: totalEarned.toLocaleString(), icon: CurrencyCircleDollar, color: "text-emerald-500" },
            { label: "مدفوع (ر.س)",         value: totalPaid.toLocaleString(),    icon: CheckCircle,          color: "text-blue-400" },
            { label: "معلّق (ر.س)",         value: pending.toLocaleString(),      icon: Clock,                color: "text-amber-400" },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + i * 0.04 }}
                className="rounded-2xl border border-white/[0.07] bg-zinc-900/70 p-4 flex items-center gap-3">
                <Icon size={20} weight="duotone" className={s.color} />
                <div>
                  <p className="text-xl font-black font-mono text-white">{s.value}</p>
                  <p className="text-[11px] text-zinc-500">{s.label}</p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Monthly Bar Chart */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="rounded-2xl border border-white/[0.07] bg-zinc-900/70 p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[14px] font-bold text-white">الإحالات الشهرية</h2>
            <span className="text-[11px] text-zinc-600">آخر ٦ أشهر</span>
          </div>
          <div className="flex items-end gap-2 h-36">
            {MONTHLY.map((m, i) => {
              const height = Math.round((m.referrals / maxRefs) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-zinc-500 font-mono">{m.referrals}</span>
                  <motion.div
                    initial={{ height: 0 }} animate={{ height: `${height}%` }}
                    transition={{ delay: 0.14 + i * 0.06, type: "spring", stiffness: 200, damping: 22 }}
                    className="w-full rounded-t-lg bg-gradient-to-t from-[#0B3D2E] to-emerald-500/70"
                    title={`${m.month}: ${m.referrals} إحالة`}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 mt-2">
            {MONTHLY.map((m, i) => (
              <div key={i} className="flex-1 text-center">
                <span className="text-[9px] text-zinc-700 leading-tight block">{m.month.split(" ")[0]}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Monthly Table */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
          className="rounded-2xl border border-white/[0.07] bg-zinc-900/70 overflow-hidden">
          <div className="p-4 border-b border-white/[0.05]">
            <h2 className="text-[14px] font-bold text-white">التفاصيل الشهرية</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.05] text-zinc-500 text-[11px]">
                  <th className="text-right py-3 px-4 font-semibold">الشهر</th>
                  <th className="text-right py-3 px-4 font-semibold">الإحالات</th>
                  <th className="text-right py-3 px-4 font-semibold">الأرباح (ر.س)</th>
                  <th className="text-right py-3 px-4 font-semibold">المدفوع (ر.س)</th>
                  <th className="text-right py-3 px-4 font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {MONTHLY.map((m, i) => {
                  const isPending = m.paidOut < m.earned;
                  return (
                    <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4 text-zinc-200 font-medium">{m.month}</td>
                      <td className="py-3 px-4 text-zinc-300 font-mono">{m.referrals}</td>
                      <td className="py-3 px-4 text-[#C8A762] font-mono font-bold">{m.earned.toLocaleString()}</td>
                      <td className="py-3 px-4 text-zinc-400 font-mono">{m.paidOut.toLocaleString()}</td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isPending
                            ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                            : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                        }`}>
                          {isPending ? "معلّق" : "مكتمل"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Top Ambassadors */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="rounded-2xl border border-white/[0.07] bg-zinc-900/70 p-5">
          <h2 className="text-[14px] font-bold text-white mb-4">أفضل السفراء أداءً</h2>
          <div className="space-y-3">
            {TOP_AMB.map((a, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-[12px] font-black text-zinc-700 w-4">{i + 1}</span>
                <div className="w-8 h-8 rounded-xl bg-[#0B3D2E]/30 text-emerald-400 flex items-center justify-center font-bold text-[13px]">
                  {a.avatar}
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-white">{a.name}</p>
                  <p className="text-[10px] text-zinc-600 font-mono">{a.code}</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-black text-[#C8A762]">{a.earned.toLocaleString()} ر.س</p>
                  <p className="text-[10px] text-zinc-600">{a.referrals} إحالة</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

      </div>
    </div>
  );
}
