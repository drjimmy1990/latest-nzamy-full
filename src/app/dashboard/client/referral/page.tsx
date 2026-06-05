"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gift,
  Copy,
  WhatsappLogo,
  Share,
  Users,
  CheckCircle,
  ArrowLeft,
  CaretRight,
  Link,
  Star,
  Coins,
  Trophy,
  Clock,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Data ────────────────────────────────────────────────────────────────────

const REFERRAL_URL = "https://nezamy.online/join?ref=JUDGE47";

const stats = [
  {
    labelAr: "دعوات مُرسلة",
    labelEn: "Invites Sent",
    value: "١٢",
    valueEn: "12",
    icon: Users,
    color: "text-sky-400",
    bg: "bg-sky-400/10",
  },
  {
    labelAr: "انضموا",
    labelEn: "Joined",
    value: "٥",
    valueEn: "5",
    icon: CheckCircle,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
  },
  {
    labelAr: "مكافآت مكتسبة (ر.س)",
    labelEn: "Rewards Earned (SAR)",
    value: "٢٥٠",
    valueEn: "250",
    icon: Coins,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
  },
];

const steps = [
  {
    step: 1,
    titleAr: "شارك الرابط الخاص بك",
    titleEn: "Share your link",
    icon: Link,
  },
  {
    step: 2,
    titleAr: "يسجل صديقك ويشترك",
    titleEn: "Friend signs up & subscribes",
    icon: Users,
  },
  {
    step: 3,
    titleAr: "تحصل على مكافأة ٥٠ ر.س",
    titleEn: "You get 50 SAR reward",
    icon: Gift,
  },
];

const friends = [
  {
    initials: "أح",
    initialsEn: "AH",
    nameAr: "أحمد العتيبي",
    nameEn: "Ahmed Al-Otaibi",
    statusAr: "منضم",
    statusEn: "Joined",
    joined: true,
    creditsAr: "+٥٠ ر.س",
    creditsEn: "+50",
  },
  {
    initials: "سا",
    initialsEn: "SQ",
    nameAr: "سارة القحطاني",
    nameEn: "Sara Al-Qahtani",
    statusAr: "منضم",
    statusEn: "Joined",
    joined: true,
    creditsAr: "+٥٠ ر.س",
    creditsEn: "+50",
  },
  {
    initials: "فه",
    initialsEn: "FS",
    nameAr: "فهد الشمري",
    nameEn: "Fahad Al-Shammari",
    statusAr: "منضم",
    statusEn: "Joined",
    joined: true,
    creditsAr: "+٥٠ ر.س",
    creditsEn: "+50",
  },
  {
    initials: "نو",
    initialsEn: "NB",
    nameAr: "نورة البقمي",
    nameEn: "Noura Al-Baqmi",
    statusAr: "بانتظار",
    statusEn: "Pending",
    joined: false,
    creditsAr: "—",
    creditsEn: "—",
  },
  {
    initials: "خا",
    initialsEn: "KD",
    nameAr: "خالد الدوسري",
    nameEn: "Khaled Al-Dosari",
    statusAr: "منضم",
    statusEn: "Joined",
    joined: true,
    creditsAr: "+٥٠ ر.س",
    creditsEn: "+50",
  },
];

