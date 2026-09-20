"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowFatUp, CheckCircle, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  featureBlocked?: string;
}

/**
 * Access-request dialog used while automated subscriptions and payments are
 * disabled. It deliberately contains no plan identifiers, prices, coverage,
 * discounts, or entitlement promises: those require an approved server-side
 * catalogue and a real payment/activation workflow.
 */
export default function UpgradeModal({ open, onClose, featureBlocked }: UpgradeModalProps) {
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
                  <h2 className={`text-[16px] font-bold ${isDark ? "text-white" : "text-slate-800"}`}>طلب مراجعة الوصول</h2>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    {featureBlocked ? `الميزة المطلوبة: ${featureBlocked}` : "راجع توفر الميزة قبل أي التزام"}
                  </p>
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
                    لا يوجد تفعيل مدفوع أو اشتراك آلي من هذه النافذة. أرسل طلبك، وسيُراجع توفر الميزة ونطاقها وتكلفتها قبل أي التزام.
                  </p>
                </div>
              </div>

              <Link
                href="/contact?type=feature-access"
                onClick={onClose}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0B3D2E] text-white text-[13px] font-black hover:bg-[#0a3328] transition-colors shadow-lg"
              >
                إرسال طلب مراجعة
              </Link>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

