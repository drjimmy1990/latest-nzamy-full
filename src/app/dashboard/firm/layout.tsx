"use client";

import { useState, useEffect, createContext, useContext } from "react";
import SharedSidebar from "@/components/dashboard/SharedSidebar";
import FloatingButtons from "@/components/FloatingButtons";
import { EntityRouteGuard } from "@/components/dashboard/EntityRouteGuard";
import { useTheme } from "@/components/ThemeProvider";
import { useUser, setDemoSession } from "@/hooks/useUser";
import { Scales, UsersThree, UserCircle, ArrowDown, ShieldCheck, PenNib } from "@phosphor-icons/react";
import { UserTypeGuard } from "@/components/dashboard/UserTypeGuard";
import type { FirmRole } from "@/types/firmBackendReady";

// ─── RBAC Types ──────────────────────────────────────────────────────────────
export type { FirmRole };

export interface FirmRoleConfig {
  role: FirmRole;
  labelAr: string;
  labelEn: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  /** Which sections this role can SEE */
  can: {
    viewFinancials: boolean;
    viewAllCases: boolean;
    viewTeam: boolean;
    viewAnalytics: boolean;
    addNewCase: boolean;
    manageClients: boolean;
  };
}

export const FIRM_ROLES: FirmRoleConfig[] = [
  {
    role: "managing_partner",
    labelAr: "الشريك المدير",
    labelEn: "Managing Partner",
    icon: Scales,
    color: "text-[#C8A762]",
    bg: "bg-[#C8A762]/10",
    can: {
      viewFinancials: true,
      viewAllCases: true,
      viewTeam: true,
      viewAnalytics: true,
      addNewCase: true,
      manageClients: true,
    },
  },
  {
    role: "partner",
    labelAr: "شريك",
    labelEn: "Partner",
    icon: Scales,
    color: "text-[#C8A762]",
    bg: "bg-[#C8A762]/10",
    can: {
      viewFinancials: false,
      viewAllCases: true,
      viewTeam: true,
      viewAnalytics: true,
      addNewCase: true,
      manageClients: true,
    },
  },
  {
    role: "senior_lawyer",
    labelAr: "محامي أول",
    labelEn: "Senior Lawyer",
    icon: UsersThree,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    can: {
      viewFinancials: true,
      viewAllCases: true,
      viewTeam: true,
      viewAnalytics: true,
      addNewCase: true,
      manageClients: true,
    },
  },
  {
    role: "lawyer",
    labelAr: "محامي",
    labelEn: "Lawyer",
    icon: UserCircle,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    can: {
      viewFinancials: false,
      viewAllCases: false,
      viewTeam: false,
      viewAnalytics: false,
      addNewCase: true,
      manageClients: true,
    },
  },
  {
    role: "trainee",
    labelAr: "متدرب",
    labelEn: "Trainee",
    icon: PenNib,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    can: {
      viewFinancials: false,
      viewAllCases: false, // Own cases only
      viewTeam: false,
      viewAnalytics: false,
      addNewCase: false,
      manageClients: false,
    },
  },
  {
    role: "legal_secretary",
    labelAr: "سكرتير قانوني",
    labelEn: "Legal Secretary",
    icon: ShieldCheck,
    color: "text-pink-500",
    bg: "bg-pink-500/10",
    can: {
      viewFinancials: false,
      viewAllCases: true,
      viewTeam: false,
      viewAnalytics: false,
      addNewCase: false,
      manageClients: true,
    },
  },
  {
    role: "office_admin",
    labelAr: "مدير مكتب",
    labelEn: "Office Admin",
    icon: ShieldCheck,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    can: {
      viewFinancials: false,
      viewAllCases: true,
      viewTeam: true,
      viewAnalytics: false,
      addNewCase: false,
      manageClients: true,
    },
  },
  {
    role: "finance_manager",
    labelAr: "مدير مالي",
    labelEn: "Finance Manager",
    icon: ShieldCheck,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    can: {
      viewFinancials: true,
      viewAllCases: false,
      viewTeam: false,
      viewAnalytics: true,
      addNewCase: false,
      manageClients: false,
    },
  },
  {
    role: "hr_manager",
    labelAr: "مدير موارد بشرية",
    labelEn: "HR Manager",
    icon: UsersThree,
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
    can: {
      viewFinancials: false,
      viewAllCases: false,
      viewTeam: true,
      viewAnalytics: true,
      addNewCase: false,
      manageClients: false,
    },
  },
  {
    role: "compliance_manager",
    labelAr: "مدير امتثال ومخاطر",
    labelEn: "Compliance Manager",
    icon: ShieldCheck,
    color: "text-red-500",
    bg: "bg-red-500/10",
    can: {
      viewFinancials: false,
      viewAllCases: true,
      viewTeam: true,
      viewAnalytics: true,
      addNewCase: false,
      manageClients: false,
    },
  },
  {
    role: "external_of_counsel",
    labelAr: "مستشار خارجي Of Counsel",
    labelEn: "External Of Counsel",
    icon: UserCircle,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    can: {
      viewFinancials: false,
      viewAllCases: false,
      viewTeam: false,
      viewAnalytics: false,
      addNewCase: false,
      manageClients: false,
    },
  },
  {
    role: "legal_consultant",
    labelAr: "مستشار قانوني",
    labelEn: "Legal Consultant",
    icon: UserCircle,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    can: {
      viewFinancials: false,
      viewAllCases: true,
      viewTeam: false,
      viewAnalytics: false,
      addNewCase: true,
      manageClients: true,
    },
  },
  {
    role: "in_house_counsel",
    labelAr: "مستشار قانوني داخلي",
    labelEn: "In-House Counsel",
    icon: UserCircle,
    color: "text-teal-500",
    bg: "bg-teal-500/10",
    can: {
      viewFinancials: false,
      viewAllCases: true,
      viewTeam: false,
      viewAnalytics: false,
      addNewCase: true,
      manageClients: true,
    },
  },
];

