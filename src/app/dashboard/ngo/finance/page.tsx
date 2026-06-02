"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Briefcase, ArrowDown, ArrowUp, DownloadSimple } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

type Entry = { label: string; amount: string; type: "وارد" | "صادر"; date: string; note: string };
const ENTRIES: Entry[] = [
  { label: "تبرع نقدي — مؤسسة الأمل",        amount: "75,000", type: "وارد", date: "2026-04-15", note: "حملة رمضان 1447هـ" },
  { label: "تبرع عيني — أجهزة حاسوب",        amount: "32,000", type: "وارد", date: "2026-04-10", note: "مبرة التقنية" },
  { label: "مصاريف تشغيلية — فعالية مجتمعية", amount: "18,400", type: "صادر", date: "2026-04-08", note: "قاعة + طباعة + ترحيل" },
  { label: "رواتب المنسقين",                   amount: "24,000", type: "صادر", date: "2026-04-01", note: "ثلاثة منسقين" },
  { label: "هبة حكومية — وزارة الموارد",        amount: "50,000", type: "وارد", date: "2026-03-28", note: "برنامج التأهيل المهني" },
];

export default function NGOFinancePage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const totalIn  = ENTRIES.filter(e => e.type === "وارد").reduce((s, e) => s + parseFloat(e.amount.replace(",", "")), 0);
  const totalOut = ENTRIES.filter(e => e.type === "صادر").reduce((s, e) => s + parseFloat(e.amount.replace(",", "")), 0);
  const balance  = totalIn - totalOut;

  const bg   = isDark ? "bg-zinc-950" : "bg-slate-50";
  const card = `rounded-2xl border ${isDark ? "bg-zinc-900/40 border-white/5" : "bg-white border-slate-200"}`;
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const div  = isDark ? "divide-white/5" : "divide-slate-100";

  return (
    <div className={`${bg} min-h-[100dvh] pb-20`} dir="rtl">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-emerald-500/10" : "bg-emerald-50"}`}>
              <Briefcase size={22} weight="duotone" className={isDark ? "text-emerald-400" : "text-emerald-600"} />
            </div>
            <div>
              <h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>الماليات والتبرعات</h1>
              <p className={`text-xs ${muted}`}>أبريل 2026</p>
            </div>
          </div>
          <button className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${isDark ? "bg-white/5 border border-white/10 hover:bg-white/10 text-gray-200" : "bg-gray-100 border border-gray-200 hover:bg-gray-200 text-gray-700"}`}>
            <DownloadSimple size={14} /> تصدير
          </button>
        </div>

        {/* KPI Strip */}
        <div className={`grid grid-cols-3 ${card} overflow-hidden shadow-sm divide-x divide-x-reverse ${div}`}>
          {[
            { label: "إجمالي الواردات (ر.س)", val: totalIn.toLocaleString(),  color: "text-emerald-500", icon: ArrowDown },
            { label: "إجمالي المصروفات (ر.س)", val: totalOut.toLocaleString(), color: "text-rose-500",    icon: ArrowUp },
            { label: "الرصيد الحالي (ر.س)",    val: balance.toLocaleString(),  color: balance >= 0 ? "text-emerald-500" : "text-rose-500", icon: Briefcase },
          ].map((k, i) => {
            const Icon = k.icon;
            return (
              <div key={i} className="px-5 py-4">
                <div className={`flex items-center gap-1.5 mb-1`}><Icon size={13} className={k.color} /></div>
                <div className={`text-xl font-black font-mono ${k.color}`}>{k.val}</div>
                <div className={`text-xs mt-0.5 ${muted}`}>{k.label}</div>
              </div>
            );
          })}
        </div>

        {/* Ledger */}
        <div className={`${card} overflow-hidden shadow-sm`}>
          <div className={`grid grid-cols-[1fr_auto_auto] px-5 py-3 text-xs font-bold border-b ${isDark ? "text-slate-500 bg-zinc-950 border-white/5" : "text-slate-400 bg-slate-50 border-slate-100"}`}>
            <span>البيان</span><span>التاريخ</span><span>المبلغ</span>
          </div>
          <div className={`divide-y ${div}`}>
            {ENTRIES.map((e, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}
                className={`grid grid-cols-[1fr_auto_auto] px-5 py-4 items-center gap-4 transition ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-gray-50"}`}>
                <div>
                  <div className={`font-semibold text-sm ${isDark ? "text-gray-200" : "text-gray-800"}`}>{e.label}</div>
                  <div className={`text-xs mt-0.5 ${muted}`}>{e.note}</div>
                </div>
                <span className={`text-xs font-mono ${muted}`}>{e.date}</span>
                <span className={`font-mono text-sm font-bold ${e.type === "وارد" ? "text-emerald-500" : "text-rose-500"}`}>
                  {e.type === "وارد" ? "+" : "-"}{e.amount}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
