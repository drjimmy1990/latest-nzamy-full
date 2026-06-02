"use client";

import { useSubscription } from "@/hooks/useSubscription";
import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { LockKey, ArrowLeft, Star } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import UpgradeModal from "@/components/UpgradeModal";

export function SubscriptionGuard({
  featureKey,
  children,
}: {
  featureKey: string;
  children: ReactNode;
}) {
  const { can, requiredTier, isDemo } = useSubscription();
  const [mounted, setMounted] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null; // Avoid hydration mismatch on initial render

  if (!can(featureKey)) {
    const minTier = requiredTier(featureKey) ?? "pro";
    
    // Map tier string to a friendly arabic label
    const TIER_LABELS: Record<string, string> = {
      free: "المجانية",
      shield: "التأمين القانوني",
      ai: "نظامي AI",
      pro: "الاحترافية",
      max: "الماكس",
      corp: "حوكمة الشركات",
      enterprise: "الشركات المتكاملة",
    };

    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
        <UpgradeModal 
          open={upgradeOpen} 
          onClose={() => setUpgradeOpen(false)} 
          featureBlocked={TIER_LABELS[minTier] || minTier} 
        />
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-zinc-900/40 border border-white/5 rounded-2xl p-8 text-center flex flex-col items-center"
        >
          <div className="w-20 h-20 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-6 relative">
            <LockKey size={40} weight="duotone" />
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center border-2 border-[#161b22]">
              <Star size={12} weight="fill" />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-3">هذه الميزة مقفلة في باقتك الحالية</h2>
          <p className="text-zinc-400 mb-8 leading-relaxed">
            للوصول إلى هذه الأداة المتقدمة، يجب ترقية باقتك إلى <strong className="text-amber-500 px-1">{TIER_LABELS[minTier] || minTier}</strong> أو أعلى. استثمر في تطوير منظومتك القانونية اليوم.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
            <button 
              onClick={() => setUpgradeOpen(true)}
              className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-6 rounded-xl transition-colors cursor-pointer"
            >
              الترقية الآن
            </button>
            <Link 
              href="/dashboard/business" 
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white font-medium py-3 px-6 rounded-xl transition-colors"
            >
              <ArrowLeft size={18} />
              العودة للوحة
            </Link>
          </div>

          {isDemo && (
            <div className="mt-8 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs text-right">
              <strong>ملاحظة (وضع الديمو):</strong> يمكنك تغيير باقتك من إعدادات حساب الديمو أو تسجيل الدخول بحساب شركة أعلى.
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
}
