"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChartLine, TrendUp, TrendDown, DownloadSimple } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو"];
const REVENUE = [142000, 168000, 195000, 221000, 258000, 301000];
const KPIs = [
  { label: "إجمالي إيرادات أبريل",  value: "٣٠١٬٠٠٠ ر.س",  growth: "+١٦٪",  up: true },
  { label: "متوسط الإيراد الشهري",   value: "٢١٤٬١٦٧ ر.س",  growth: "+٨٪",   up: true },
  { label: "العملاء المدفوعون",       value: "١٢٤٧",           growth: "+٢٣٪",  up: true },
  { label: "المسترجعات",              value: "١٢٬٥٠٠ ر.س",    growth: "-٤٪",   up: false },
];
const maxRev = Math.max(...REVENUE);
export default function AdminRevenuePage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-emerald-500/10" : "bg-emerald-50"}`}><ChartLine size={22} weight="duotone" className={isDark ? "text-emerald-400" : "text-emerald-600"} /></div>
            <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>تقارير الإيرادات</h1><p className={`text-xs ${muted}`}>أداء مالي الستة أشهر الماضية</p></div>
          </div>
          <button className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            <DownloadSimple size={14} /> تصدير
          </button>
        </div>
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {KPIs.map((k, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} className={`${card} p-4 shadow-sm`}>
              <p className={`text-lg font-black mb-0.5 ${isDark ? "text-white" : "text-gray-900"}`}>{k.value}</p>
              <div className="flex items-center gap-1.5">
                {k.up ? <TrendUp size={12} weight="fill" className="text-emerald-500" /> : <TrendDown size={12} weight="fill" className="text-rose-500" />}
                <span className={`text-[10px] font-bold ${k.up ? "text-emerald-500" : "text-rose-500"}`}>{k.growth}</span>
              </div>
              <p className={`text-[10px] mt-1 ${muted}`}>{k.label}</p>
            </motion.div>
          ))}
        </div>
        {/* Bar chart */}
        <div className={`${card} p-5 shadow-sm`}>
          <h3 className={`text-sm font-bold mb-5 ${isDark ? "text-white" : "text-gray-900"}`}>الإيراد الشهري (ر.س)</h3>
          <div className="flex items-end gap-3 h-36">
            {REVENUE.map((r, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <span className={`text-[9px] font-bold ${isDark ? "text-gray-400" : "text-gray-500"}`}>{(r/1000).toFixed(0)}k</span>
                <motion.div initial={{ height: 0 }} animate={{ height: `${(r / maxRev) * 100}%` }} transition={{ delay: i * 0.1, duration: 0.6 }}
                  className="w-full rounded-t-lg bg-gradient-to-t from-emerald-600 to-emerald-400 min-h-[4px]" />
                <span className={`text-[9px] ${muted}`}>{MONTHS[i]}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Breakdown */}
        <div className={`${card} p-5 shadow-sm`}>
          <h3 className={`text-sm font-bold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>توزيع الإيرادات حسب الخطة</h3>
          <div className="space-y-3">
            {[
              { plan: "Enterprise / Corp",  pct: 42, color: "bg-purple-500" },
              { plan: "MAX / PRO",          pct: 33, color: "bg-emerald-500" },
              { plan: "AI / Shield",        pct: 18, color: "bg-blue-500" },
              { plan: "Free (Commission)",  pct: 7,  color: "bg-amber-500" },
            ].map((b, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs mb-1">
                  <span className={`font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>{b.plan}</span>
                  <span className={`font-black ${isDark ? "text-gray-400" : "text-gray-600"}`}>{b.pct}٪</span>
                </div>
                <div className={`h-2 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"}`}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${b.pct}%` }} transition={{ delay: i * 0.12, duration: 0.7 }}
                    className={`h-full rounded-full ${b.color}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
