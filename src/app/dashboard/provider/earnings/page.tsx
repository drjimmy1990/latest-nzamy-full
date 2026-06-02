"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import {
  CurrencyDollar, ArrowDown, ArrowUp, Clock, Bank,
  Receipt, ChartBar, CheckCircle, Warning, ArrowRight,
} from "@phosphor-icons/react";

// ── Mock data ──────────────────────────────────────────────────────────────────

const MOCK_TRANSACTIONS = [
  { id: 1, client: "محمد الحارثي", type: "video", gross: 299, commission: 44.85, net: 254.15, date: "٦ أبريل ٢٠٢٦", status: "paid" },
  { id: 2, client: "سارة المطيري", type: "voice", gross: 149, commission: 22.35, net: 126.65, date: "٦ أبريل ٢٠٢٦", status: "pending" },
  { id: 3, client: "نوف القرني", type: "video", gross: 299, commission: 44.85, net: 254.15, date: "٤ أبريل ٢٠٢٦", status: "paid" },
  { id: 4, client: "خالد العتيبي", type: "inperson", gross: 549, commission: 82.35, net: 466.65, date: "٣ أبريل ٢٠٢٦", status: "paid" },
  { id: 5, client: "ريم السلمي", type: "voice", gross: 149, commission: 22.35, net: 126.65, date: "٢ أبريل ٢٠٢٦", status: "paid" },
  { id: 6, client: "عبدالله الزهراني", type: "text", gross: 199, commission: 29.85, net: 169.15, date: "١ أبريل ٢٠٢٦", status: "paid" },
];

const MONTHLY_CHART = [
  { month: "يناير", amount: 3200 },
  { month: "فبراير", amount: 4100 },
  { month: "مارس", amount: 3750 },
  { month: "أبريل", amount: 2200 }, // current (partial)
];

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

const STATUS_AR: Record<string, string> = {
  paid: "محوّل",
  pending: "قيد التحويل",
};

// ── Mini Bar Chart ─────────────────────────────────────────────────────────────

