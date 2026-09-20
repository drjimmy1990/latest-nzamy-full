"use client";

import { useUser, type UserType } from "@/hooks/useUser";
import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { ShieldWarning, ArrowLeft } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { isAllowedByTypeOrMembership } from "@/lib/auth/entityMembership";

export function UserTypeGuard({
  allowedTypes,
  children,
}: {
  allowedTypes: UserType[];
  children: ReactNode;
}) {
  const userSession = useUser();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || userSession.loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-white animate-spin" />
      </div>
    );
  }

  // A signed-in account whose `profiles` row is absent or typeless is not
  // "the wrong account type" — it is an INCOMPLETE PROFILE, and telling that
  // user they lack permissions (as this component did once useUser demoted them
  // to "individual") is the UAT-LIVE-AI-001 complaint. useUser now reports the
  // state instead of guessing a type; this is the screen for it. Guests are not
  // this case and fall through to the refusal/permission logic below —
  // `profileState` is undefined for them by construction (see ProfileState).
  if (userSession.isLoggedIn && userSession.profileState === "missing") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4" dir="rtl">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-amber-950/20 border border-amber-500/20 rounded-2xl p-8 text-center flex flex-col items-center"
        >
          <div className="w-20 h-20 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mb-6">
            <ShieldWarning size={40} weight="duotone" />
          </div>

          <h2 className="text-2xl font-bold text-white mb-3">ملفك غير مكتمل</h2>
          <p className="text-zinc-400 mb-8 leading-relaxed">
            أكمل بيانات حسابك للمتابعة
          </p>

          <Link
            href="/onboarding"
            className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white font-medium py-3 px-8 rounded-xl transition-colors"
          >
            <ArrowLeft size={18} />
            إكمال بيانات الحساب
          </Link>
        </motion.div>
      </div>
    );
  }

  const isAllowed = isAllowedByTypeOrMembership(
    userSession.userType,
    allowedTypes,
    {
      ...(userSession.firmMembership ? { firm: userSession.firmMembership } : {}),
      ...(userSession.businessMembership ? { business: userSession.businessMembership } : {}),
    },
  );

  if (!isAllowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4" dir="rtl">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-red-950/20 border border-red-500/20 rounded-2xl p-8 text-center flex flex-col items-center"
        >
          <div className="w-20 h-20 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-6">
            <ShieldWarning size={40} weight="duotone" />
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-3">صلاحيات غير كافية</h2>
          <p className="text-zinc-400 mb-8 leading-relaxed">
            عفواً، لا تملك الصلاحيات اللازمة للوصول إلى هذه الصفحة. واجهتك مخصصة لنوع حساب مختلف.
          </p>
          
          <Link 
            href="/" 
            className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white font-medium py-3 px-8 rounded-xl transition-colors"
          >
            <ArrowLeft size={18} />
            العودة للرئيسية
          </Link>
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
}
