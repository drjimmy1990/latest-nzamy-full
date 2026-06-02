"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChartBar, ChartLine, Receipt, Download, CalendarBlank,
  ArrowUpRight, ArrowDown, FunnelSimple, Printer, FilePdf,
  ChartPie, TrendUp, Coin, Scales, Money, CaretDown,
  ArrowSquareOut, Info, Buildings, Users,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types & Mock Data ──────────────────────────────────────────────────────

type ReportTab = "pnl" | "fees" | "vat" | "aging" | "projections";

interface PnLRow {
  label: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  bold?: boolean;
  isTotal?: boolean;
  indent?: boolean;
}

const PNL_DATA: PnLRow[] = [
  { label: "الإيرادات", q1: 0, q2: 0, q3: 0, q4: 0, bold: true },
  { label: "أتعاب القضايا", q1: 320000, q2: 385000, q3: 410000, q4: 0, indent: true },
  { label: "الاستشارات", q1: 95000, q2: 110000, q3: 125000, q4: 0, indent: true },
  { label: "صياغة العقود", q1: 48000, q2: 52000, q3: 61000, q4: 0, indent: true },
  { label: "خدمات التعقيب", q1: 15000, q2: 18000, q3: 22000, q4: 0, indent: true },
  { label: "إجمالي الإيرادات", q1: 478000, q2: 565000, q3: 618000, q4: 0, isTotal: true },
  { label: "المصروفات", q1: 0, q2: 0, q3: 0, q4: 0, bold: true },
  { label: "رواتب وأجور", q1: 180000, q2: 180000, q3: 195000, q4: 0, indent: true },
  { label: "إيجار المكتب", q1: 45000, q2: 45000, q3: 45000, q4: 0, indent: true },
  { label: "اشتراكات ورسوم", q1: 12000, q2: 14000, q3: 15500, q4: 0, indent: true },
  { label: "مصاريف قضائية", q1: 8500, q2: 11000, q3: 9200, q4: 0, indent: true },
  { label: "تسويق وإعلان", q1: 15000, q2: 20000, q3: 18000, q4: 0, indent: true },
  { label: "مصاريف إدارية أخرى", q1: 7500, q2: 8000, q3: 9300, q4: 0, indent: true },
  { label: "إجمالي المصروفات", q1: 268000, q2: 278000, q3: 292000, q4: 0, isTotal: true },
  { label: "صافي الربح", q1: 210000, q2: 287000, q3: 326000, q4: 0, isTotal: true, bold: true },
];

interface FeeRecord {
  client: string;
  caseRef: string;
  totalFees: number;
  collected: number;
  remaining: number;
  lastPayment: string;
  status: "on_track" | "delayed" | "overdue";
}

const FEES_DATA: FeeRecord[] = [
  { client: "شركة الأفق للتجارة", caseRef: "ق-٢٠٢٤-٠٤١", totalFees: 120000, collected: 90000, remaining: 30000, lastPayment: "١٥ مارس", status: "on_track" },
  { client: "أحمد بن سعيد الزاهد", caseRef: "ق-٢٠٢٤-٠٣٨", totalFees: 45000, collected: 15000, remaining: 30000, lastPayment: "٢ فبراير", status: "delayed" },
  { client: "مجموعة الذهبي القابضة", caseRef: "ق-٢٠٢٤-٠٣٥", totalFees: 250000, collected: 250000, remaining: 0, lastPayment: "١ أبريل", status: "on_track" },
  { client: "شركة الإبداع التقني", caseRef: "ق-٢٠٢٤-٠٣٢", totalFees: 85000, collected: 42500, remaining: 42500, lastPayment: "١٠ يناير", status: "overdue" },
  { client: "سارة الدوسري", caseRef: "ق-٢٠٢٤-٠٤٣", totalFees: 35000, collected: 35000, remaining: 0, lastPayment: "١٢ أبريل", status: "on_track" },
  { client: "مؤسسة النخبة للمقاولات", caseRef: "ق-٢٠٢٤-٠٢٩", totalFees: 180000, collected: 60000, remaining: 120000, lastPayment: "٢٨ ديسمبر", status: "overdue" },
];

