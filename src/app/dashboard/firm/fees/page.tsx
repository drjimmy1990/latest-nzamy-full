"use client";

import { motion, useTransform, useMotionValue } from "framer-motion";
import {
  Wallet, TrendUp, Receipt, Clock,
  Plus, Funnel, ArrowUpRight, DownloadSimple,
  ChartLineUp, CreditCard, Sparkle,
  ArrowUp, ArrowDown,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import React, { memo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Stat = {
  label: string;
  value: string;
  trend: string;
  trendUp: boolean;
  icon: React.ElementType;
  color: string;
  bg: string;
};

type Invoice = {
  id: string;
  client: string;
  amount: string;
  date: string;
  status: "paid" | "pending" | "overdue";
};

// ─── Isolated: Magnetic Button ───────────────────────────────────────────────

const MagneticButton = memo(function MagneticButton({
  children, className, onClick,
}: {
  children: React.ReactNode;
  className: string;
  onClick?: () => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-20, 20], [4, -4]);
  const rotateY = useTransform(x, [-20, 20], [-4, 4]);

  return (
    <motion.button
      style={{ x, y, rotateX, rotateY }}
      whileTap={{ scale: 0.97, y: 1 }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - rect.left - rect.width / 2) * 0.25);
        y.set((e.clientY - rect.top - rect.height / 2) * 0.25);
      }}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      className={className}
      onClick={onClick}
    >
      {children}
    </motion.button>
  );
});

// ─── Stat Card ────────────────────────────────────────────────────────────────

