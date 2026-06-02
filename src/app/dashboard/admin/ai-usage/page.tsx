"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Robot, ChartBar, TrendUp, Warning, User } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const TOOLS = [
  { name: "صائغ الأحكام",        uses: 2341, tier: "gov",   cost: 4.2  },
  { name: "محلل الأدلة",          uses: 1876, tier: "gov",   cost: 3.8  },
  { name: "مستشار قانوني (AI)",   uses: 8920, tier: "all",   cost: 1.2  },
  { name: "صائغ العقود",           uses: 5432, tier: "pro",   cost: 2.1  },
  { name: "محلل التبرعات",         uses: 743,  tier: "ngo",   cost: 1.8  },
  { name: "مرجّح الأحكام",        uses: 1102, tier: "gov",   cost: 5.1  },
];
const maxUse = Math.max(...TOOLS.map(t => t.uses));
const TIER_COLOR: Record<string, string> = { gov: "text-purple-500 bg-purple-500/10", pro: "text-blue-500 bg-blue-500/10", all: "text-emerald-500 bg-emerald-500/10", ngo: "text-teal-500 bg-teal-500/10" };

export default function AdminAIUsagePage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const totalUses = TOOLS.reduce((s, t) => s + t.uses, 0);
  const totalCost  = TOOLS.reduce((s, t) => s + t.uses * t.cost, 0);
  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-blue-500/10" : "bg-blue-50"}`}><Robot size={22} weight="duotone" className={isDark ? "text-blue-400" : "text-blue-600"} /></div>
          <div><h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>إحصائيات استخدام الذكاء الاصطناعي</h1><p className={`text-xs ${muted}`}>أداء وتكاليف أدوات AI عبر المنصة</p></div>
        </div>
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "إجمالي الاستخدامات (أبريل)", value: totalUses.toLocaleString(),          icon: ChartBar,  color: "text-blue-500",    bg: "bg-blue-500/10" },
            { label: "تكلفة AI (ر.س)",               value: totalCost.toFixed(0),               icon: Robot,     color: "text-purple-500",  bg: "bg-purple-500/10" },
            { label: "نمو الاستخدام",                  value: "+٣٤٪",                              icon: TrendUp,   color: "text-emerald-500", bg: "bg-emerald-500/10" },
          ].map((k, i) => {
            const Icon = k.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className={`${card} p-4 shadow-sm`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${k.bg} mb-2`}><Icon size={17} weight="duotone" className={k.color} /></div>
                <p className={`text-xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>{k.value}</p>
                <p className={`text-[10px] mt-0.5 ${muted}`}>{k.label}</p>
              </motion.div>
            );
          })}
        </div>
        {/* Tools usage bars */}
        <div className={`${card} p-5 shadow-sm`}>
          <h3 className={`text-sm font-bold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>الأدوات الأكثر استخداماً</h3>
          <div className="space-y-4">
            {TOOLS.sort((a, b) => b.uses - a.uses).map((t, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{t.name}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${TIER_COLOR[t.tier]}`}>{t.tier}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] ${muted}`}>{t.uses.toLocaleString()} استخدام</span>
                    <span className={`text-[10px] font-bold ${isDark ? "text-[#C8A762]" : "text-amber-600"}`}>{(t.uses * t.cost).toFixed(0)} ر.س</span>
                  </div>
                </div>
                <div className={`h-2 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"}`}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(t.uses / maxUse) * 100}%` }} transition={{ delay: i * 0.1, duration: 0.7 }}
                    className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
