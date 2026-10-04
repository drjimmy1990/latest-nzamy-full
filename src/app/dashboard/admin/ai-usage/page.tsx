"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Robot, ChartBar, TrendUp, Warning, Users, Buildings,
  ShieldWarning, Gauge, Lightning, ArrowUpRight, CheckCircle,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

interface ToolUsage {
  name: string;
  uses: number;
  tokens: number;
  tier: "gov" | "pro" | "all" | "ngo";
  cost: number;
}

interface TenantConsumer {
  id: string;
  name: string;
  role: "firm" | "corporate" | "lawyer" | "client";
  roleLabel: string;
  requestsCount: number;
  tokensConsumed: number;
  costSar: number;
  status: "normal" | "warning" | "breached";
  dailyLimitPct: number;
}

const TOOLS: ToolUsage[] = [
  { name: "الصائغ القانوني (Memos & Drafts)",   uses: 5432, tokens: 14250000, tier: "pro", cost: 2.1 },
  { name: "المستشار القانوني الذكي (Legal AI)", uses: 8920, tokens: 9840000,  tier: "all", cost: 1.2 },
  { name: "عصارة المرفقات والمستندات (OCR)",    uses: 1876, tokens: 12100000, tier: "pro", cost: 3.8 },
  { name: "صائغ ومحلل الأحكام القضائية",       uses: 2341, tokens: 8400000,  tier: "gov", cost: 4.2 },
  { name: "المحاكي الشامل ونقض الخصوم",         uses: 1102, tokens: 6200000,  tier: "gov", cost: 5.1 },
  { name: "محلل الامتثال والحوكمة والأوقاف",   uses: 743,  tokens: 2850000,  tier: "ngo", cost: 1.8 },
];

const TOP_CONSUMERS: TenantConsumer[] = [
  { id: "1", name: "شركة اليمامة للمحاماة والاستشارات", role: "firm",      roleLabel: "شركة محاماة", requestsCount: 842, tokensConsumed: 4850000, costSar: 1240, status: "warning",  dailyLimitPct: 88 },
  { id: "2", name: "مكتب المستشار فهد العتيبي",          role: "lawyer",    roleLabel: "محامٍ فرد",     requestsCount: 621, tokensConsumed: 3410000, costSar: 890,  status: "normal",   dailyLimitPct: 62 },
  { id: "3", name: "شركة الأفق للاستثمار العقاري",       role: "corporate", roleLabel: "شركة تجارية",  requestsCount: 512, tokensConsumed: 2950000, costSar: 780,  status: "normal",   dailyLimitPct: 54 },
  { id: "4", name: "مكتب الدكتور خالد الشمري",           role: "lawyer",    roleLabel: "محامٍ فرد",     requestsCount: 489, tokensConsumed: 2800000, costSar: 710,  status: "normal",   dailyLimitPct: 51 },
  { id: "5", name: "شركة الرؤية للحلول اللوجستية",       role: "corporate", roleLabel: "شركة تجارية",  requestsCount: 430, tokensConsumed: 2600000, costSar: 650,  status: "normal",   dailyLimitPct: 47 },
  { id: "6", name: "جمعية البر الأهلية للأوقاف",        role: "corporate", roleLabel: "قطاع غير ربحي",requestsCount: 210, tokensConsumed: 1150000, costSar: 290,  status: "normal",   dailyLimitPct: 21 },
];

const TIER_COLOR: Record<string, string> = {
  gov: "text-purple-500 bg-purple-500/10",
  pro: "text-blue-500 bg-blue-500/10",
  all: "text-emerald-500 bg-emerald-500/10",
  ngo: "text-teal-500 bg-teal-500/10",
};

