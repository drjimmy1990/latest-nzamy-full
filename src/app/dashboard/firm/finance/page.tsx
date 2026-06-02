"use client";

import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Money, ChartLine, Receipt, ArrowUpRight, ArrowDown,
  Plus, Download, CalendarBlank, CheckCircle, Clock, Warning,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const KPIS = [
  { label: "الإيرادات الشهرية",   value: "١٨٠,٠٠٠",  unit: "﷼", trend: "+١٨%",  up: true,  color: "text-emerald-500", bg: "bg-emerald-500/10",  icon: Money },
  { label: "الفواتير المعلقة",    value: "٣٢,٥٠٠",   unit: "﷼", trend: "٤ فاتورة", up: false, color: "text-amber-500",  bg: "bg-amber-500/10",    icon: Clock },
  { label: "الأتعاب المحصّلة",    value: "١٤٧,٥٠٠",  unit: "﷼", trend: "+٢٢%",  up: true,  color: "text-royal",      bg: "bg-royal/10",         icon: ChartLine },
  { label: "المصروفات",            value: "٢١,٢٠٠",   unit: "﷼", trend: "-٥%",   up: true,  color: "text-purple-500", bg: "bg-purple-500/10",   icon: Receipt },
];

interface Invoice {
  id: string;
  client: string;
  amount: string;
  date: string;
  status: "paid" | "pending" | "overdue";
  service: string;
}

const MOCK_INVOICES: Invoice[] = [
  { id: "INV-2024-041", client: "شركة الأفق للتجارة",  amount: "٤٥,٠٠٠ ﷼", date: "١ أبريل ٢٠٢٤",   status: "paid",    service: "تمثيل قانوني — الاستئناف" },
  { id: "INV-2024-040", client: "أحمد الزاهد",          amount: "٨,٥٠٠ ﷼",  date: "٢٨ مارس ٢٠٢٤",  status: "pending", service: "استشارة وإعداد لائحة" },
  { id: "INV-2024-039", client: "شركة الإبداع التقني",  amount: "١٥,٠٠٠ ﷼", date: "٢٥ مارس ٢٠٢٤",  status: "paid",    service: "صياغة محضر تأسيس" },
  { id: "INV-2024-038", client: "مجموعة الذهبي",        amount: "٢٤,٠٠٠ ﷼", date: "٢٠ مارس ٢٠٢٤",  status: "overdue", service: "عقد بناء ومتابعة" },
  { id: "INV-2024-037", client: "سارة الدوسري",          amount: "٩,٠٠٠ ﷼",  date: "١٥ مارس ٢٠٢٤",  status: "paid",    service: "تمثيل في محكمة الاستئناف" },
  { id: "INV-2024-036", client: "خالد القحطاني",         amount: "١٢,٠٠٠ ﷼", date: "١٠ مارس ٢٠٢٤",  status: "pending", service: "قضية عمالية — صلح واتفاق" },
];

const STATUS_STYLE: Record<Invoice["status"], { label: string; color: string; icon: React.ElementType }> = {
  paid:    { label: "مدفوعة",  color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle },
  pending: { label: "معلقة",   color: "text-amber-500 bg-amber-500/10 border-amber-500/20",       icon: Clock },
  overdue: { label: "متأخرة",  color: "text-red-500 bg-red-500/10 border-red-500/20",             icon: Warning },
};

const MONTHLY_DATA = [
  { month: "أكت", value: 120 }, { month: "نوف", value: 145 },
  { month: "ديس", value: 132 }, { month: "يناير", value: 158 },
  { month: "فبر", value: 142 }, { month: "مارس", value: 165 },
  { month: "أبريل", value: 180 },
];
const maxValue = Math.max(...MONTHLY_DATA.map(d => d.value));

// ─── Micro-Components ────────────────────────────────────────────────────────

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
      className={`w-full rounded-t-lg ${color}`}
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