// ─── RBAC Context ─────────────────────────────────────────────────────────────
export const FirmRoleContext = createContext<FirmRoleConfig>(FIRM_ROLES[0]);
export const useFirmRole = () => useContext(FirmRoleContext);

function getSessionFirmRole(role?: string | null): FirmRole {
  return FIRM_ROLES.some((r) => r.role === role) ? (role as FirmRole) : "managing_partner";
}

/**
 * Law Firm Dashboard Layout — /dashboard/firm
 *
 * RBAC switcher: مدير المكتب / محامي أول / مساعد
 * Each role controls which sections & KPIs are visible via FirmRoleContext.
 */
export default function FirmDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useUser();
  const sessionRole = getSessionFirmRole(user.affiliation?.entityType === "firm" ? user.affiliation.role : null);
  const [activeRole, setActiveRole] = useState<FirmRole>(sessionRole);
  const [open, setOpen] = useState(false);
  const { isDark, lang } = useTheme();
  const isAr = lang === "ar";
  const canDemoSwitchRole =
    user.userType === "admin" ||
    !user.affiliation ||
    user.affiliation.role === "managing_partner" ||
    user.affiliation.role === "partner";

  // [U6] Stamp last_dashboard so AI layout can infer correct sidebar
  useEffect(() => {
    try { localStorage.setItem("nzamy_last_dashboard", "firm"); } catch {}
  }, []);

  useEffect(() => {
    setActiveRole(sessionRole);
  }, [sessionRole]);

  const roleConfig = FIRM_ROLES.find((r) => r.role === activeRole)!;
  const RoleIcon = roleConfig.icon;

  return (
    <UserTypeGuard allowedTypes={["firm", "admin"]}>
      <FirmRoleContext.Provider value={roleConfig}>
        <div className="min-h-[100dvh] bg-surface dark:bg-dark-bg" dir={isAr ? "rtl" : "ltr"} suppressHydrationWarning>
        <SharedSidebar />

        <main className="lg:mr-64 pt-[60px] lg:pt-0 min-h-[100dvh]">
          {/* ── Role Switcher Bar ── */}
          <div className={`flex items-center justify-between px-4 md:px-6 pt-4 pb-0`}>
            {/* Role selector dropdown */}
            <div className="relative">
              {canDemoSwitchRole ? (
                <button
                  onClick={() => setOpen((p) => !p)}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${
                    isDark
                      ? "border-white/[0.08] bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm"
                  }`}
                >
                  <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${roleConfig.bg}`}>
                    <RoleIcon size={13} weight="duotone" className={roleConfig.color} />
                  </span>
                  <span>{isAr ? roleConfig.labelAr : roleConfig.labelEn}</span>
                  <ArrowDown size={12} className={`opacity-50 transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
              ) : (
                <div
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-xs font-bold ${
                    isDark
                      ? "border-white/[0.08] bg-zinc-900 text-zinc-200"
                      : "border-slate-200 bg-white text-slate-700 shadow-sm"
                  }`}
                >
                  <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${roleConfig.bg}`}>
                    <RoleIcon size={13} weight="duotone" className={roleConfig.color} />
                  </span>
                  <span>{isAr ? roleConfig.labelAr : roleConfig.labelEn}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${isDark ? "bg-white/[0.04] text-zinc-500" : "bg-slate-100 text-slate-500"}`}>
                    {isAr ? "دور حسابك" : "Your role"}
                  </span>
                </div>
              )}

              {/* Dropdown */}
              {open && canDemoSwitchRole && (
                <div className={`absolute top-full mt-1 ${isAr ? "right-0" : "left-0"} z-50 min-w-[200px] rounded-2xl border shadow-xl ${
                  isDark ? "bg-zinc-900 border-white/[0.08]" : "bg-white border-slate-200"
                }`}>
                  <div className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider border-b ${isDark ? "text-zinc-600 border-white/[0.06]" : "text-slate-400 border-slate-100"}`}>
                    {isAr ? "تغيير الدور (تجريبي)" : "Switch Role (Demo)"}
                  </div>
                  {FIRM_ROLES.map((r) => {
                    const Icon = r.icon;
                    const isActive = r.role === activeRole;
                    return (
                      <button
                        key={r.role}
                        onClick={() => {
                          setActiveRole(r.role);
                          setOpen(false);
                          
                          // Propagate role changes to faked user session
                          const updatedSession = {
                            ...user,
                            affiliation: {
                              ...user.affiliation,
                              role: r.role,
                            }
                          };
                          delete (updatedSession as any).isDemoBypass;
                          const currentDemoKey = localStorage.getItem("nzamy_demo_key") || "firm";
                          setDemoSession(updatedSession as any, currentDemoKey);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-start transition-colors ${
                          isActive
                            ? isDark ? "bg-royal/15 text-emerald-400" : "bg-royal/8 text-royal"
                            : isDark ? "text-zinc-300 hover:bg-white/[0.04]" : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${r.bg}`}>
                          <Icon size={14} weight="duotone" className={r.color} />
                        </span>
                        <div>
                          <div className="text-[12px] font-bold">{isAr ? r.labelAr : r.labelEn}</div>
                          <div className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                            {isAr
                              ? r.can.viewFinancials ? "يرى الماليات والتحليلات" : r.can.viewAllCases ? "يرى كل القضايا" : "يرى قضاياه فقط"
                              : r.can.viewFinancials ? "Views financials & analytics" : r.can.viewAllCases ? "Views all cases" : "Views own cases only"
                            }
                          </div>
                        </div>
                        {isActive && (
                          <span className={`ms-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isDark ? "bg-royal/20 text-emerald-400" : "bg-royal/8 text-royal"}`}>
                            {isAr ? "نشط" : "Active"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Access summary badge */}
            <div className={`hidden sm:flex items-center gap-4 text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
              {[
                { label: isAr ? "الماليات" : "Financials", allowed: roleConfig.can.viewFinancials },
                { label: isAr ? "كل القضايا" : "All Cases", allowed: roleConfig.can.viewAllCases },
                { label: isAr ? "التحليلات" : "Analytics",  allowed: roleConfig.can.viewAnalytics },
                { label: isAr ? "إضافة قضية" : "Add Case",  allowed: roleConfig.can.addNewCase },
              ].map((p) => (
                <span
                  key={p.label}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${
                    p.allowed
                      ? isDark ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-400" : "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : isDark ? "border-white/[0.05] bg-white/[0.02] text-zinc-600" : "border-slate-200 bg-slate-50 text-slate-400 opacity-60"
                  }`}
                >
                  {p.allowed ? "✓" : "✕"} {p.label}
                </span>
              ))}
            </div>
          </div>

          <div className="p-4 md:p-6 pt-4" onClick={() => open && setOpen(false)}>
            <EntityRouteGuard scope="firm">
              {children}
            </EntityRouteGuard>
          </div>
        </main>

        <FloatingButtons />
      </div>
    </FirmRoleContext.Provider>
    </UserTypeGuard>
  );
}
