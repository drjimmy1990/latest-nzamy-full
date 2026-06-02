"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Wallet, ArrowUpRight, ArrowDownLeft,
  Bank, ClockCounterClockwise, CreditCard,
  Plus, Receipt, HandCoins, Building
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types & Mock Data ────────────────────────────────────────────────────────

type TransactionType = "إيداع" | "سحب" | "دفعة عميل" | "رسوم منصة" | "تسوية";
type TransactionStatus = "مكتمل" | "معلق" | "مرفوض";

interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  date: string;
  status: TransactionStatus;
  ref: string;
  desc: string;
}

const MOCK_TRANSACTIONS: Transaction[] = [
  { id: "TRX-001", type: "دفعة عميل", amount: 15000, date: "٢٠٢٤/٠٥/١٥", status: "مكتمل", ref: "INV-9021", desc: "دفعة أولى - شركة الأفق (استشارة)" },
  { id: "TRX-002", type: "سحب", amount: -25000, date: "٢٠٢٤/٠٥/١٢", status: "معلق", ref: "WD-045", desc: "سحب إلى الحساب البنكي (البنك الأهلي)" },
  { id: "TRX-003", type: "رسوم منصة", amount: -450, date: "٢٠٢٤/٠٥/١٠", status: "مكتمل", ref: "SUB-05", desc: "رسوم اشتراك نظامي (باقة Firm)" },
  { id: "TRX-004", type: "إيداع", amount: 50000, date: "٢٠٢٤/٠٥/٠١", status: "مكتمل", ref: "DEP-102", desc: "تغذية المحفظة من الحساب البنكي" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function FirmWalletPage() {
  const { isDark } = useTheme();
  const [filter, setFilter] = useState<"الكل" | "وارد" | "صادر">("الكل");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = MOCK_TRANSACTIONS.filter(t => {
    if (filter === "وارد") return t.amount > 0;
    if (filter === "صادر") return t.amount < 0;
    return true;
  });

  return (
    <div className="max-w-[1100px] mx-auto space-y-6" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-xl font-bold mb-0.5 flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            <Wallet className="text-royal" weight="duotone" />
            المحفظة المالية للمكتب
          </h1>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            إدارة الرصيد، المدفوعات الواردة من العملاء، والسحوبات للحسابات البنكية للمكتب
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className={`px-4 py-2.5 rounded-xl text-[12px] font-bold border transition-colors ${isDark ? "border-white/[0.1] text-zinc-300 hover:bg-white/[0.05]" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
            إدارة الحسابات البنكية
          </button>
        </div>
      </motion.div>

      {/* Balances */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Main Balance */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className={`${card} p-6 relative overflow-hidden bg-gradient-to-br from-[#0B3D2E] to-emerald-800 text-white border-none shadow-xl`}>
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl -mr-10 -mt-10" />
          <div className="flex items-center justify-between mb-6 relative z-10">
            <div className="flex items-center gap-2">
              <Wallet size={20} weight="fill" className="text-[#C8A762]" />
              <span className="text-[12px] font-bold text-emerald-100">الرصيد المتاح للتحويل</span>
            </div>
          </div>
          <div className="relative z-10 mb-6">
            <h2 className="text-4xl font-black font-mono tracking-tight flex items-end gap-2">
              ١٢٥,٤٥٠ <span className="text-[16px] text-emerald-200/70 mb-1.5">ريال</span>
            </h2>
          </div>
          <div className="flex items-center gap-3 relative z-10">
            <button className="flex-1 py-2.5 rounded-xl bg-[#C8A762] text-[#0B3D2E] text-[12px] font-bold hover:bg-[#b09151] transition-colors flex items-center justify-center gap-1.5 shadow-lg shadow-black/20">
              <ArrowUpRight size={16} weight="bold" /> سحب الرصيد
            </button>
            <button className="flex-1 py-2.5 rounded-xl bg-white/10 text-white text-[12px] font-bold hover:bg-white/20 transition-colors flex items-center justify-center gap-1.5 border border-white/20">
              <Plus size={16} weight="bold" /> تغذية المحفظة
            </button>
          </div>
        </motion.div>

        {/* Pending / Held */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`${card} p-5 flex flex-col justify-center`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-amber-500/10" : "bg-amber-50"}`}>
              <ClockCounterClockwise size={20} className="text-amber-500" weight="duotone" />
            </div>
            <div>
              <p className={`text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>رصيد معلق (تحت التسوية)</p>
              <p className={`text-[20px] font-black font-mono mt-0.5 ${isDark ? "text-white" : "text-slate-800"}`}>
                ٣٤,٠٠٠ <span className={`text-[12px] font-sans ${isDark ? "text-zinc-500" : "text-slate-400"}`}>ريال</span>
              </p>
            </div>
          </div>
          <p className={`text-[10px] leading-relaxed mt-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            مبالغ مدفوعة من العملاء بانتظار تأكيد التسوية البنكية (تستغرق عادة ٢-٤ أيام عمل).
          </p>
        </motion.div>

        {/* Escrow (Trust) */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={`${card} p-5 flex flex-col justify-center`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-blue-500/10" : "bg-blue-50"}`}>
              <Building size={20} className="text-blue-500" weight="duotone" />
            </div>
            <div>
              <p className={`text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>حساب الأمانات (Escrow)</p>
              <p className={`text-[20px] font-black font-mono mt-0.5 ${isDark ? "text-white" : "text-slate-800"}`}>
                ٥٠٠,٠٠٠ <span className={`text-[12px] font-sans ${isDark ? "text-zinc-500" : "text-slate-400"}`}>ريال</span>
              </p>
            </div>
          </div>
          <p className={`text-[10px] leading-relaxed mt-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            مبالغ محفوظة لأغراض الصفقات والتسويات، لا يمكن سحبها إلا بموافقة الأطراف (Smart Contracts).
          </p>
        </motion.div>
      </div>

      {/* Transactions */}
      <div className={card}>
        <div className={`p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
          <h2 className={`text-[14px] font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}>
            <Receipt size={18} className="text-royal" weight="duotone" />
            سجل العمليات
          </h2>
          <div className={`flex items-center gap-1 p-1 rounded-xl border ${isDark ? "bg-zinc-800 border-white/[0.05]" : "bg-slate-50 border-slate-200"}`}>
            {(["الكل", "وارد", "صادر"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  filter === f ? isDark ? "bg-zinc-700 text-white" : "bg-white text-slate-800 shadow-sm" : isDark ? "text-zinc-400 hover:text-zinc-200" : "text-slate-500 hover:text-slate-700"
                }`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="p-2 space-y-1">
          {filtered.map((t, i) => (
            <div key={t.id} className={`p-3 rounded-xl flex items-center justify-between gap-4 transition-colors ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50"}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                  t.amount > 0 ? isDark ? "bg-emerald-500/10 text-emerald-500" : "bg-emerald-50 text-emerald-600" :
                  isDark ? "bg-red-500/10 text-red-500" : "bg-red-50 text-red-600"
                }`}>
                  {t.amount > 0 ? <ArrowDownLeft size={18} weight="bold" /> : <ArrowUpRight size={18} weight="bold" />}
                </div>
                <div>
                  <p className={`text-[13px] font-bold mb-0.5 ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{t.desc}</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{t.date}</span>
                    <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>•</span>
                    <span className={`text-[10px] font-mono ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{t.ref}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                      t.status === "مكتمل" ? "bg-emerald-500/10 text-emerald-500" :
                      t.status === "معلق" ? "bg-amber-500/10 text-amber-500" : "bg-red-500/10 text-red-500"
                    }`}>{t.status}</span>
                  </div>
                </div>
              </div>
              <div className="text-left">
                <p className={`text-[14px] font-black font-mono ${
                  t.amount > 0 ? "text-emerald-500" : isDark ? "text-white" : "text-slate-800"
                }`} dir="ltr">
                  {t.amount > 0 ? "+" : ""}{t.amount.toLocaleString()} ﷼
                </p>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="p-8 text-center">
              <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا توجد عمليات تطابق التصفية الحالية.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