export default function FirmFinancePage() {
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
            الماليات والإيرادات
          </h1>
          <p className={`text-base ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
            تحليل مالي شامل · الربع الأول ٢٠٢٦
          </p>
        </div>
        <div className="flex gap-3">
          <button className={`flex items-center gap-2 px-5 py-3.5 rounded-full text-sm font-semibold transition-all active:scale-[0.98] ${
            isDark 
              ? "bg-white/5 hover:bg-white/10 text-white border border-white/10" 
              : "bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 shadow-sm"
          }`}>
            <Download size={18} weight="bold" />
            <span>تصدير PDF</span>
          </button>
          <button className="flex items-center gap-2 px-6 py-3.5 rounded-full text-sm font-semibold bg-royal text-white hover:bg-royal/90 shadow-lg shadow-royal/20 transition-all active:scale-[0.98]">
            <Plus size={18} weight="bold" />
            <span>فاتورة جديدة</span>
          </button>
        </div>
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
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${kpi.up ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
                  {kpi.up ? <ArrowUpRight size={14} weight="bold" /> : <ArrowDown size={14} weight="bold" />}
                  <span className="font-mono">{kpi.trend}</span>
                </div>
              </div>
              
              <div>
                <PerpetualPulse delay={i * 0.2}>
                  <p className={`text-4xl md:text-5xl font-mono tracking-tighter font-bold mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>
                    {kpi.value} <span className="text-xl font-sans font-normal text-slate-400">{kpi.unit}</span>
                  </p>
                </PerpetualPulse>
                <p className={`text-sm font-bold ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{kpi.label}</p>
              </div>
            </LiquidCard>
          );
        })}

        {/* ROW 2: Charts */}
        <LiquidCard delay={0.4} className="md:col-span-12 xl:col-span-8 flex flex-col">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h2 className={`text-2xl font-bold tracking-tight mb-2 ${isDark ? "text-white" : "text-slate-800"}`}>
                الإيرادات الشهرية
              </h2>
              <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-500"}`}>تحليل العوائد (آخر ٧ أشهر)</p>
            </div>
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${isDark ? "bg-white/5 text-zinc-400" : "bg-slate-100 text-slate-500"}`}>
              بالألف ريال
            </span>
          </div>
          
          <div className="flex-1 flex items-end gap-3 sm:gap-6 h-[280px] pt-4 border-b border-dashed border-slate-200/20 dark:border-white/5 pb-2 relative">
            {MONTHLY_DATA.map((d, i) => {
              const isLast = i === MONTHLY_DATA.length - 1;
              return (
                <div key={d.month} className="flex-1 flex flex-col justify-end h-full relative group">
                  <div className="flex items-end justify-center w-full h-full z-10 px-2 sm:px-6">
                    <AnimatedBar 
                      height={(d.value / maxValue) * 100} 
                      color={isLast ? "bg-royal shadow-[0_0_15px_rgba(var(--color-royal-rgb),0.4)]" : (isDark ? "bg-white/10" : "bg-slate-200")} 
                      delay={0.5 + i * 0.1} 
                    />
                  </div>
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                     <span className={`text-xs font-mono font-bold ${isLast ? "text-royal" : isDark ? "text-white" : "text-slate-700"}`}>{d.value}k</span>
                  </div>
                  <div className="absolute -bottom-10 left-0 right-0 text-center">
                    <p className={`text-sm font-medium ${isLast ? "text-royal font-bold" : isDark ? "text-zinc-500 group-hover:text-zinc-300" : "text-slate-400 group-hover:text-slate-600"} transition-colors`}>
                      {d.month}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </LiquidCard>

        {/* ROW 2.5: Revenue Breakdown */}
        <LiquidCard delay={0.5} className="md:col-span-12 xl:col-span-4 flex flex-col">
          <h2 className={`text-2xl font-bold tracking-tight mb-2 ${isDark ? "text-white" : "text-slate-800"}`}>
            توزيع الإيرادات
          </h2>
          <p className={`text-sm mb-10 ${isDark ? "text-zinc-500" : "text-slate-500"}`}>حسب نوع الخدمة القانونية</p>
          
          <div className="space-y-6 flex-1 flex flex-col justify-center">
            {[
              { label: "قضايا تجارية",   value: "٧٢,٠٠٠",  pct: 40, color: "bg-royal" },
              { label: "استشارات",        value: "٤٥,٠٠٠",  pct: 25, color: "bg-emerald-500" },
              { label: "عقود",            value: "٣٦,٠٠٠",  pct: 20, color: "bg-amber-500" },
              { label: "أخرى",            value: "٢٧,٠٠٠",  pct: 15, color: "bg-purple-500" },
            ].map((s, i) => (
              <div key={i} className="group">
                <div className="flex items-center justify-between text-base mb-3">
                  <span className={`font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{s.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-bold text-lg ${isDark ? "text-white" : "text-slate-900"}`}>{s.value}</span>
                    <span className={`text-xs ${isDark ? "text-zinc-500" : "text-slate-400"}`}>﷼</span>
                  </div>
                </div>
                <div className={`h-3 rounded-full overflow-hidden ${isDark ? "bg-white/5" : "bg-slate-100"}`}>
                  <motion.div 
                    className={`h-full rounded-full ${s.color}`}
                    initial={{ width: 0 }} 
                    animate={{ width: `${s.pct}%` }}
                    transition={{ duration: 1, delay: 0.6 + i * 0.1, type: "spring", stiffness: 50 }} 
                  />
                </div>
              </div>
            ))}
          </div>
        </LiquidCard>

        {/* ROW 3: Invoices List */}
        <LiquidCard delay={0.6} className="col-span-12 !p-0">
          <div className="flex items-center justify-between mb-6 p-8 sm:p-10 pb-0">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? "bg-white/5" : "bg-slate-100"}`}>
                <Receipt size={24} className="text-royal" weight="duotone" />
              </div>
              <div>
                <h2 className={`text-2xl font-bold tracking-tight mb-1 ${isDark ? "text-white" : "text-slate-800"}`}>الفواتير والمطالبات</h2>
                <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-500"}`}>سجل المعاملات المالية الحديثة</p>
              </div>
            </div>
            <button className="text-sm font-semibold text-royal hover:text-royal/80 hover:underline transition-colors">
              عرض كل الفواتير
            </button>
          </div>
          
          <div className="overflow-x-auto px-8 sm:px-10 pb-8 sm:pb-10">
            <table className="w-full text-base">
              <thead>
                <tr className={`text-sm font-semibold uppercase tracking-wider text-right ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  <th className="px-6 py-5 border-b border-slate-200/20 dark:border-white/5">رقم الفاتورة</th>
                  <th className="px-6 py-5 border-b border-slate-200/20 dark:border-white/5">الموكل</th>
                  <th className="px-6 py-5 border-b border-slate-200/20 dark:border-white/5 hidden sm:table-cell">الخدمة</th>
                  <th className="px-6 py-5 border-b border-slate-200/20 dark:border-white/5 hidden md:table-cell">التاريخ</th>
                  <th className="px-6 py-5 border-b border-slate-200/20 dark:border-white/5">المبلغ</th>
                  <th className="px-6 py-5 border-b border-slate-200/20 dark:border-white/5">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-slate-200/20 dark:divide-white/5">
                <AnimatePresence>
                  {MOCK_INVOICES.map((inv, i) => {
                    const s = STATUS_STYLE[inv.status];
                    const StatusIcon = s.icon;
                    return (
                      <motion.tr 
                        key={inv.id}
                        layout
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        transition={{ delay: 0.7 + i * 0.05, type: "spring", stiffness: 100 }}
                        className={`group cursor-pointer transition-colors ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50"}`}
                      >
                        <td className={`px-6 py-6 font-mono font-bold text-sm ${isDark ? "text-zinc-400 group-hover:text-royal" : "text-slate-500 group-hover:text-royal"} transition-colors`}>{inv.id}</td>
                        <td className={`px-6 py-6 font-bold ${isDark ? "text-white" : "text-slate-800"}`}>{inv.client}</td>
                        <td className={`px-6 py-6 hidden sm:table-cell text-sm font-medium ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{inv.service}</td>
                        <td className={`px-6 py-6 hidden md:table-cell`}>
                          <span className={`flex items-center gap-2 text-sm font-medium ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                            <CalendarBlank size={14} weight="bold" />
                            {inv.date}
                          </span>
                        </td>
                        <td className={`px-6 py-6 font-mono font-bold text-lg ${isDark ? "text-zinc-200" : "text-slate-900"}`}>{inv.amount}</td>
                        <td className="px-6 py-6">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${s.color}`}>
                            <StatusIcon size={14} weight="bold" />
                            {s.label}
                          </span>
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
