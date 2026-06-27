"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ShieldWarning } from "@phosphor-icons/react";
import { useUser, type AffiliationRole, type BusinessRole } from "@/hooks/useUser";
import { getBusinessRouteDecision, getFirmRouteDecision } from "@/constants/entityRouteAccess";

type EntityRouteGuardProps = {
  scope: "business" | "firm";
  children: React.ReactNode;
};

const ROLE_LABELS: Record<string, string> = {
  owner: "مالك الشركة",
  legal_manager: "مدير الشؤون القانونية",
  legal_staff: "أخصائي قانوني",
  compliance_officer: "مسؤول امتثال",
  seconded: "مستشار منتدب",
  department_head: "مدير قسم",
  hr_manager: "مدير موارد بشرية",
  finance_manager: "مدير مالي",
  employee: "موظف عام",
  managing_partner: "شريك مدير",
  partner: "شريك",
  senior_lawyer: "محام أول",
  lawyer: "محام",
  trainee: "متدرب",
  legal_secretary: "سكرتير قانوني",
  office_admin: "مدير مكتب",
  compliance_manager: "مدير امتثال ومخاطر",
  external_of_counsel: "مستشار خارجي Of Counsel",
  legal_consultant: "مستشار قانوني",
  in_house_counsel: "مستشار داخلي",
};

function formatRoles(roles?: readonly string[]): string {
  if (!roles?.length) return "أدوار محددة";
  return roles.map((role) => ROLE_LABELS[role] ?? role).join("، ");
}

export function EntityRouteGuard({ scope, children }: EntityRouteGuardProps) {
  const pathname = usePathname() ?? "/";


  const user = useUser();

  if (user.loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-white animate-spin" />
      </div>
    );
  }

  if (user.userType === "admin") return <>{children}</>;

  const businessRole = user.businessRole;
  const firmRole = user.affiliation?.entityType === "firm" ? user.affiliation.role : undefined;

  const decision =
    scope === "business"
      ? getBusinessRouteDecision(pathname, businessRole)
      : getFirmRouteDecision(pathname, firmRole);

  if (decision.allowed) return <>{children}</>;

  const dashboardHref = scope === "business" ? "/dashboard/business" : "/dashboard/firm";
  const currentRoleId = (scope === "business" ? businessRole : firmRole) as BusinessRole | AffiliationRole | undefined;
  const currentRole = currentRoleId ? ROLE_LABELS[currentRoleId] ?? currentRoleId : "غير محدد";

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4" dir="rtl">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex w-full max-w-lg flex-col items-center rounded-2xl border border-red-500/20 bg-red-950/20 p-8 text-center"
      >
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 text-red-500">
          <ShieldWarning size={40} weight="duotone" />
        </div>
        <h2 className="mb-3 text-2xl font-bold text-white">صلاحيات غير كافية</h2>
        <p className="mb-4 leading-7 text-zinc-400">
          هذه الصفحة مخصصة لـ <strong className="px-1 text-red-300">{decision.label}</strong>، ودورك الحالي هو{" "}
          <strong className="px-1 text-red-300">{currentRole}</strong>.
        </p>
        <p className="mb-8 text-sm leading-7 text-zinc-500">
          الأدوار المسموح لها: {formatRoles(decision.allowedRoles)}. هذا منع واجهة محلي وجاهز للربط بالباك إند.
        </p>
        <Link
          href={dashboardHref}
          className="flex items-center justify-center gap-2 rounded-xl bg-white/5 px-8 py-3 font-medium text-white transition-colors hover:bg-white/10"
        >
          <ArrowLeft size={18} />
          العودة للوحة المناسبة
        </Link>
      </motion.div>
    </div>
  );
}
