"use client";

import { useUser } from "@/hooks/useUser";
import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { ShieldWarning, ArrowLeft } from "@phosphor-icons/react";
import { motion } from "framer-motion";

export function RoleGuard({
  allowedRoles,
  blockedRoles,
  children,
}: {
  allowedRoles?: string[];
  blockedRoles?: string[];
  children: ReactNode;
}) {
  const userSession = useUser();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null; // Avoid hydration mismatch on initial render

  const userRole = (userSession?.businessRole || userSession?.affiliation?.role || userSession?.subRole || userSession?.governmentRole) as string;
  
  // Logic: 
  // 1. If blockedRoles is provided and user is in it, they are blocked.
  // 2. If allowedRoles is provided and user is NOT in it, they are blocked.
  // 3. Otherwise, they are allowed.
  let isAllowed = true;
  if (userRole) {
    if (blockedRoles && blockedRoles.includes(userRole)) {
      isAllowed = false;
    }
    if (allowedRoles && !allowedRoles.includes(userRole)) {
      isAllowed = false;
    }
  } else if (allowedRoles) {
    isAllowed = false; // no role but allowedRoles is specified
  }

  // Admin can bypass local UI guards. Entity managers must still be listed in
  // allowedRoles so finance/HR/legal-only pages stay honest during beta.
  const isAdmin = userSession?.userType === "admin";

  if (!isAllowed && !isAdmin) {
    const ROLE_LABELS: Record<string, string> = {
      owner: "المالك",
      legal_manager: "المدير القانوني",
      department_head: "مدير الإدارة",
      legal_staff: "المستشار القانوني الداخلي",
      hr_manager: "مدير الموارد البشرية",
      finance_manager: "المدير المالي",
      employee: "موظف عام",
      seconded: "مستشار منتدب",
      managing_partner: "الشريك المدير",
      partner: "شريك",
      senior_lawyer: "محام أول",
      lawyer: "محام",
      trainee: "متدرب",
      legal_secretary: "سكرتير قانوني",
      office_admin: "مدير مكتب",
      compliance_manager: "مدير امتثال ومخاطر",
      external_of_counsel: "مستشار خارجي Of Counsel",
    };

    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
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
            عفواً، لا تملك الصلاحيات اللازمة للوصول إلى هذه الصفحة. دورك الحالي مسجل كـ <strong className="text-red-400 px-1">{ROLE_LABELS[userRole] || userRole}</strong>.
          </p>
          
          <Link 
            href={userSession.userType === "firm" ? "/dashboard/firm" : "/dashboard/business"} 
            className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white font-medium py-3 px-8 rounded-xl transition-colors"
          >
            <ArrowLeft size={18} />
            العودة للوحة التحكم
          </Link>
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
}
