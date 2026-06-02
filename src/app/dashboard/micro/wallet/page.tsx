"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Wallet, Coins, ArrowLeft, ArrowRight, Gift, CreditCard,
  Lightning, Plus, Clock, CheckCircle, Scan, Package,
  ArrowUp, ArrowDown, Star,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const WALLET = {
  balance: 250,
  pendingEarnings: 75,
  referralCode: "MICRO-KH2024",
  totalEarned: 325,
  totalSpent: 700,
};

const TRANSACTIONS = [
  { id: "T-001", type: "earn" as const,   label: "مكافأة إحالة — محمد الغامدي",        amount: +75,  date: "٢٨ أبريل ٢٠٢٦", status: "pending" },
  { id: "T-002", type: "spend" as const,  label: "استشارة قانونية — خالد الحربي",        amount: -250, date: "١٥ أبريل ٢٠٢٦", status: "done" },
  { id: "T-003", type: "earn" as const,   label: "رصيد ترحيب — انضممت لنظامي",         amount: +250, date: "١ أبريل ٢٠٢٦",  status: "done" },
  { id: "T-004", type: "spend" as const,  label: "مراجعة عقد إيجار",                   amount: -300, date: "١٠ مارس ٢٠٢٦",  status: "done" },
  { id: "T-005", type: "earn" as const,   label: "مكافأة إحالة — فاطمة الأنصاري",      amount: +75,  date: "١ مارس ٢٠٢٦",   status: "done" },
];

const COUPONS = [
  { id: "CP-001", code: "RAMADAN30", discount: "٣٠٪", desc: "خصم ٣٠٪ على الاستشارات", expiry: "٣٠ أبريل ٢٠٢٦", used: false },
  { id: "CP-002", code: "LEGAL100",  discount: "١٠٠ ر.س", desc: "خصم ١٠٠ ر.س على العقود", expiry: "١ يونيو ٢٠٢٦",   used: false },
];

const SERVICES_TOPUP = [
  { label: "استشارة قانونية",   price: 250, icon: Star },
  { label: "مراجعة عقد",        price: 300, icon: CreditCard },
  { label: "إشعار قانوني",      price: 150, icon: Lightning },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.35 } }),
};