const VAT_QUARTERS = [
  { quarter: "Q1 — يناير - مارس", output: 71700, input: 40200, net: 31500, dueDate: "٣٠ أبريل", status: "مدفوع" },
  { quarter: "Q2 — أبريل - يونيو", output: 84750, input: 41700, net: 43050, dueDate: "٣١ يوليو", status: "مدفوع" },
  { quarter: "Q3 — يوليو - سبتمبر", output: 92700, input: 43800, net: 48900, dueDate: "٣١ أكتوبر", status: "قادم" },
];

const AGING_BUCKETS = [
  { label: "حالي (0-30 يوم)", amount: 85000, count: 4, color: "bg-emerald-500" },
  { label: "31-60 يوم", amount: 42500, count: 2, color: "bg-amber-400" },
  { label: "61-90 يوم", amount: 30000, count: 1, color: "bg-orange-500" },
  { label: "أكثر من 90 يوم", amount: 120000, count: 2, color: "bg-red-500" },
];

const TABS: { id: ReportTab; label: string; icon: React.ElementType }[] = [
  { id: "pnl", label: "الأرباح والخسائر", icon: ChartBar },
  { id: "fees", label: "تحصيل الأتعاب", icon: Money },
  { id: "vat", label: "ضريبة القيمة المضافة", icon: Receipt },
  { id: "aging", label: "تقادم المستحقات", icon: ChartPie },
  { id: "projections", label: "التوقعات المالية", icon: TrendUp },
];

