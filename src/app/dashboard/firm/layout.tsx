"use client";

import { useState, useEffect } from "react";
import SharedSidebar from "@/components/dashboard/SharedSidebar";
import { EntityRouteGuard } from "@/components/dashboard/EntityRouteGuard";
import { useTheme } from "@/components/ThemeProvider";
import { useUser, setDemoSession } from "@/hooks/useUser";
import { isDemoUiEnabled } from "@/lib/runtimeMode";
import { UserCircle, ArrowDown } from "@phosphor-icons/react";
import { UserTypeGuard } from "@/components/dashboard/UserTypeGuard";
import type { FirmRole } from "@/types/firmBackendReady";
import { FIRM_ROLES, FirmRoleContext } from "./firmRoleContext";

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
  // Demo role switcher — never for real (supabase) firm users, even unaffiliated.
  const canDemoSwitchRole =
    isDemoUiEnabled &&
    (user.userType === "admin" ||
      !user.affiliation ||
      user.affiliation.role === "managing_partner" ||
      user.affiliation.role === "partner");

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

        <div className="print-main lg:mr-64 pt-[calc(env(safe-area-inset-top)+60px)] lg:pt-0 min-h-[100dvh]">
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
        </div>

              </div>
    </FirmRoleContext.Provider>
    </UserTypeGuard>
  );
}
