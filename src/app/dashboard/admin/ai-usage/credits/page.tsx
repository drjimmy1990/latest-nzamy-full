"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Coins, Warning, CheckCircle, ArrowDown, DownloadSimple } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const CREDITS = [
  { user: "government_judge",    name: "القاضي محمد الغامدي",  used: 4820, limit: 10000, tier: "Gov" },
  { user: "lawyer_max",          name: "أ. خالد الجهني",        used: 2341, limit: 5000,  tier: "MAX" },
  { user: "corp_ceo",            name: "شركة المستقبل",         used: 8910, limit: 15000, tier: "CORP" },
  { user: "ngo_manager",         name: "جمعية البيئة",           used: 743,  limit: 2000,  tier: "PRO" },
  { user: "lawyer_lite",         name: "أ. سارة العمري",         used: 982,  limit: 1000,  tier: "FREE" },
];
export default function AdminAICreditsPage() {
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
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-amber-500/10" : "bg-amber-50"}`}><Coins size={22} weight="duotone" className={isDark ? "text-amber-400" : "text-amber-600"} /></div>
            <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>استهلاك رصيد الذكاء الاصطناعي</h1><p className={`text-xs ${muted}`}>رصيد AI لكل مستخدم ومستوى الاستنفاد</p></div>
          </div>
          <button className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            <DownloadSimple size={14} /> تصدير
          </button>
        </div>
        <div className={`${card} overflow-hidden shadow-sm`}>
          <div className={`grid grid-cols-12 text-xs font-bold px-5 py-3 border-b ${isDark ? "border-[#2d3748] text-gray-500 bg-[#0c0f12]" : "border-gray-100 text-gray-400 bg-gray-50"}`}>
            <span className="col-span-4">المستخدم</span>
            <span className="col-span-2">الخطة</span>
            <span className="col-span-4">الاستهلاك</span>
            <span className="col-span-2 text-center">الحالة</span>
          </div>
          <div className={`divide-y ${isDark ? "divide-[#2d3748]" : "divide-gray-100"}`}>
            {CREDITS.map((c, i) => {
              const pct = Math.round((c.used / c.limit) * 100);
              const isHigh = pct >= 90;
              const isMed  = pct >= 60;
              return (
                <motion.div key={c.user} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}
                  className={`grid grid-cols-12 items-center px-5 py-4 transition ${isDark ? "hover:bg-white/2" : "hover:bg-gray-50"}`}>
                  <div className="col-span-4">
                    <p className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{c.name}</p>
                    <p className={`text-[10px] font-mono ${muted}`}>{c.user}</p>
                  </div>
                  <span className={`col-span-2 text-[10px] font-black px-2 py-0.5 rounded-full w-fit ${isDark ? "bg-white/5 text-gray-300" : "bg-gray-100 text-gray-600"}`}>{c.tier}</span>
                  <div className="col-span-4 pe-4">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className={`font-bold ${isHigh ? "text-rose-500" : isMed ? "text-amber-500" : isDark ? "text-gray-300" : "text-gray-700"}`}>{c.used.toLocaleString()}</span>
                      <span className={muted}>{c.limit.toLocaleString()}</span>
                    </div>
                    <div className={`h-1.5 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"}`}>
                      <div className={`h-full rounded-full ${isHigh ? "bg-rose-500" : isMed ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                  <div className="col-span-2 flex justify-center">
                    {isHigh ? <Warning size={15} weight="fill" className="text-rose-500" /> : <CheckCircle size={15} weight="fill" className="text-emerald-500" />}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
