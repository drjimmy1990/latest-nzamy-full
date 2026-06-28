"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Wallet,
  Coins,
  Gift,
  ArrowLeft,
  Clock,
  CheckCircle,
  Copy,
  Users,
  Percent,
  PlusCircle,
  Receipt,
  ArrowDown,
  ArrowUp,
  Tag,
  Lightning,
  Star,
  UserCircle,
  HourglassHigh
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { apiGet } from "@/lib/services/api";

// ─── Types & Data ─────────────────────────────────────────────────────────────

interface Coupon {
  code: string;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn: string;
  discount: string;
  expiry: string;
  daysRemaining: number;
  type: "admin" | "provider" | "referral";
  providerName?: string;
  used: boolean;
  color: string;
}

interface TxRow {
  id: string;
  type: "credit" | "debit" | "system";
  amountAr: string;
  amountEn: string;
  descAr: string;
  descEn: string;
  date: string;
}

const WALLET_BALANCE = 0;   // SAR — يُملأ من /api/v1/wallet (لا قيمة افتراضية مزيفة)
const PENDING_BALANCE = 0;   // SAR — يُملأ من /api/v1/wallet

const coupons: Coupon[] = [
  {
    code: "SAUD-CONSULT-20",
    labelAr: "عرض محامي",
    labelEn: "Lawyer Promo",
    descAr: "٢٠٪ على استشارة ٤٥ دقيقة",
    descEn: "20% off 45min consultation",
    discount: "20%",
    expiry: "٣٠ يونيو ٢٠٢٦",
    daysRemaining: 45,
    type: "provider",
    providerName: "المحامي سعود القحطاني",
    used: false,
    color: "from-indigo-500 to-blue-400",
  },
  {
    code: "REF-GOLD-20",
    labelAr: "خصم إحالة",
    labelEn: "Referral Discount",
    descAr: "٢٠٪ على الاستشارة القادمة",
    descEn: "20% off your next consultation",
    discount: "20%",
    expiry: "٣٠ أبريل ٢٠٢٦",
    daysRemaining: 12,
    type: "referral",
    used: false,
    color: "from-amber-500 to-amber-400",
  },
  {
    code: "WELCOME-50",
    labelAr: "مكافأة المنصة",
    labelEn: "Platform Reward",
    descAr: "خصم ٥٠ ر.س على أول خدمة مدفوعة",
    descEn: "50 SAR off your first paid service",
    discount: "50 ر.س",
    expiry: "٣١ مارس ٢٠٢٦",
    daysRemaining: 0,
    type: "admin",
    used: true,
    color: "from-emerald-500 to-teal-400",
  },
];