function BarChart({ data, isDark }: { data: typeof MONTHLY_CHART; isDark: boolean }) {
  const max = Math.max(...data.map(d => d.amount));
  return (
    <div className="flex items-end gap-2 h-24">
      {data.map((d, i) => (
        <div key={d.month} className="flex-1 flex flex-col items-center gap-1.5">
          <motion.div
            className={`w-full rounded-t-lg ${i === data.length - 1 ? "bg-[#C8A762]/70" : "bg-[#0B3D2E]/70 dark:bg-[#C8A762]/40"}`}
            initial={{ height: 0 }}
            animate={{ height: `${(d.amount / max) * 80}px` }}
            transition={{ delay: i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
          <span className={`text-[9px] font-medium ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{d.month}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ProviderEarningsPage() {
  const { isDark } = useTheme();
  const [period, setPeriod] = useState<"week" | "month" | "all">("month");

  const totalGross = MOCK_TRANSACTIONS.reduce((s, t) => s + t.gross, 0);
  const totalCommission = MOCK_TRANSACTIONS.reduce((s, t) => s + t.commission, 0);
  const totalNet = MOCK_TRANSACTIONS.reduce((s, t) => s + t.net, 0);
  const pendingAmount = MOCK_TRANSACTIONS.filter(t => t.status === "pending").reduce((s, t) => s + t.net, 0);

  const surface = isDark ? "border-white/[0.06] bg-zinc-900" : "border-slate-200 bg-white";

  return (
    <main className={`min-h-screen py-8 px-4 ${isDark ? "bg-zinc-950" : "bg-zinc-50/50"}`}>
      <div className="mx-auto max-w-4xl space-y-6">

          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className={`font-brand text-2xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>الأرباح والمالية</h1>
              <p className={`mt-0.5 text-sm ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>عمولة المنصة ١٥٪ — التحويل كل ١٤ يوم</p>
            </div>
            <div className={`flex rounded-xl border p-1 ${isDark ? "border-white/[0.06]" : "border-slate-200"}`}>
              {(["week", "month", "all"] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${period === p ? "bg-[#0B3D2E] text-white" : isDark ? "text-zinc-400" : "text-zinc-500"}`}
                >
                  {{ week: "أسبوع", month: "شهر", all: "الكل" }[p]}
                </button>
              ))}
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "الإجمالي قبل العمولة", value: `${totalGross.toLocaleString()} ر.س`, icon: ChartBar, color: "text-zinc-700 dark:text-zinc-300" },
              { label: "صافي المكتسب", value: `${totalNet.toFixed(0)} ر.س`, icon: CurrencyDollar, color: "text-emerald-600 dark:text-emerald-400" },
              { label: "عمولة المنصة ١٥٪", value: `${totalCommission.toFixed(0)} ر.س`, icon: Receipt, color: "text-amber-500" },
              { label: "بانتظار التحويل", value: `${pendingAmount.toFixed(0)} ر.س`, icon: Clock, color: "text-blue-500" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className={`rounded-2xl border p-4 ${surface}`}>
                <Icon size={16} className={`mb-2 ${color}`} />
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{label}</p>
                <p className={`text-lg font-bold font-mono mt-0.5 ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Chart + Payout info — side by side */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Monthly chart */}
            <div className={`rounded-2xl border p-5 ${surface}`}>
              <p className={`mb-4 text-sm font-semibold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>المكتسب شهرياً (ر.س)</p>
              <BarChart data={MONTHLY_CHART} isDark={isDark} />
            </div>

            {/* Payout info */}
            <div className={`rounded-2xl border p-5 space-y-4 ${surface}`}>
              <p className={`text-sm font-semibold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>معلومات التحويل</p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Bank size={16} className="shrink-0 mt-0.5 text-[#C8A762]" />
                  <div>
                    <p className={`text-xs font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>حساب الاستلام</p>
                    <p className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>SA•• •••• •••• ••١٢٣٤</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock size={16} className="shrink-0 mt-0.5 text-blue-400" />
                  <div>
                    <p className={`text-xs font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>التحويل القادم</p>
                    <p className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>١٤ أبريل ٢٠٢٦</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle size={16} weight="fill" className="shrink-0 mt-0.5 text-emerald-400" />
                  <div>
                    <p className={`text-xs font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>آخر تحويل</p>
                    <p className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>١ أبريل ٢٠٢٦ — ١٨٩٦.٦ ر.س</p>
                  </div>
                </div>
              </div>
              <a href="/settings" className={`flex items-center gap-1.5 text-xs font-medium ${isDark ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-500 hover:text-zinc-700"}`}>
                تعديل الحساب البنكي
                <ArrowRight size={12} />
              </a>
            </div>
          </div>

          {/* Transactions table */}
          <div className={`rounded-2xl border overflow-hidden ${surface}`}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
              <p className={`text-sm font-semibold ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>سجل المعاملات</p>
              <span className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{MOCK_TRANSACTIONS.length} معاملة</span>
            </div>
            <div className="divide-y">
              {MOCK_TRANSACTIONS.map(t => (
                <div key={t.id} className={`flex items-center gap-4 px-5 py-3.5 ${isDark ? "divide-white/[0.04]" : ""}`}>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
                    <CurrencyDollar size={16} className="text-[#C8A762]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{t.client}</p>
                    <p className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{t.date}</p>
                  </div>
                  <div className="text-end shrink-0">
                    <p className={`text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400`}>+{t.net.toFixed(0)} ر.س</p>
                    <p className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                      إجمالي {t.gross} — عمولة {t.commission.toFixed(0)}
                    </p>
                  </div>
                  <span className={`ms-2 hidden sm:block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[t.status]}`}>
                    {STATUS_AR[t.status]}
                  </span>
                </div>
              ))}
            </div>
          </div>

      </div>
    </main>
  );
}