const STATUS_MAP = {
  on_track: { label: "منتظم", cls: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  delayed:  { label: "متأخر", cls: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  overdue:  { label: "متعثر", cls: "text-red-500 bg-red-500/10 border-red-500/20" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n === 0) return "—";
  return n.toLocaleString("ar-SA");
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function PnLReport({ isDark, card }: { isDark: boolean; card: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "إجمالي الإيرادات (YTD)", value: "١,٦٦١,٠٠٠", trend: "+١٤%", up: true, icon: Money, color: "text-emerald-500", bg: "bg-emerald-500/8" },
          { label: "إجمالي المصروفات (YTD)", value: "٨٣٨,٠٠٠", trend: "+٣%", up: false, icon: Receipt, color: "text-red-400", bg: "bg-red-500/8" },
          { label: "صافي الربح (YTD)", value: "٨٢٣,٠٠٠", trend: "+٢٦%", up: true, icon: TrendUp, color: "text-royal", bg: "bg-royal/8" },
          { label: "هامش الربح", value: "٤٩.٥٪", trend: "+٤ نقاط", up: true, icon: ChartPie, color: "text-[#C8A762]", bg: "bg-[#C8A762]/8" },
        ].map((k, i) => {
          const Icon = k.icon;
          return (
            <div key={i} className={`${card} p-4`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${k.bg}`}>
                <Icon size={18} weight="duotone" className={k.color} />
              </div>
              <p className={`text-[11px] mb-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{k.label}</p>
              <p className={`text-lg font-bold font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{k.value}</p>
              <div className="flex items-center gap-1 mt-0.5">
                {k.up ? <ArrowUpRight size={11} className="text-emerald-500" /> : <ArrowDown size={11} className="text-red-400" />}
                <span className={`text-[10px] font-medium ${k.up ? "text-emerald-500" : "text-red-400"}`}>{k.trend}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* P&L Table */}
      <div className={`${card} overflow-hidden`}>
        <div className="flex items-center justify-between p-4 pb-2">
          <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>بيان الأرباح والخسائر — ١٤٤٦هـ</h3>
          <span className={`text-[10px] px-2 py-1 rounded-lg ${isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-50 text-slate-400"}`}>المبالغ بالريال السعودي</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className={`text-[10px] font-semibold uppercase tracking-wider border-b ${isDark ? "border-white/[0.06] text-zinc-600" : "border-slate-100 text-slate-400"}`}>
                <th className="px-4 py-2.5 text-right w-1/3">البند</th>
                <th className="px-4 py-2.5 text-left">الربع الأول</th>
                <th className="px-4 py-2.5 text-left">الربع الثاني</th>
                <th className="px-4 py-2.5 text-left">الربع الثالث</th>
                <th className="px-4 py-2.5 text-left">الربع الرابع</th>
              </tr>
            </thead>
            <tbody>
              {PNL_DATA.map((row, i) => (
                <tr
                  key={i}
                  className={`border-b transition-colors ${
                    row.isTotal
                      ? isDark ? "border-white/[0.08] bg-white/[0.02]" : "border-slate-200/80 bg-slate-50/50"
                      : isDark ? "border-white/[0.03] hover:bg-white/[0.02]" : "border-slate-50 hover:bg-slate-50/60"
                  }`}
                >
                  <td className={`px-4 py-2.5 ${row.indent ? "ps-8" : ""} ${row.bold || row.isTotal ? "font-bold" : ""} ${
                    row.isTotal ? (isDark ? "text-white" : "text-slate-800") : (isDark ? "text-zinc-300" : "text-slate-600")
                  }`}>
                    {row.label}
                  </td>
                  {[row.q1, row.q2, row.q3, row.q4].map((v, qi) => (
                    <td key={qi} className={`px-4 py-2.5 text-left font-mono ${
                      row.isTotal ? (isDark ? "text-white font-bold" : "text-slate-800 font-bold") : (isDark ? "text-zinc-400" : "text-slate-500")
                    }`}>
                      {row.bold && v === 0 ? "" : fmt(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}

function FeesReport({ isDark, card }: { isDark: boolean; card: string }) {
  const totalFees = FEES_DATA.reduce((s, f) => s + f.totalFees, 0);
  const totalCollected = FEES_DATA.reduce((s, f) => s + f.collected, 0);
  const collectionRate = Math.round((totalCollected / totalFees) * 100);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Collection KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`${card} p-4 text-center`}>
          <p className={`text-[11px] mb-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>إجمالي الأتعاب</p>
          <p className={`text-lg font-bold font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{fmt(totalFees)} <span className="text-xs font-normal">﷼</span></p>
        </div>
        <div className={`${card} p-4 text-center`}>
          <p className={`text-[11px] mb-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>المحصّل</p>
          <p className="text-lg font-bold font-mono text-emerald-500">{fmt(totalCollected)} <span className="text-xs font-normal">﷼</span></p>
        </div>
        <div className={`${card} p-4 text-center`}>
          <p className={`text-[11px] mb-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>نسبة التحصيل</p>
          <p className={`text-lg font-bold font-mono ${collectionRate >= 70 ? "text-emerald-500" : "text-amber-500"}`}>{collectionRate}%</p>
          <div className={`h-1.5 rounded-full mt-2 ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
            <motion.div className="h-full rounded-full bg-emerald-500" initial={{ width: 0 }} animate={{ width: `${collectionRate}%` }} transition={{ duration: 0.8 }} />
          </div>
        </div>
      </div>

      {/* Fees Table */}
      <div className={`${card} overflow-hidden`}>
        <div className="p-4 pb-2">
          <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>تفاصيل تحصيل الأتعاب</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className={`text-[10px] font-semibold uppercase tracking-wider border-b ${isDark ? "border-white/[0.06] text-zinc-600" : "border-slate-100 text-slate-400"}`}>
                <th className="px-4 py-2.5 text-right">الموكل</th>
                <th className="px-4 py-2.5 text-right hidden sm:table-cell">رقم القضية</th>
                <th className="px-4 py-2.5 text-left">الأتعاب</th>
                <th className="px-4 py-2.5 text-left">المحصّل</th>
                <th className="px-4 py-2.5 text-left">المتبقي</th>
                <th className="px-4 py-2.5 text-right hidden md:table-cell">آخر دفعة</th>
                <th className="px-4 py-2.5 text-right">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {FEES_DATA.map((f, i) => {
                const st = STATUS_MAP[f.status];
                return (
                  <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                    className={`border-b transition-colors cursor-pointer ${isDark ? "border-white/[0.03] hover:bg-white/[0.02]" : "border-slate-50 hover:bg-slate-50/60"}`}>
                    <td className={`px-4 py-3 font-medium ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{f.client}</td>
                    <td className={`px-4 py-3 font-mono hidden sm:table-cell ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{f.caseRef}</td>
                    <td className={`px-4 py-3 text-left font-mono ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{fmt(f.totalFees)}</td>
                    <td className="px-4 py-3 text-left font-mono text-emerald-500">{fmt(f.collected)}</td>
                    <td className={`px-4 py-3 text-left font-mono font-semibold ${f.remaining > 0 ? "text-amber-500" : isDark ? "text-zinc-600" : "text-slate-300"}`}>{f.remaining > 0 ? fmt(f.remaining) : "—"}</td>
                    <td className={`px-4 py-3 hidden md:table-cell ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{f.lastPayment}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}

function VATReport({ isDark, card }: { isDark: boolean; card: string }) {
  const totalNet = VAT_QUARTERS.reduce((s, q) => s + q.net, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* VAT Summary */}
      <div className={`${card} p-5`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>ملخص ضريبة القيمة المضافة — ١٤٤٦هـ</h3>
            <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>النسبة المطبقة: ١٥٪</p>
          </div>
          <div className={`px-3 py-1.5 rounded-xl text-center ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
            <p className={`text-[10px] ${isDark ? "text-[#C8A762]/70" : "text-amber-600/70"}`}>المستحق (YTD)</p>
            <p className="text-sm font-bold font-mono text-[#C8A762]">{fmt(totalNet)} ﷼</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className={`text-[10px] font-semibold uppercase tracking-wider border-b ${isDark ? "border-white/[0.06] text-zinc-600" : "border-slate-100 text-slate-400"}`}>
                <th className="px-4 py-2.5 text-right">الفترة</th>
                <th className="px-4 py-2.5 text-left">ضريبة المخرجات</th>
                <th className="px-4 py-2.5 text-left">ضريبة المدخلات</th>
                <th className="px-4 py-2.5 text-left">صافي المستحق</th>
                <th className="px-4 py-2.5 text-right hidden sm:table-cell">آخر موعد</th>
                <th className="px-4 py-2.5 text-right">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {VAT_QUARTERS.map((q, i) => (
                <tr key={i} className={`border-b ${isDark ? "border-white/[0.03]" : "border-slate-50"}`}>
                  <td className={`px-4 py-3 font-medium ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{q.quarter}</td>
                  <td className={`px-4 py-3 text-left font-mono ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{fmt(q.output)}</td>
                  <td className={`px-4 py-3 text-left font-mono ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{fmt(q.input)}</td>
                  <td className="px-4 py-3 text-left font-mono font-bold text-[#C8A762]">{fmt(q.net)}</td>
                  <td className={`px-4 py-3 hidden sm:table-cell ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{q.dueDate}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      q.status === "مدفوع" ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" : "text-amber-500 bg-amber-500/10 border-amber-500/20"
                    }`}>{q.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ZATCA notice */}
      <div className={`${card} p-4 flex items-start gap-3 ${isDark ? "border-[#C8A762]/15" : "border-amber-200/70"}`}>
        <Info size={16} className="text-[#C8A762] flex-shrink-0 mt-0.5" />
        <div>
          <p className={`text-[12px] font-bold mb-0.5 ${isDark ? "text-zinc-300" : "text-slate-600"}`}>ربط مع هيئة الزكاة والدخل (ZATCA)</p>
          <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            يمكن ربط حسابك مع منظومة الفوترة الإلكترونية (فاتورة) لإرسال الإقرارات تلقائياً. هذه الميزة متاحة في الباقات المتقدمة.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function AgingReport({ isDark, card }: { isDark: boolean; card: string }) {
  const totalAging = AGING_BUCKETS.reduce((s, b) => s + b.amount, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className={`${card} p-5`}>
        <h3 className={`text-sm font-bold mb-4 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>تقادم المستحقات — Aging Report</h3>

        {/* Visual buckets */}
        <div className="flex gap-1 h-4 rounded-full overflow-hidden mb-6">
          {AGING_BUCKETS.map((b, i) => (
            <motion.div
              key={i}
              className={`${b.color} relative group`}
              initial={{ width: 0 }}
              animate={{ width: `${(b.amount / totalAging) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
            >
              <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[9px] font-mono font-bold opacity-0 group-hover:opacity-100 whitespace-nowrap bg-zinc-900 text-white px-1.5 py-0.5 rounded">
                {fmt(b.amount)}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Bucket cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {AGING_BUCKETS.map((b, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.08 }}
              className={`${card} p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-3 h-3 rounded-full ${b.color}`} />
                <span className={`text-[11px] font-medium ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{b.label}</span>
              </div>
              <p className={`text-lg font-bold font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{fmt(b.amount)} <span className="text-xs font-normal">﷼</span></p>
              <p className={`text-[10px] mt-1 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{b.count} {b.count > 1 ? "فواتير" : "فاتورة"}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function ProjectionsReport({ isDark, card }: { isDark: boolean; card: string }) {
  const months = ["أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر"];
  const projections = [195, 210, 225, 235, 248, 260];
  const maxProj = Math.max(...projections);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className={`${card} p-5`}>
        <h3 className={`text-sm font-bold mb-1 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>التوقعات المالية — الأشهر الستة القادمة</h3>
        <p className={`text-[11px] mb-6 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>بناءً على أداء الأشهر الماضية مع نسبة نمو متوقعة ٧-٨٪</p>

        <div className="flex items-end gap-3 h-40">
          {projections.map((v, i) => {
            const h = (v / maxProj) * 100;
            return (
              <div key={i} className="flex flex-col items-center gap-1.5 flex-1">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ duration: 0.6, delay: 0.2 + i * 0.08 }}
                  className={`w-full rounded-t-lg relative group ${
                    isDark ? "bg-gradient-to-t from-royal/40 to-royal/80" : "bg-gradient-to-t from-royal/20 to-royal/60"
                  }`}
                  style={{ minHeight: 4 }}
                >
                  <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold opacity-0 group-hover:opacity-100 text-royal whitespace-nowrap">
                    {v}k
                  </span>
                  {/* Dashed border on projected bars */}
                  <div className="absolute inset-0 rounded-t-lg border-2 border-dashed border-royal/30" />
                </motion.div>
                <p className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{months[i]}</p>
              </div>
            );
          })}
        </div>

        <div className={`mt-6 p-3 rounded-xl border flex items-start gap-2 ${isDark ? "border-royal/20 bg-royal/5" : "border-emerald-200/60 bg-emerald-50/50"}`}>
          <TrendUp size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
          <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
            <strong className={isDark ? "text-zinc-200" : "text-slate-700"}>التوقع: </strong>
            إذا استمر معدل النمو الحالي، ستصل الإيرادات السنوية إلى ~٢.٨ مليون ﷼ بنهاية ١٤٤٦هـ، بزيادة ١٨٪ عن العام الماضي.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function FirmFinanceReportsPage() {
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<ReportTab>("pnl");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className="max-w-[1200px] mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-xl font-bold mb-0.5 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            التقارير المالية
          </h1>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            تحليلات مالية شاملة — أرباح، أتعاب، ضريبة، مستحقات
          </p>
        </div>
        <div className="flex gap-2">
          <button className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-medium border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
            <Printer size={14} /> طباعة
          </button>
          <button className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
            <FilePdf size={14} weight="fill" /> تصدير PDF
          </button>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className={`p-1.5 rounded-2xl border inline-flex flex-wrap gap-1 ${isDark ? "bg-zinc-900/50 border-white/[0.06]" : "bg-white border-slate-200/50"}`}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold transition-all ${
                activeTab === tab.id
                  ? "bg-[#0B3D2E] text-white shadow-sm"
                  : isDark ? "text-zinc-400 hover:text-white hover:bg-white/[0.05]" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Report Content */}
      <AnimatePresence mode="wait">
        {activeTab === "pnl" && <PnLReport key="pnl" isDark={isDark} card={card} />}
        {activeTab === "fees" && <FeesReport key="fees" isDark={isDark} card={card} />}
        {activeTab === "vat" && <VATReport key="vat" isDark={isDark} card={card} />}
        {activeTab === "aging" && <AgingReport key="aging" isDark={isDark} card={card} />}
        {activeTab === "projections" && <ProjectionsReport key="proj" isDark={isDark} card={card} />}
      </AnimatePresence>
    </div>
  );
}
