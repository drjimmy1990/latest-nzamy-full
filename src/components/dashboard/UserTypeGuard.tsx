"use client";

import { useUser, type UserType } from "@/hooks/useUser";
import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { ShieldWarning, ArrowLeft } from "@phosphor-icons/react";
import { motion } from "framer-motion";

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

  // Admins can bypass type guards
  const isAllowed = allowedTypes.includes(userSession.userType) || userSession.userType === "admin";

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
