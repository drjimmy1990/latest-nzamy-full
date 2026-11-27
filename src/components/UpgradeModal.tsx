"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowFatUp, CheckCircle, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { OFFICE_PLAN_LINK_AR, OFFICE_PLAN_PRICING_HREF, officePlanPhraseAr } from "@/lib/auth/officePlan";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  featureBlocked?: string;
  /**
   * Owner ق٢٦-١ / l19: the part of a locked office row's page the free side
   * may still open (the market's cases, the letterhead) — a second link.
   * The rest of the page shows the lock teaser (OfficePlanGuard).
   */
  continueHref?: string;
  /** The words of that link (default «فتح الصفحة»). */
  continueLabel?: string;
  /** Whose office plan opens the feature (a locked office row); absent = a plan tier lock. */
  officeAudience?: "lawyer" | "firm" | "enterprise";
}

/**
 * The upgrade dialog behind every lock (the sidebar's 🔒 rows,
 * SubscriptionGuard, PaywallGate). Owner ق٢٦-١ (package 2026-11-26): its
 * button used to send the user to the contact form with a «feature access»
 * query the form never read — a dead end. It now opens /pricing, where a signed-in
 * account sees only its own family's plans (audienceForUserType.ts) and buys
 * one online. It names no price and promises nothing a plan card does not.
 */
export default function UpgradeModal({ open, onClose, featureBlocked, continueHref, continueLabel, officeAudience }: UpgradeModalProps) {
  const { isDark } = useTheme();
  const user = useUser();
  const creditsUsed = Math.max(0, (user.creditsMax ?? 0) - (user.credits ?? 0));
  const creditsPercent = user.creditsMax
    ? Math.min(100, Math.round((creditsUsed / user.creditsMax) * 100))
    : 0;

  const card = isDark
    ? "bg-zinc-900/90 border-white/[0.07] backdrop-blur-xl"
    : "bg-white border-slate-200 shadow-2xl";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            className={`fixed z-[10001] inset-x-4 top-[12%] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[480px] rounded-3xl border max-h-[80dvh] overflow-y-auto overscroll-contain ${card}`}
            dir="rtl"
          >
            <div className={`relative px-6 pt-6 pb-5 ${isDark ? "bg-gradient-to-b from-[#0B3D2E]/20 to-transparent" : "bg-gradient-to-b from-[#0B3D2E]/[0.04] to-transparent"}`}>
              <button
                type="button"
                onClick={onClose}
                aria-label="إغلاق"
                className={`absolute top-4 left-4 p-1.5 rounded-xl transition-colors ${isDark ? "text-zinc-500 hover:bg-white/[0.05]" : "text-slate-400 hover:bg-slate-100"}`}
              >
                <X size={16} />
              </button>

              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-emerald-700 shadow-md">
                  <ArrowFatUp size={20} weight="fill" className="text-[#C8A762]" />
                </div>
                <div>
                  <h2 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>ميزة ضمن باقة مدفوعة</h2>
                  {featureBlocked && (
                    <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                      الميزة المطلوبة: {featureBlocked}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 space-y-4">
              {user.creditsMax != null && (
                <div className={`rounded-2xl border p-4 ${isDark ? "border-white/[0.07] bg-white/[0.02]" : "border-slate-100 bg-slate-50/60"}`}>
                  <div className="flex justify-between text-[10px] mb-1.5">
                    <span className={isDark ? "text-zinc-500" : "text-slate-400"}>الاستخدام المسجل</span>
                    <span className={`font-mono font-bold ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                      {creditsUsed} / {user.creditsMax}
                    </span>
                  </div>
                  <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-200"}`}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${creditsPercent}%` }}
                      className={`h-full rounded-full ${creditsPercent >= 90 ? "bg-red-500" : creditsPercent >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                    />
                  </div>
                </div>
              )}

              <div className={`rounded-2xl border p-4 ${isDark ? "border-white/[0.07]" : "border-slate-100"}`}>
                <div className="flex items-start gap-2.5">
                  <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-emerald-500" />
                  <p className={`text-[12px] leading-6 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                    {officeAudience
                      ? `هذه الميزة من أدوات إدارة المكتب، وهي متاحة في ${officePlanPhraseAr(officeAudience)}. اطّلع على الباقات المتاحة لحسابك واشترك من صفحتها.`
                      : "هذه الميزة متاحة في باقة أعلى من باقتك الحالية. اطّلع على الباقات المتاحة لحسابك واختر ما يناسبك."}
                  </p>
                </div>
              </div>

              <Link
                href={OFFICE_PLAN_PRICING_HREF}
                onClick={onClose}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0B3D2E] text-white text-[13px] font-black hover:bg-[#0a3328] transition-colors shadow-lg"
              >
                {OFFICE_PLAN_LINK_AR}
              </Link>

              {continueHref && (
                <Link
                  href={continueHref}
                  onClick={onClose}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[12px] font-bold transition-colors ${
                    isDark ? "border-white/10 text-zinc-300 hover:bg-white/[0.04]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {continueLabel ?? "فتح الصفحة"}
                </Link>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