export default function AdminAIUsagePage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const bg = isDark ? "bg-[#0c0f12]" : "bg-gray-50";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";

  const totalUses = TOOLS.reduce((s, t) => s + t.uses, 0);
  const totalTokens = TOOLS.reduce((s, t) => s + t.tokens, 0);
  const totalCost = TOOLS.reduce((s, t) => s + t.uses * t.cost, 0);
  const maxUse = Math.max(...TOOLS.map((t) => t.uses));

  return (
    <div className={`${bg} min-h-screen`} dir="rtl">
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? "bg-blue-500/10" : "bg-blue-50"}`}>
              <Robot size={24} weight="duotone" className={isDark ? "text-blue-400" : "text-blue-600"} />
            </div>
            <div>
              <h1 className={`text-xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>
                مرصد استهلاك الموارد والذكاء الاصطناعي
              </h1>
              <p className={`text-xs ${muted}`}>
                رصد فوري لاستهلاك التوكنز، تكاليف النماذج، وأعلى الجهات والمحامين ضغطاً على موارد المنصة
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className={`text-xs font-semibold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
              التيليمتري متصل حي (Telemetry Live)
            </span>
          </div>
        </div>

        {/* Circuit Breaker Alert Banner if any tenant nears threshold */}
        <div className={`p-4 rounded-2xl border ${isDark ? "bg-amber-500/10 border-amber-500/30 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-900"} flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <ShieldWarning size={22} weight="duotone" className="text-amber-500 shrink-0" />
            <div className="text-xs">
              <span className="font-bold">قواطع الحماية مفعلة (Circuit Breakers):</span> جهة واحدة (شركة اليمامة للمحاماة) وصلت إلى 88% من سقف الاستهلاك اليومي المسموح (100,000 توكن/يوم).
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded bg-amber-500/20 text-amber-400">
            سقف الحماية: آمن
          </span>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "إجمالي الاستدعاءات", value: totalUses.toLocaleString(), icon: ChartBar, color: "text-blue-500", bg: "bg-blue-500/10" },
            { label: "إجمالي التوكنز المستهلكة", value: `${(totalTokens / 1000000).toFixed(1)}M توكن`, icon: Gauge, color: "text-indigo-500", bg: "bg-indigo-500/10" },
            { label: "التكلفة التقديرية للنماذج", value: `${totalCost.toLocaleString()} ر.س`, icon: Robot, color: "text-purple-500", bg: "bg-purple-500/10" },
            { label: "المستأجرون النشطون (Tenants)", value: `${TOP_CONSUMERS.length} جهات`, icon: Buildings, color: "text-emerald-500", bg: "bg-emerald-500/10" },
          ].map((k, i) => {
            const Icon = k.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={`${card} p-4 shadow-sm`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${k.bg} mb-2`}>
                  <Icon size={16} weight="duotone" className={k.color} />
                </div>
                <p className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>{k.value}</p>
                <p className={`text-[10px] mt-0.5 ${muted}`}>{k.label}</p>
              </motion.div>
            );
          })}
        </div>

        {/* Top Resource Consumers Table */}
        <div className={`${card} p-5 shadow-sm`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                أعلى الجهات والمحامين استهلاكاً للموارد (Top 10 Consumers)
              </h3>
              <p className={`text-[11px] ${muted}`}>
                متابعة الحسابات التي تفرض ضغطاً مرتفعاً على البنية التحتية لتفادي تجاوز السعات التشغيلية
              </p>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-1 rounded-lg ${isDark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700"}`}>
              محدث لليوم
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className={`border-b ${isDark ? "border-gray-800 text-gray-400" : "border-gray-100 text-gray-500"}`}>
                  <th className="pb-2.5 font-bold">الجهة / الحساب</th>
                  <th className="pb-2.5 font-bold">التصنيف</th>
                  <th className="pb-2.5 font-bold">الطلبات</th>
                  <th className="pb-2.5 font-bold">التوكنز المستهلكة</th>
                  <th className="pb-2.5 font-bold">التكلفة (ر.س)</th>
                  <th className="pb-2.5 font-bold">نسبة السقف اليومي</th>
                  <th className="pb-2.5 font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                {TOP_CONSUMERS.map((consumer, idx) => (
                  <tr key={consumer.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className={`py-3 font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                      {consumer.name}
                    </td>
                    <td className="py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        consumer.role === "firm" ? "bg-purple-500/10 text-purple-400" :
                        consumer.role === "corporate" ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"
                      }`}>
                        {consumer.roleLabel}
                      </span>
                    </td>
                    <td className={`py-3 ${muted}`}>{consumer.requestsCount.toLocaleString()}</td>
                    <td className={`py-3 font-mono font-medium ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                      {(consumer.tokensConsumed / 1000000).toFixed(2)}M
                    </td>
                    <td className={`py-3 font-bold ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>
                      {consumer.costSar.toLocaleString()} ر.س
                    </td>
                    <td className="py-3 w-36">
                      <div className="flex items-center gap-2">
                        <div className={`flex-1 h-1.5 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"}`}>
                          <div
                            className={`h-full rounded-full ${consumer.dailyLimitPct > 80 ? "bg-amber-500" : "bg-blue-500"}`}
                            style={{ width: `${consumer.dailyLimitPct}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono">{consumer.dailyLimitPct}%</span>
                      </div>
                    </td>
                    <td className="py-3">
                      {consumer.status === "warning" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500">
                          <Warning size={12} weight="bold" /> تنبيه اقتراب
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-500">
                          <CheckCircle size={12} weight="bold" /> طبيعي
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tools usage bars */}
        <div className={`${card} p-5 shadow-sm`}>
          <h3 className={`text-sm font-bold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>
            توزيع الاستهلاك حسب الأدوات الذكية
          </h3>
          <div className="space-y-4">
            {TOOLS.sort((a, b) => b.uses - a.uses).map((t, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{t.name}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${TIER_COLOR[t.tier]}`}>{t.tier}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] ${muted}`}>{t.uses.toLocaleString()} استدعاء</span>
                    <span className={`text-[10px] font-mono ${muted}`}>{(t.tokens / 1000000).toFixed(1)}M توكن</span>
                    <span className={`text-[10px] font-bold ${isDark ? "text-[#C8A762]" : "text-amber-600"}`}>
                      {(t.uses * t.cost).toFixed(0)} ر.س
                    </span>
                  </div>
                </div>
                <div className={`h-2 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"}`}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(t.uses / maxUse) * 100}%` }}
                    transition={{ delay: i * 0.1, duration: 0.7 }}
                    className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