const transactions: TxRow[] = [
  {
    id: "W1",
    type: "credit",
    amountAr: "+٥٠ ر.س",
    amountEn: "+50 SAR",
    descAr: "مكافأة إحالة — أحمد العتيبي",
    descEn: "Referral reward — Ahmed Al-Otaibi",
    date: "٥ أبريل ٢٠٢٦",
  },
  {
    id: "W2",
    type: "debit",
    amountAr: "−٥٠ ر.س",
    amountEn: "−50 SAR",
    descAr: "خصم على استشارة قانون العمل",
    descEn: "Discount applied — Labor law consultation",
    date: "٧ أبريل ٢٠٢٦",
  },
  {
    id: "W3",
    type: "credit",
    amountAr: "+٥٠ ر.س",
    amountEn: "+50 SAR",
    descAr: "مكافأة إحالة — سارة القحطاني",
    descEn: "Referral reward — Sara Al-Qahtani",
    date: "١٢ أبريل ٢٠٢٦",
  },
  {
    id: "W4",
    type: "credit",
    amountAr: "+٥٠ ر.س",
    amountEn: "+50 SAR",
    descAr: "مكافأة إحالة — فهد الشمري",
    descEn: "Referral reward — Fahad Al-Shammari",
    date: "١٥ أبريل ٢٠٢٦",
  },
  {
    id: "W5",
    type: "debit",
    amountAr: "−٣٠ ر.س",
    amountEn: "−30 SAR",
    descAr: "خصم على مراجعة عقد إيجار",
    descEn: "Discount applied — Lease contract review",
    date: "١٨ أبريل ٢٠٢٦",
  },
  {
    id: "W6",
    type: "credit",
    amountAr: "+٥٠ ر.س",
    amountEn: "+50 SAR",
    descAr: "مكافأة إحالة — خالد الدوسري",
    descEn: "Referral reward — Khaled Al-Dosari",
    date: "١٩ أبريل ٢٠٢٦",
  },
  {
    id: "W7",
    type: "system",
    amountAr: "+٥٠ ر.س",
    amountEn: "+50 SAR معلقة",
    descAr: "مكافأة معلقة — نورة البقمي (لم تشترك بعد)",
    descEn: "Pending reward — Noura Al-Baqmi (not subscribed yet)",
    date: "٢٠ أبريل ٢٠٢٦",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.4, ease: "easeOut" as const },
  }),
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function WalletPage() {
  const { isDark } = useTheme();
  const [walletBalance, setWalletBalance] = useState(WALLET_BALANCE);
  const [pendingBalance, setPendingBalance] = useState(PENDING_BALANCE);
  const [liveCoupons, setLiveCoupons] = useState<Coupon[]>(coupons);
  const [liveTransactions, setLiveTransactions] = useState<TxRow[]>(transactions);
  const [walletError, setWalletError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ data: { balance?: number; pendingBalance?: number; transactions?: TxRow[]; coupons?: Coupon[] } }>("/api/v1/wallet")
      .then((res) => {
        setWalletError(null);
        if (res.data?.balance !== undefined) setWalletBalance(res.data.balance);
        if (res.data?.pendingBalance !== undefined) setPendingBalance(res.data.pendingBalance);
        if (res.data?.transactions?.length) setLiveTransactions(res.data.transactions);
        if (res.data?.coupons?.length) setLiveCoupons(res.data.coupons);
      })
      .catch((err) => {
        console.error("[wallet] failed to load:", err);
        setWalletError("تعذر تحميل رصيد المحفظة. حاول مرة أخرى لاحقاً.");
      });
  }, []);
  const [activeTab, setActiveTab] = useState<"overview" | "coupons" | "history">("overview");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-100 rounded-2xl shadow-sm";

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  const tabs = [
    { id: "overview" as const, labelAr: "نظرة عامة", icon: Wallet },
    { id: "coupons" as const, labelAr: "كوبونات وعروض", icon: Tag },
    { id: "history" as const, labelAr: "سجل المعاملات", icon: Receipt },
  ];

  return (
    <div dir="rtl" className={`min-h-screen pb-24 ${isDark ? "bg-zinc-950 text-zinc-100" : "bg-slate-50 text-zinc-900"}`}>
      <div className="mx-auto max-w-[760px] px-4 py-8 space-y-6">

        {/* ── Breadcrumb ── */}
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Link href="/dashboard/client" className="hover:text-emerald-600 transition-colors">
            لوحة التحكم
          </Link>
          <span>/</span>
          <span className={isDark ? "text-zinc-300" : "text-zinc-600"}>محفظتي والمكافآت</span>
        </div>

        {/* ── Load Error Banner ── */}
        {walletError && (
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-[12px] ${
            isDark
              ? "bg-red-900/10 border-red-700/20 text-red-400"
              : "bg-red-50 border-red-200 text-red-700"
          }`}>
            <Clock size={16} weight="duotone" className="flex-shrink-0" />
            <span>{walletError}</span>
          </div>
        )}

        {/* ── Hero Balance Card ── */}
        <motion.div
          custom={0} variants={fadeUp} initial="hidden" animate="visible"
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B3D2E] to-[#0a5040] p-7 shadow-xl"
        >
          {/* Decorative blobs */}
          <div className="pointer-events-none absolute -top-12 -end-12 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-8 -start-8 h-36 w-36 rounded-full bg-amber-400/10 blur-2xl" />

          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <Wallet size={18} weight="fill" className="text-amber-400" />
              <p className="text-sm text-white/60 font-medium">رصيد المحفظة المتاح</p>
            </div>
            <div className="flex items-end gap-3 mb-5">
              <span className="text-5xl font-extrabold text-white font-mono">{walletBalance}</span>
              <span className="text-xl font-bold text-white/70 mb-1">ر.س</span>
              {pendingBalance > 0 && (
                <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold bg-amber-400/20 border border-amber-400/30 text-amber-300 rounded-full px-2.5 py-0.5">
                  <Clock size={11} />
                  {pendingBalance} ر.س معلقة
                </span>
              )}
            </div>

            {/* Quick stats */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-1.5 bg-white/10 rounded-xl px-3 py-2 text-xs text-white/80">
                <Users size={13} className="text-emerald-400" />
                <span><strong className="text-white">٥</strong> إحالات ناجحة</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/10 rounded-xl px-3 py-2 text-xs text-white/80">
                <Gift size={13} className="text-amber-400" />
                <span><strong className="text-white">٣</strong> عروض نشطة</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/10 rounded-xl px-3 py-2 text-xs text-white/80">
                <Percent size={13} className="text-purple-400" />
                <span>وفّرت <strong className="text-white">٨٠ ر.س</strong> حتى الآن</span>
              </div>
            </div>
          </div>

          {/* Use balance CTA */}
          <div className="relative mt-5 pt-5 border-t border-white/10">
            <p className="text-xs text-white/50 mb-3">يُطبَّق الرصيد تلقائياً عند الدفع لأي خدمة</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/client/find-lawyer">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 bg-[#C8A762] text-[#0B3D2E] font-bold px-5 py-2.5 rounded-xl text-sm cursor-pointer shadow-md"
                >
                  <Lightning size={15} weight="fill" />
                  احجز استشارة الآن
                </motion.div>
              </Link>
              <Link href="/dashboard/client/referral">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 bg-white/10 border border-white/20 text-white font-semibold px-5 py-2.5 rounded-xl text-sm cursor-pointer"
                >
                  <PlusCircle size={15} />
                  ادعُ مزيداً واكسب أكثر
                </motion.div>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* ── "How to use" note ── */}
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible"
          className={`flex items-start gap-3 rounded-2xl border p-4 ${
            isDark ? "bg-amber-950/30 border-amber-700/20" : "bg-amber-50 border-amber-200"
          }`}
        >
          <Star size={18} weight="fill" className="text-amber-500 mt-0.5 shrink-0" />
          <p className={`text-sm leading-relaxed ${isDark ? "text-amber-300" : "text-amber-800"}`}>
            <strong>كيف يعمل رصيد المحفظة؟</strong> عند الضغط على أي خدمة مدفوعة (استشارة، مراجعة عقد، توثيق)،
            تظهر لك خيار <em>"استخدام رصيد المحفظة"</em> في صفحة الدفع — يُخصم الرصيد تلقائياً من إجمالي الفاتورة.
          </p>
        </motion.div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 rounded-2xl border border-zinc-200/40 bg-white p-1.5 dark:border-white/10 dark:bg-zinc-900 flex-wrap">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-[#0B3D2E] text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                <Icon size={14} weight={activeTab === tab.id ? "fill" : "regular"} />
                {tab.labelAr}
              </button>
            );
          })}
        </div>

        {/* ── Tab Content ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >

            {/* ── Overview ── */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                {/* Balance breakdown */}
                <div className={`${card} p-5`}>
                  <h3 className={`font-bold text-sm mb-4 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                    تفاصيل الرصيد
                  </h3>
                  <div className="space-y-3">
                    {[
                      { labelAr: "مكتسب من الإحالات (٥ أصدقاء)", icon: Users, color: "text-emerald-500", bg: isDark ? "bg-emerald-900/20" : "bg-emerald-50", amount: "٢٥٠ ر.س", positive: true },
                      { labelAr: "مُستخدم على خدمات سابقة", icon: Receipt, color: "text-red-400", bg: isDark ? "bg-red-900/20" : "bg-red-50", amount: "−٨٠ ر.س", positive: false },
                      { labelAr: "رصيد معلق (صديق لم يشترك)", icon: Clock, color: "text-amber-400", bg: isDark ? "bg-amber-900/20" : "bg-amber-50", amount: "٥٠ ر.س", positive: null },
                    ].map((row, i) => {
                      const Icon = row.icon;
                      return (
                        <div key={i} className={`flex items-center gap-3 rounded-xl p-3 ${row.bg}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${row.bg}`}>
                            <Icon size={16} weight="duotone" className={row.color} />
                          </div>
                          <p className={`flex-1 text-sm ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{row.labelAr}</p>
                          <span className={`font-bold text-sm font-mono ${
                            row.positive === true ? "text-emerald-500"
                            : row.positive === false ? "text-red-400"
                            : "text-amber-400"
                          }`}>
                            {row.amount}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className={`mt-4 pt-4 border-t flex items-center justify-between ${isDark ? "border-white/10" : "border-zinc-100"}`}>
                    <span className={`text-sm font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>
                      الرصيد الصافي المتاح
                    </span>
                    <span className="text-xl font-extrabold text-emerald-500 font-mono">{walletBalance} ر.س</span>
                  </div>
                </div>

                {/* Earn more CTA */}
                <Link href="/dashboard/client/referral">
                  <motion.div whileHover={{ y: -2 }}
                    className={`${card} p-5 flex items-center gap-4 cursor-pointer group`}>
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-400 flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-105 transition-transform">
                      <Gift size={22} weight="fill" className="text-white" />
                    </div>
                    <div className="flex-1">
                      <p className={`font-bold text-sm ${isDark ? "text-white" : "text-zinc-800"}`}>
                        ادعُ أصدقاءك واكسب المزيد
                      </p>
                      <p className={`text-xs mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                        ٥٠ ر.س لكل صديق ينضم ويستخدم أي خدمة قانونية
                      </p>
                    </div>
                    <ArrowLeft size={18} className="text-emerald-500 group-hover:-translate-x-1 transition-transform" />
                  </motion.div>
                </Link>
              </div>
            )}

            {/* ── Coupons ── */}
            {activeTab === "coupons" && (
              <div className="space-y-3">
                <p className={`text-xs mb-4 leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                  انسخ الكود وأدخله في صفحة الدفع، أو سيُطبّق تلقائياً عند حجزك للخدمة المرتبطة به.
                </p>
                {liveCoupons.map((c, i) => (
                  <motion.div
                    key={c.code}
                    custom={i}
                    variants={fadeUp}
                    initial="hidden"
                    animate="visible"
                    className={`relative overflow-hidden rounded-2xl border ${
                      c.used
                        ? isDark ? "border-white/5 opacity-50" : "border-zinc-200 opacity-50"
                        : isDark ? "border-white/10" : "border-zinc-200"
                    } ${isDark ? "bg-zinc-900" : "bg-white"} shadow-sm`}
                  >
                    {/* Color stripe */}
                    <div className={`absolute start-0 top-0 bottom-0 w-1.5 bg-gradient-to-b ${c.color} rounded-e-full`} />

                    <div className="px-5 py-4 ms-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-gradient-to-r ${c.color} text-white`}>
                              {c.labelAr}
                            </span>
                            {c.type === "provider" && c.providerName && (
                              <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-white/10 text-indigo-300" : "bg-indigo-50 text-indigo-700"}`}>
                                <UserCircle size={12} weight="fill" />
                                {c.providerName}
                              </span>
                            )}
                            {c.used && (
                              <span className={`text-xs font-semibold ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                                مُستخدم
                              </span>
                            )}
                          </div>
                          
                          <p className={`text-sm font-bold ${isDark ? "text-white" : "text-zinc-800"}`}>
                            {c.descAr}
                          </p>
                          
                          <div className={`flex flex-wrap items-center gap-3 mt-2`}>
                            <p className={`text-xs flex items-center gap-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                              <Clock size={12} />
                              ينتهي {c.expiry}
                            </p>
                            {!c.used && c.daysRemaining > 0 && (
                              <p className={`text-xs font-bold flex items-center gap-1 ${c.daysRemaining < 15 ? "text-rose-500" : isDark ? "text-amber-400" : "text-amber-600"}`}>
                                <HourglassHigh size={12} weight="fill" />
                                باقي {c.daysRemaining} يوماً
                              </p>
                            )}
                          </div>
                        </div>
                        
                        <div className="text-end flex-shrink-0">
                          <div className={`text-2xl font-extrabold font-mono ${isDark ? "text-white" : "text-zinc-800"}`}>
                            {c.discount}
                          </div>
                          <div className={`text-[10px] font-medium ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                            خصم
                          </div>
                        </div>
                      </div>

                      {!c.used && (
                        <div className={`mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 ${
                          isDark ? "bg-zinc-800/60 border-white/10" : "bg-zinc-50 border-zinc-200"
                        }`}>
                          <Tag size={13} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
                          <code className={`flex-1 text-sm font-mono font-bold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                            {c.code}
                          </code>
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => copyCode(c.code)}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                              copiedCode === c.code
                                ? "bg-emerald-500 text-white"
                                : isDark
                                ? "bg-emerald-800/50 text-emerald-400 hover:bg-emerald-700/50"
                                : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            }`}
                          >
                            <AnimatePresence mode="wait">
                              {copiedCode === c.code ? (
                                <motion.span key="ok" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                                  className="flex items-center gap-1">
                                  <CheckCircle size={12} weight="fill" />
                                  تم
                                </motion.span>
                              ) : (
                                <motion.span key="copy" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                                  className="flex items-center gap-1">
                                  <Copy size={12} />
                                  نسخ
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </motion.button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* ── History ── */}
            {activeTab === "history" && (
              <div className={`${card} overflow-hidden`}>
                <div className={`px-5 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
                  <h3 className={`font-bold text-sm ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                    سجل معاملات المحفظة
                  </h3>
                </div>
                <div className="divide-y divide-dashed divide-zinc-100 dark:divide-white/[0.05]">
                  {liveTransactions.map((tx, i) => (
                    <motion.div
                      key={tx.id}
                      custom={i}
                      variants={fadeUp}
                      initial="hidden"
                      animate="visible"
                      className={`flex items-center gap-3 px-5 py-3.5 transition-colors ${
                        isDark ? "hover:bg-white/[0.02]" : "hover:bg-zinc-50"
                      }`}
                    >
                      {/* Icon */}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        tx.type === "credit"
                          ? isDark ? "bg-emerald-900/30" : "bg-emerald-50"
                          : tx.type === "debit"
                          ? isDark ? "bg-red-900/20" : "bg-red-50"
                          : isDark ? "bg-amber-900/20" : "bg-amber-50"
                      }`}>
                        {tx.type === "credit" ? (
                          <ArrowDown size={15} weight="bold" className="text-emerald-500" />
                        ) : tx.type === "debit" ? (
                          <ArrowUp size={15} weight="bold" className="text-red-400" />
                        ) : (
                          <Clock size={15} weight="duotone" className="text-amber-400" />
                        )}
                      </div>

                      {/* Description */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                          {tx.descAr}
                        </p>
                        <p className={`text-xs ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                          {tx.date}
                        </p>
                      </div>

                      {/* Amount */}
                      <span className={`font-bold text-sm font-mono flex-shrink-0 ${
                        tx.type === "credit"
                          ? "text-emerald-500"
                          : tx.type === "debit"
                          ? "text-red-400"
                          : "text-amber-400"
                      }`}>
                        {tx.amountAr}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>

      </div>
    </div>
  );
}