export default function MicroWalletPage() {
  const { isDark } = useTheme();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"transactions" | "coupons">("transactions");

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.07] rounded-2xl"
    : "bg-white border border-zinc-100 rounded-2xl shadow-sm";

  const copyCode = () => {
    navigator.clipboard.writeText(WALLET.referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`p-5 md:p-8 max-w-[900px] mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={0}>
        <h1 className={`text-[22px] font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>المحفظة</h1>
        <p className={`text-[13px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          رصيدك وكوبوناتك وسجل معاملاتك
        </p>
      </motion.div>

      {/* Balance Hero */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={1}>
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-[#0B3D2E] to-[#0d5238] p-6 shadow-[0_8px_32px_-8px_rgba(11,61,46,0.5)]">
          <div className="absolute start-4 top-1/2 -translate-y-1/2 opacity-[0.05]">
            <Wallet size={140} weight="fill" />
          </div>
          <div className="relative">
            <p className="text-emerald-300/70 text-sm mb-1">رصيدك المتاح</p>
            <div className="flex items-end gap-2 mb-4">
              <span className="text-4xl font-bold text-white">{WALLET.balance}</span>
              <span className="text-emerald-300/70 mb-1">ريال سعودي</span>
            </div>

            <div className="flex gap-6 mb-5">
              <div>
                <p className="text-emerald-300/50 text-[11px]">إجمالي المكتسب</p>
                <p className="text-white font-bold text-sm">{WALLET.totalEarned} ر.س</p>
              </div>
              <div>
                <p className="text-emerald-300/50 text-[11px]">إجمالي المصروف</p>
                <p className="text-white font-bold text-sm">{WALLET.totalSpent} ر.س</p>
              </div>
              {WALLET.pendingEarnings > 0 && (
                <div>
                  <p className="text-amber-300/70 text-[11px]">قيد المعالجة</p>
                  <p className="text-amber-300 font-bold text-sm">+{WALLET.pendingEarnings} ر.س</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/dashboard/micro/requests">
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 bg-[#C8A762] text-[#0B3D2E] font-bold px-4 py-2.5 rounded-xl text-sm cursor-pointer shadow-md"
                >
                  <Lightning size={15} weight="fill" /> صرف الرصيد
                </motion.div>
              </Link>
              <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 bg-white/10 border border-white/20 text-white font-semibold px-4 py-2.5 rounded-xl text-sm backdrop-blur-sm cursor-pointer"
              >
                <Plus size={15} /> إضافة رصيد
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Quick Services with wallet */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={2}>
        <div className={`${card} p-5`}>
          <p className={`text-[13px] font-bold mb-3 ${isDark ? "text-white" : "text-zinc-800"}`}>
            استخدم رصيدك في:
          </p>
          <div className="grid grid-cols-3 gap-2">
            {SERVICES_TOPUP.map(svc => {
              const Icon = svc.icon;
              const canAfford = WALLET.balance >= svc.price;
              return (
                <motion.div key={svc.label} whileHover={{ y: -2 }}
                  className={`p-3 rounded-xl border text-center cursor-pointer transition-all ${
                    canAfford
                      ? isDark ? "bg-zinc-800 border-white/[0.07] hover:border-royal/30" : "bg-zinc-50 border-zinc-100 hover:border-royal/30 hover:bg-royal/5"
                      : isDark ? "bg-zinc-800/50 border-white/[0.04] opacity-60" : "bg-zinc-50/50 border-zinc-100 opacity-60"
                  }`}
                >
                  <Icon size={20} weight="duotone" className={`mx-auto mb-1.5 ${canAfford ? "text-[#0B3D2E]" : isDark ? "text-zinc-600" : "text-zinc-400"}`} />
                  <p className={`text-[11px] font-bold mb-0.5 ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{svc.label}</p>
                  <p className={`text-[10px] font-bold ${canAfford ? "text-[#C8A762]" : isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                    {svc.price} ر.س
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Referral Card */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={3}>
        <div className={`relative overflow-hidden rounded-2xl border p-5 ${
          isDark ? "bg-zinc-900/80 border-[#C8A762]/20" : "bg-gradient-to-l from-amber-50 to-white border-amber-200"
        }`}>
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#C8A762]/10 flex items-center justify-center flex-shrink-0">
              <Gift size={20} weight="duotone" className="text-[#C8A762]" />
            </div>
            <div className="flex-1">
              <p className={`text-[14px] font-bold mb-0.5 ${isDark ? "text-white" : "text-zinc-800"}`}>
                أحِل صديقاً — واكسب ٧٥ ريال
              </p>
              <p className={`text-[12px] mb-3 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                شارك الكود وستحصل على ٧٥ ر.س لكل صديق يسجل ويستخدم المنصة
              </p>
              <div className="flex items-center gap-2">
                <div className={`flex-1 flex items-center gap-2 rounded-xl border px-3 py-2 ${
                  isDark ? "bg-zinc-800 border-white/[0.07]" : "bg-white border-zinc-200"
                }`}>
                  <Scan size={13} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
                  <span className="font-mono text-[13px] font-bold text-[#C8A762]">{WALLET.referralCode}</span>
                </div>
                <motion.button
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  onClick={copyCode}
                  className={`px-3 py-2 rounded-xl text-[12px] font-bold transition-colors cursor-pointer ${
                    copied
                      ? "bg-emerald-500 text-white"
                      : "bg-[#0B3D2E] text-white hover:bg-[#0d5238]"
                  }`}
                >
                  {copied ? <CheckCircle size={14} weight="fill" /> : "نسخ"}
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Tabs: Transactions / Coupons */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" custom={4}>
        <div className={`${card} overflow-hidden`}>
          {/* Tab Header */}
          <div className={`flex border-b ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
            {(["transactions", "coupons"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-[13px] font-bold transition-colors cursor-pointer ${
                  activeTab === tab
                    ? "text-[#0B3D2E] border-b-2 border-[#0B3D2E] dark:text-emerald-400 dark:border-emerald-400"
                    : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"
                }`}
              >
                {tab === "transactions" ? `المعاملات (${TRANSACTIONS.length})` : `الكوبونات (${COUPONS.length})`}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {/* Transactions */}
            {activeTab === "transactions" && (
              <motion.div key="tx" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="divide-y divide-zinc-100 dark:divide-white/[0.04]"
              >
                {TRANSACTIONS.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      tx.type === "earn"
                        ? "bg-emerald-50 dark:bg-emerald-900/20"
                        : "bg-red-50 dark:bg-red-900/20"
                    }`}>
                      {tx.type === "earn"
                        ? <ArrowDown size={16} className="text-emerald-500" weight="bold" />
                        : <ArrowUp size={16} className="text-red-400" weight="bold" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-medium truncate ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>{tx.label}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                          <Clock size={9} className="inline ml-0.5" />{tx.date}
                        </span>
                        {tx.status === "pending" && (
                          <span className="text-[10px] font-bold text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-full">
                            قيد المعالجة
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`text-[14px] font-bold ${tx.type === "earn" ? "text-emerald-500" : "text-red-400"}`}>
                      {tx.amount > 0 ? "+" : ""}{tx.amount} ر.س
                    </span>
                  </div>
                ))}
              </motion.div>
            )}

            {/* Coupons */}
            {activeTab === "coupons" && (
              <motion.div key="cp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="p-5 space-y-3"
              >
                {COUPONS.map(cp => (
                  <div key={cp.id} className={`p-4 rounded-2xl border-2 border-dashed flex items-center gap-4 ${
                    isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50/50"
                  }`}>
                    <div className="w-10 h-10 rounded-xl bg-[#C8A762]/10 flex items-center justify-center flex-shrink-0">
                      <Gift size={18} weight="duotone" className="text-[#C8A762]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono font-bold text-[#C8A762] text-[13px]">{cp.code}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          isDark ? "bg-emerald-900/20 text-emerald-400" : "bg-emerald-100 text-emerald-700"
                        }`}>{cp.discount}</span>
                      </div>
                      <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{cp.desc}</p>
                      <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                        صالح حتى: {cp.expiry}
                      </p>
                    </div>
                    <Link href="/dashboard/micro/requests">
                      <motion.div whileHover={{ scale: 1.04 }}
                        className="flex items-center gap-1 text-[11px] font-bold text-[#0B3D2E] bg-[#0B3D2E]/5 border border-[#0B3D2E]/20 px-2.5 py-1.5 rounded-xl cursor-pointer hover:bg-[#0B3D2E]/10 transition-colors"
                      >
                        استخدم <ArrowLeft size={10} />
                      </motion.div>
                    </Link>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