// ─── Animation Variants ───────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: "easeOut" as const },
  }),
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: i * 0.07, duration: 0.4, ease: "easeOut" as const },
  }),
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReferralPage() {
  const { lang, isDark, isRTL } = useTheme();
  const isAr = lang === "ar";

  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(REFERRAL_URL).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleWhatsApp() {
    const msg = isAr
      ? `انضم إلى منصة نظامي القانونية الذكية واحصل على أفضل الخدمات القانونية: ${REFERRAL_URL}`
      : `Join Nezamy – the AI legal platform: ${REFERRAL_URL}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(msg)}`,
      "_blank",
      "noopener"
    );
  }

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className={`min-h-screen flex flex-col`}
    >
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8 space-y-6">

        {/* ── Back link ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, x: isRTL ? 12 : -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
        >
          <a
            href="/dashboard/client"
            className={`inline-flex items-center gap-2 text-sm font-medium transition-colors ${
              isDark
                ? "text-emerald-400 hover:text-emerald-300"
                : "text-emerald-700 hover:text-emerald-600"
            }`}
          >
            <ArrowLeft size={16} weight="bold" />
            <span>{isAr ? "العودة إلى لوحة التحكم" : "Back to Dashboard"}</span>
          </a>
        </motion.div>

        {/* ── Demo Data Banner ── */}
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-[12px] ${
          isDark
            ? "bg-amber-900/10 border-amber-700/20 text-amber-400"
            : "bg-amber-50 border-amber-200 text-amber-700"
        }`}>
          <Clock size={16} weight="duotone" className="flex-shrink-0" />
          <span>البيانات المعروضة توضيحية — سيتم تحديثها تلقائياً عند ربط حسابك.</span>
        </div>

        {/* ── Hero card ─────────────────────────────────────────────────── */}
        <motion.div
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-[#0a5040] p-7 shadow-xl"
        >
          {/* Background glow */}
          <div className="pointer-events-none absolute -top-12 -end-12 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-8 -start-8 h-36 w-36 rounded-full bg-amber-400/10 blur-2xl" />

          <div className="relative flex flex-col gap-4">
            {/* Trophy */}
            <motion.div
              initial={{ scale: 0, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 180 }}
              className="self-start rounded-xl bg-amber-400/20 p-3"
            >
              <Trophy size={32} weight="fill" className="text-amber-400" />
            </motion.div>

            <div className="space-y-1">
              <h1 className="text-2xl font-bold leading-snug text-white">
                {isAr
                  ? "ادعُ أصدقاءك واكسب رصيد مكافآت"
                  : "Invite Friends & Earn Rewards"}
              </h1>
              <p className="text-emerald-200/80 text-sm leading-relaxed">
                {isAr
                  ? "تحصل على مكافأة ٥٠ ر.س لكل صديق ينضم ويشترك يضاف لرصيد باقتك"
                  : "Get 50 SAR reward for every friend who joins and subscribes"}
              </p>
            </div>

            {/* Mini stats strip */}
            <div className="flex flex-wrap gap-3 pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
                <Coins size={13} weight="fill" className="text-amber-400" />
                {isAr ? "٢٥٠ ر.س مكتسبة" : "250 SAR Earned"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
                <Star size={13} weight="fill" className="text-amber-400" />
                {isAr ? "الرتبة الأولى" : "Rank #1"}
              </span>
            </div>
          </div>
        </motion.div>

        {/* ── Referral link box ─────────────────────────────────────────── */}
        <motion.div
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className={`rounded-2xl p-5 shadow-sm border space-y-4 ${
            isDark
              ? "bg-[#0f1e18] border-emerald-900/40"
              : "bg-white border-gray-200"
          }`}
        >
          <h2
            className={`text-base font-semibold ${
              isDark ? "text-emerald-300" : "text-emerald-800"
            }`}
          >
            {isAr ? "رابط الإحالة الخاص بك" : "Your Referral Link"}
          </h2>

          {/* URL row */}
          <div
            className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${
              isDark
                ? "bg-[#0B1A14] border-emerald-900/30"
                : "bg-emerald-50 border-emerald-100"
            }`}
          >
            <Link
              size={16}
              className={isDark ? "text-emerald-500" : "text-emerald-600"}
            />
            <span
              className={`flex-1 truncate text-sm font-mono ${
                isDark ? "text-gray-300" : "text-gray-700"
              }`}
            >
              {REFERRAL_URL}
            </span>

            {/* Copy button */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleCopy}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                copied
                  ? "bg-emerald-500 text-white"
                  : isDark
                  ? "bg-emerald-800/60 text-emerald-300 hover:bg-emerald-700/60"
                  : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
              }`}
            >
              <AnimatePresence mode="wait" initial={false}>
                {copied ? (
                  <motion.span
                    key="check"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-1"
                  >
                    <CheckCircle size={14} weight="fill" />
                    {isAr ? "تم النسخ" : "Copied!"}
                  </motion.span>
                ) : (
                  <motion.span
                    key="copy"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-1"
                  >
                    <Copy size={14} />
                    {isAr ? "نسخ" : "Copy"}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </div>

          {/* Share buttons */}
          <div className="flex flex-wrap gap-3">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleWhatsApp}
              className="flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1ebe5d] transition-colors"
            >
              <WhatsappLogo size={18} weight="fill" />
              {isAr ? "مشاركة عبر واتساب" : "Share via WhatsApp"}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ url: REFERRAL_URL }).catch(() => {});
                } else {
                  handleCopy();
                }
              }}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                isDark
                  ? "bg-emerald-800/50 text-emerald-300 hover:bg-emerald-700/50"
                  : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
              }`}
            >
              <Share size={18} />
              {isAr ? "مشاركة" : "Share"}
            </motion.button>
          </div>
        </motion.div>

        {/* ── Stats row ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              custom={i}
              variants={scaleIn}
              initial="hidden"
              animate="visible"
              className={`rounded-2xl p-4 border flex flex-col items-center gap-2 text-center shadow-sm ${
                isDark
                  ? "bg-[#0f1e18] border-emerald-900/40"
                  : "bg-white border-gray-200"
              }`}
            >
              <div className={`rounded-xl p-2.5 ${stat.bg}`}>
                <stat.icon size={20} weight="fill" className={stat.color} />
              </div>
              <span
                className={`text-xl font-bold ${
                  isDark ? "text-white" : "text-gray-900"
                }`}
              >
                {isAr ? stat.value : stat.valueEn}
              </span>
              <span
                className={`text-xs leading-tight ${
                  isDark ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {isAr ? stat.labelAr : stat.labelEn}
              </span>
            </motion.div>
          ))}
        </div>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <motion.div
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className={`rounded-2xl p-5 border shadow-sm ${
            isDark
              ? "bg-[#0f1e18] border-emerald-900/40"
              : "bg-white border-gray-200"
          }`}
        >
          <h2
            className={`mb-5 text-base font-semibold ${
              isDark ? "text-emerald-300" : "text-emerald-800"
            }`}
          >
            {isAr ? "كيف يعمل البرنامج؟" : "How It Works"}
          </h2>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-0 sm:gap-0">
            {steps.map((s, i) => (
              <div
                key={i}
                className="flex sm:flex-col flex-row items-start sm:items-center flex-1 gap-3 sm:gap-2 relative"
              >
                {/* Connector line (desktop) */}
                {i < steps.length - 1 && (
                  <div
                    className={`hidden sm:block absolute top-5 ${
                      isRTL ? "left-0" : "right-0"
                    } w-1/2 h-px ${
                      isDark ? "bg-emerald-900/60" : "bg-emerald-100"
                    }`}
                  />
                )}

                {/* Step content */}
                <div className="flex sm:flex-col items-center sm:items-center gap-3 sm:gap-2 w-full sm:text-center">
                  {/* Icon bubble */}
                  <div
                    className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${
                      isDark
                        ? "bg-[#0B3D2E] border-emerald-600"
                        : "bg-emerald-50 border-emerald-300"
                    }`}
                  >
                    <s.icon
                      size={18}
                      weight="fill"
                      className={
                        isDark ? "text-emerald-400" : "text-emerald-600"
                      }
                    />
                  </div>

                  <div className="sm:px-1">
                    <span
                      className={`block text-xs font-bold mb-0.5 ${
                        isDark ? "text-emerald-500" : "text-emerald-500"
                      }`}
                    >
                      {isAr ? `الخطوة ${s.step}` : `Step ${s.step}`}
                    </span>
                    <span
                      className={`text-xs leading-snug ${
                        isDark ? "text-gray-300" : "text-gray-700"
                      }`}
                    >
                      {isAr ? s.titleAr : s.titleEn}
                    </span>
                  </div>
                </div>

                {/* Arrow between steps (mobile) */}
                {i < steps.length - 1 && (
                  <CaretRight
                    size={14}
                    className={`sm:hidden mt-2 shrink-0 ${
                      isDark ? "text-emerald-700" : "text-emerald-300"
                    } ${isRTL ? "rotate-180" : ""}`}
                  />
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Invited friends list ──────────────────────────────────────── */}
        <motion.div
          custom={3}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className={`rounded-2xl border shadow-sm overflow-hidden ${
            isDark
              ? "bg-[#0f1e18] border-emerald-900/40"
              : "bg-white border-gray-200"
          }`}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between px-5 py-4 border-b ${
              isDark ? "border-emerald-900/40" : "border-gray-100"
            }`}
          >
            <h2
              className={`text-base font-semibold ${
                isDark ? "text-emerald-300" : "text-emerald-800"
              }`}
            >
              {isAr ? "الأصدقاء المدعوّون" : "Invited Friends"}
            </h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                isDark
                  ? "bg-emerald-900/50 text-emerald-400"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {isAr ? `${friends.length} أشخاص` : `${friends.length} people`}
            </span>
          </div>

          {/* Rows */}
          <ul className="divide-y divide-dashed">
            {friends.map((f, i) => (
              <motion.li
                key={i}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                className={`flex items-center gap-3 px-5 py-3.5 transition-colors ${
                  isDark
                    ? "divide-emerald-900/30 hover:bg-emerald-900/10"
                    : "divide-gray-100 hover:bg-gray-50"
                }`}
              >
                {/* Avatar */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0B3D2E] to-[#0a5040] text-xs font-bold text-emerald-200 select-none">
                  {isAr ? f.initials : f.initialsEn}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium truncate ${
                      isDark ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {isAr ? f.nameAr : f.nameEn}
                  </p>
                </div>

                {/* Status badge */}
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    f.joined
                      ? isDark
                        ? "bg-emerald-900/50 text-emerald-400"
                        : "bg-emerald-100 text-emerald-700"
                      : isDark
                      ? "bg-yellow-900/30 text-yellow-400"
                      : "bg-yellow-50 text-yellow-600"
                  }`}
                >
                  {isAr ? f.statusAr : f.statusEn}
                </span>

                {/* Credits */}
                <span
                  className={`w-10 text-end text-sm font-bold ${
                    f.joined
                      ? "text-amber-400"
                      : isDark
                      ? "text-gray-600"
                      : "text-gray-400"
                  }`}
                >
                  {isAr ? f.creditsAr : f.creditsEn}
                </span>
              </motion.li>
            ))}
          </ul>
        </motion.div>

        {/* ── Terms note ────────────────────────────────────────────────── */}
        <motion.p
          custom={4}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className={`text-center text-xs leading-relaxed pb-2 ${
            isDark ? "text-gray-500" : "text-gray-400"
          }`}
        >
          {isAr
            ? "الشروط: يجب أن يشترك الصديق في باقة مدفوعة — صلاحية الرابط ٩٠ يوماً"
            : "Terms: friend must subscribe to a paid plan — link valid for 90 days"}
        </motion.p>
      </main>

    </div>
  );
}