const StatCard = memo(function StatCard({ s, isDark, ts, index }: { s: Stat; isDark: boolean; ts: string; index: number }) {
  const Icon = s.icon;
  const TrendIcon = s.trendUp ? ArrowUp : ArrowDown;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20, delay: index * 0.07 }}
      className={[
        "p-5 rounded-2xl border",
        isDark
          ? "bg-zinc-900 border-white/[0.06] shadow-[0_4px_24px_-8px_rgba(0,0,0,0.4)]"
          : "bg-white border-zinc-200/60 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.06)]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.bg}`}>
          <Icon size={18} className={s.color} weight="duotone" />
        </div>
        <span className={[
          "inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 rounded-md",
          s.trendUp
            ? isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"
            : isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-500",
        ].join(" ")}>
          <TrendIcon size={9} weight="bold" />
          {s.trend}
        </span>
      </div>
      <p className={`text-[11px] font-medium mb-1 ${ts}`}>{s.label}</p>
      <p className="text-[20px] font-bold font-mono tracking-tight">{s.value}</p>
    </motion.div>
  );
});

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Invoice["status"] }) {
  const map = {
    paid: "bg-emerald-500/10 text-emerald-500",
    pending: "bg-amber-500/10 text-amber-500",
    overdue: "bg-red-500/10 text-red-500",
  };
  const labels = { paid: "مدفوعة", pending: "بانتظار السداد", overdue: "متأخرة" };
  return (
    <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold ${map[status]}`}>
      {labels[status]}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FirmFeesPage() {
  const { isDark } = useTheme();

  const ts = isDark ? "text-zinc-500" : "text-zinc-400";
  const tp = isDark ? "text-white" : "text-zinc-900";
  const divider = isDark ? "border-white/[0.06]" : "border-zinc-100";

  const stats: Stat[] = [
    {
      label: "إجمالي الإيرادات (الشهر)", value: "١٤٥,٨٣٠ ﷼", trend: "+١١.٧٪", trendUp: true,
      icon: Wallet, color: "text-emerald-500", bg: isDark ? "bg-emerald-500/10" : "bg-emerald-50",
    },
    {
      label: "فواتير مستحقة", value: "٣٢,٤٠٠ ﷼", trend: "٤ فواتير", trendUp: false,
      icon: Clock, color: "text-amber-500", bg: isDark ? "bg-amber-500/10" : "bg-amber-50",
    },
    {
      label: "تم تحصيله اليوم", value: "٨,١٥٠ ﷼", trend: "+٢.٣٪", trendUp: true,
      icon: TrendUp, color: "text-sky-500", bg: isDark ? "bg-sky-500/10" : "bg-sky-50",
    },
    {
      label: "متوسط قيمة القضية", value: "٢٣,٧٠٠ ﷼", trend: "ثابت", trendUp: true,
      icon: ChartLineUp, color: "text-violet-500", bg: isDark ? "bg-violet-500/10" : "bg-violet-50",
    },
  ];

  const invoices: Invoice[] = [
    { id: "INV-2026-089", client: "شركة الأفق للتجارة",           amount: "١٥,٠٠٠ ﷼", date: "٢٢ أبريل", status: "paid" },
    { id: "INV-2026-088", client: "مؤسسة الرواد الاستشارية",      amount: "٨,٥٠٠ ﷼",  date: "٢٠ أبريل", status: "pending" },
    { id: "INV-2026-087", client: "خالد بن سليمان العبدالله",     amount: "٤,٢٠٠ ﷼",  date: "١٥ أبريل", status: "overdue" },
    { id: "INV-2026-086", client: "مجموعة السعد القابضة",         amount: "٢٢,٠٠٠ ﷼", date: "١٠ أبريل", status: "paid" },
    { id: "INV-2026-085", client: "عبدالرحمن بن ماجد الزهراني",  amount: "٦,٩٠٠ ﷼",  date: "٠٥ أبريل", status: "paid" },
  ];

  const paymentMethods = [
    { label: "تحويل بنكي", desc: "الراجحي — ٤٣٢١", active: true },
    { label: "بطاقة / مدى", desc: "بوابة نظامي", active: true },
    { label: "STC Pay", desc: "غير مفعل", active: false },
  ];

  return (
    <div className={`p-5 md:p-7 max-w-6xl mx-auto space-y-6 ${tp}`} dir="rtl">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight mb-0.5">الأتعاب والفوترة</h1>
          <p className={`text-[13px] ${ts}`}>إدارة إيرادات المكتب، الفواتير المستحقة، وتتبع المدفوعات</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <MagneticButton
            className={[
              "px-4 py-2 rounded-xl text-[12px] font-semibold border flex items-center gap-1.5 transition-colors",
              isDark ? "border-white/[0.08] text-zinc-300 hover:bg-white/[0.04]" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50",
            ].join(" ")}
          >
            <DownloadSimple size={14} />
            تصدير
          </MagneticButton>
          <MagneticButton
            className="px-4 py-2 rounded-xl bg-[#0B3D2E] text-white text-[12px] font-bold flex items-center gap-1.5 shadow-[0_4px_16px_-4px_rgba(11,61,46,0.35)] hover:bg-[#0f5a42] transition-colors"
          >
            <Plus size={14} />
            إنشاء فاتورة
          </MagneticButton>
        </div>
      </div>

      {/* ── Stats — Asymmetric 2+2 grid ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2 grid grid-cols-2 gap-4">
          <StatCard s={stats[0]} isDark={isDark} ts={ts} index={0} />
          <StatCard s={stats[1]} isDark={isDark} ts={ts} index={1} />
        </div>
        <StatCard s={stats[2]} isDark={isDark} ts={ts} index={2} />
        <StatCard s={stats[3]} isDark={isDark} ts={ts} index={3} />
      </div>

      {/* ── Body Grid (2/3 + 1/3) ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ─ Invoices Table ─────────────────────────────────────────────────── */}
        <div className={[
          "lg:col-span-2 rounded-2xl border overflow-hidden",
          isDark
            ? "bg-zinc-900 border-white/[0.06] shadow-[0_4px_24px_-8px_rgba(0,0,0,0.4)]"
            : "bg-white border-zinc-200/60 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.05)]",
        ].join(" ")}>
          <div className={`px-5 py-4 flex items-center justify-between border-b ${divider}`}>
            <h2 className={`text-[13px] font-bold flex items-center gap-2 ${tp}`}>
              <Receipt size={15} className={ts} /> أحدث الفواتير
            </h2>
            <button className={`p-1.5 rounded-lg border transition-colors ${isDark ? "border-white/[0.08] text-zinc-500 hover:text-zinc-300" : "border-zinc-200 text-zinc-400 hover:text-zinc-700"}`}>
              <Funnel size={13} />
            </button>
          </div>

          <div className={`divide-y ${divider}`}>
            {invoices.map((inv, i) => (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.06 }}
                className={[
                  "grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 px-5 py-3.5 text-[12px] transition-colors",
                  isDark ? "hover:bg-white/[0.02]" : "hover:bg-zinc-50/80",
                ].join(" ")}
              >
                <span className={`font-mono text-[11px] ${ts}`}>{inv.id}</span>
                <span className={`font-medium ${tp}`}>{inv.client}</span>
                <span className={`font-mono font-semibold ${tp}`}>{inv.amount}</span>
                <span className={ts}>{inv.date}</span>
                <StatusBadge status={inv.status} />
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  className={`${ts} transition-colors hover:text-zinc-800`}
                >
                  <ArrowUpRight size={14} />
                </motion.button>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ─ Sidebar ────────────────────────────────────────────────────────── */}
        <div className={[
          "rounded-2xl border divide-y overflow-hidden",
          isDark
            ? "bg-zinc-900 border-white/[0.06] divide-white/[0.06]"
            : "bg-white border-zinc-200/60 divide-zinc-100",
        ].join(" ")}>
          {/* Payment methods */}
          <div className="px-5 py-4">
            <h2 className={`text-[12px] font-bold mb-4 flex items-center gap-1.5 ${tp}`}>
              <CreditCard size={14} className={ts} /> طرق الدفع
            </h2>
            <div className="space-y-3">
              {paymentMethods.map((m, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div>
                    <p className={`text-[12px] font-semibold ${tp}`}>{m.label}</p>
                    <p className={`text-[10px] mt-0.5 font-mono ${ts}`}>{m.desc}</p>
                  </div>
                  <div className={[
                    "w-8 h-4 rounded-full relative shrink-0 transition-colors",
                    m.active ? "bg-emerald-500" : isDark ? "bg-zinc-700" : "bg-zinc-300",
                  ].join(" ")}>
                    <div className={[
                      "absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all",
                      m.active ? "left-0.5" : "right-0.5",
                    ].join(" ")} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upsell */}
          <div className="px-5 py-5">
            <p className="text-[11px] font-bold text-[#C8A762] mb-1.5">ترقية للباقة Pro</p>
            <p className={`text-[11px] leading-relaxed mb-4 ${ts}`}>
              فوترة غير محدودة، تذكيرات آلية بالسداد، وربط مباشر مع ZATCA.
            </p>
            <MagneticButton className="w-full py-2.5 rounded-xl bg-[#C8A762] text-white text-[11px] font-bold tracking-wide transition-opacity hover:opacity-90">
              <Sparkle size={12} className="inline ml-1" />
              عرض الباقات
            </MagneticButton>
          </div>
        </div>

      </div>
    </div>
  );
}
