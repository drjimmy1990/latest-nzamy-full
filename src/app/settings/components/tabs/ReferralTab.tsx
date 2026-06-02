"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Gift,
  Copy,
  ShareNetwork,
  CheckCircle,
  Users,
  CurrencyCircleDollar,
  ArrowRight,
} from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { SectionTitle } from "./_shared";

// ── Referral content per user type ────────────────────────────────────
interface ReferralContent {
  title: string;
  description: string;
  rewardSelf: string;
  rewardFriend: string;
  cta: string;
}

function getReferralContent(userType: string | null): ReferralContent {
  switch (userType) {
    case "individual":
      return {
        title: "ادعُ أصدقاءك",
        description: "كل صديق يسجّل عبر رابطك يمنحك خصماً على اشتراكك القادم",
        rewardSelf: "50 ر.س رصيد لحسابك",
        rewardFriend: "شهر مجاني لصديقك",
        cta: "شارك الرابط مع أصدقائك",
      };
    case "lawyer":
    case "firm":
      return {
        title: "ادعُ زملاءك المحامين",
        description: "كل محامٍ أو مكتب محاماة يشترك عبر رابطك تحصل على عمولة خاصة",
        rewardSelf: "3 أشهر مجانية أو 150 ر.س رصيد",
        rewardFriend: "شهر تجريبي مجاني",
        cta: "شارك مع المحامين وزملاء المهنة",
      };
    case "corporate":
      return {
        title: "ادعُ الشركات الشريكة",
        description: "ادعُ شركاءك التجاريين وتمتع بخصم على الباقة المؤسسية",
        rewardSelf: "خصم 15% على تجديد الباقة السنوية",
        rewardFriend: "شهر تجريبي مجاني على الباقة Corporate",
        cta: "ابدأ بدعوة شركائك التجاريين",
      };
    case "micro":
      return {
        title: "ادعُ المنشآت الأخرى",
        description: "كل منشأة تنضم عبر رابطك تمنحك رصيداً إضافياً",
        rewardSelf: "75 ر.س رصيد لكل إحالة",
        rewardFriend: "أسبوع تجريبي مجاني",
        cta: "شارك مع أصحاب المنشآت الصغيرة",
      };
    case "government":
      return {
        title: "برنامج الإحالة",
        description: "غير متاح لحسابات الجهات الحكومية",
        rewardSelf: "—",
        rewardFriend: "—",
        cta: "",
      };
    case "ngo":
      return {
        title: "ادعُ الجمعيات الشريكة",
        description: "كل جمعية تنضم عبر رابطك تمنحك رصيداً إضافياً لدعم أنشطتك",
        rewardSelf: "50 ر.س رصيد",
        rewardFriend: "شهر مجاني للجمعية الجديدة",
        cta: "شارك مع الجمعيات والمنظمات",
      };
    case "provider":
      return {
        title: "ادعُ مزودي خدمات آخرين",
        description: "كل مزوّد ينضم عبر رابطك تحصل على عمولة من أول خدمة يقدمها",
        rewardSelf: "100 ر.س رصيد",
        rewardFriend: "شهر تجريبي مجاني",
        cta: "شارك مع المحكّمين والموثقين والمعقبين",
      };
    default:
      return {
        title: "برنامج الإحالة",
        description: "ادعُ أصدقاءك واحصل على مكافآت",
        rewardSelf: "50 ر.س رصيد",
        rewardFriend: "شهر مجاني",
        cta: "شارك الرابط",
      };
  }
}

// ── Component ─────────────────────────────────────────────────────────
export function ReferralTab() {
  const { userType, name } = useUser();
  const content = getReferralContent(userType);
  const [copied, setCopied] = useState(false);

  const referralCode = "NZM-" + (name?.replace(/\s/g, "").slice(0, 4).toUpperCase() ?? "USER");
  const referralLink = `https://nezamy.sa/join?ref=${referralCode}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Government: not applicable
  if (userType === "government") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Gift size={36} className="text-zinc-300 dark:text-zinc-600 mb-3" />
        <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
          برنامج الإحالة غير متاح لحسابات الجهات الحكومية
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-emerald-700 p-6 text-white relative overflow-hidden">
        <div className="absolute -end-8 -top-8 w-32 h-32 rounded-full bg-white/5" />
        <div className="absolute -start-4 -bottom-6 w-24 h-24 rounded-full bg-white/5" />
        <div className="relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] flex items-center justify-center mb-4">
            <Gift size={24} weight="fill" className="text-[#C8A762]" />
          </div>
          <h2 className="text-xl font-bold tracking-tight mb-1">{content.title}</h2>
          <p className="text-sm text-white/70 max-w-[55ch] leading-relaxed">{content.description}</p>
        </div>
      </div>

      {/* Rewards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-dark-card border border-gray-100 dark:border-white/[0.06] rounded-2xl p-5">
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">تحصل أنت على</p>
          <p className="text-lg font-bold text-zinc-900 dark:text-white">{content.rewardSelf}</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">لكل إحالة ناجحة</p>
        </div>
        <div className="bg-white dark:bg-dark-card border border-gray-100 dark:border-white/[0.06] rounded-2xl p-5">
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">يحصل من تدعوه على</p>
          <p className="text-lg font-bold text-zinc-900 dark:text-white">{content.rewardFriend}</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">عند التسجيل عبر رابطك</p>
        </div>
      </div>

      {/* Referral link */}
      <div>
        <SectionTitle>رابطك الشخصي</SectionTitle>
        <div className="flex gap-2">
          <div className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-dark-bg text-sm text-zinc-500 dark:text-zinc-400 font-mono truncate">
            {referralLink}
          </div>
          <motion.button
            whileTap={{ scale: 0.97, y: 1 }}
            onClick={handleCopy}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              copied
                ? "bg-emerald-600 text-white"
                : "bg-royal text-white hover:bg-royal/90"
            }`}
          >
            {copied ? <CheckCircle size={16} weight="fill" /> : <Copy size={16} />}
            {copied ? "تم النسخ" : "نسخ"}
          </motion.button>
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">كودك: <span className="font-mono font-bold text-zinc-600 dark:text-zinc-300">{referralCode}</span></p>
      </div>

      {/* Stats */}
      <div>
        <SectionTitle>إحصائيات الإحالات</SectionTitle>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "دعوات أُرسلت", value: "12" },
            { label: "تسجيلات مكتملة", value: "7" },
            { label: "رصيد مكتسب", value: "350 ر.س" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white dark:bg-dark-card border border-gray-100 dark:border-white/[0.06] rounded-2xl p-5 text-center">
              <p className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">{stat.value}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
