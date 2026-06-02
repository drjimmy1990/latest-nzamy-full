"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Warning, ArrowFatUp, CreditCard } from "@phosphor-icons/react";
import UpgradeModal from "@/components/UpgradeModal";

/**
 * CreditsBanner — Non-blocking inline banner shown when user's AI credits are exhausted.
 * Opens UpgradeModal instead of navigating away to /pricing.
 */
export function CreditsBanner({ isDark, credits, creditsMax }: {
  isDark: boolean;
  credits?: number;
  creditsMax?: number;
}) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  return (
    <>
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} featureBlocked="كريديت AI إضافي" />
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex flex-col sm:flex-row items-start sm:items-center gap-3 px-4 py-3.5 rounded-2xl border mb-5 ${
          isDark
            ? "bg-amber-500/10 border-amber-500/20"
            : "bg-amber-50 border-amber-200"
        }`}
        dir="rtl"
      >
        <div className="flex items-start gap-2.5 flex-1">
          <Warning
            size={18}
            weight="duotone"
            className={`flex-shrink-0 mt-0.5 ${isDark ? "text-amber-400" : "text-amber-600"}`}
          />
          <div>
            <p className={`text-[13px] font-bold leading-snug ${isDark ? "text-amber-300" : "text-amber-800"}`}>
              انتهى رصيدك من الكريديت
            </p>
            <p className={`text-[11px] mt-0.5 leading-relaxed ${isDark ? "text-amber-400/70" : "text-amber-700/80"}`}>
              يمكنك ترقية باقتك للحصول على رصيد شهري أكبر، أو الدفع بالعمل القانوني لهذه الخدمة فقط.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
          <button
            onClick={() => setUpgradeOpen(true)}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B3D2E] text-white text-[12px] font-bold hover:bg-[#0e4f3a] transition-colors shadow-sm"
          >
            <ArrowFatUp size={13} weight="fill" />
            ارقَ باقتك
          </button>
          <Link
            href="/pricing?mode=single"
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold border transition-colors ${
              isDark
                ? "border-white/10 text-zinc-300 hover:bg-zinc-800"
                : "border-zinc-200 text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            <CreditCard size={13} />
            الدفع بالعمل القانوني
          </Link>
        </div>
      </motion.div>
    </>
  );
}

/**
 * PaywallGate — Full-page blocker for features that require a subscription.
 * Opens UpgradeModal on button click instead of navigating to /pricing.
 */
export default function PaywallGate({
  isDark,
  title = "الخدمة غير متاحة",
  description = "هذه الأداة تتطلب اشتراكاً نشطاً. ارقَ إلى خطة أعلى للوصول إليها.",
  featureBlocked,
}: {
  isDark: boolean;
  title?: string;
  description?: string;
  featureBlocked?: string;
}) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  return (
    <>
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} featureBlocked={featureBlocked ?? title} />
      <div
        className={`flex flex-col items-center justify-center min-h-[100dvh] px-6 text-center ${isDark ? "bg-zinc-950" : "bg-zinc-50"}`}
        dir="rtl"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200 }}
          className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-zinc-700 to-zinc-600 shadow-lg"
        >
          <Warning size={36} weight="duotone" className="text-zinc-300" />
        </motion.div>
        <h2 className={`text-xl font-bold mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
          {title}
        </h2>
        <p className={`text-[13px] max-w-sm leading-relaxed mb-8 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          {description}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => setUpgradeOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0B3D2E] text-white text-[13px] font-semibold hover:bg-[#0e4f3a] transition-colors"
          >
            <ArrowFatUp size={16} weight="fill" /> عرض خطط الترقية
          </button>
          <Link
            href="/dashboard"
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold border transition-colors ${isDark ? "border-white/10 text-zinc-300 hover:bg-zinc-800" : "border-zinc-200 text-zinc-700 hover:bg-zinc-100"}`}
          >
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </>
  );
}
