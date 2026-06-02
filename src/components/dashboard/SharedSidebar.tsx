"use client";

/**
 * SharedSidebar — Universal sidebar component for all 6 dashboard types
 * ─────────────────────────────────────────────────────────────────────
 * Accepts a SidebarGroup[] config from navigation.ts and renders
 * a fully interactive, collapsible, RTL-aware sidebar.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { X, List, Bell } from "@phosphor-icons/react";

import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { useClientGroupMembership } from "@/hooks/useClientGroupMembership";
import { getSidebarByUserType, getRoleLabel } from "@/constants/navigation";
import { SidebarFeatureRequest } from "@/components/FeatureRequestBanner";
import HijriDateWidget from "@/components/HijriDateWidget";
import UpgradeModal from "@/components/UpgradeModal";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";

import {
  inferUserTypeFromPath,
  SidebarSection,
  CreditsBar,
  DashboardModeToggle
} from "./SidebarComponents";

export default function SharedSidebar() {
  const { isDark, lang } = useTheme();
  const {
    userType: sessionUserType, subRole, name, credits, creditsMax,
    dashboardMode, active_roles, governmentRole, businessRole,
    affiliation, isDemoBypass, country
  } = useUser();
  
  const pathname = usePathname() ?? "/";
  const isAr = lang === "ar";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [featureBlocked, setFeatureBlocked] = useState<string | undefined>();
  const { hasGroup: hasClientGroup } = useClientGroupMembership();
  
  const [mode, setMode] = useState<"light" | "full">(dashboardMode);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("nzamy_dashboard_mode");
      if (saved === "light" || saved === "full") setMode(saved);
    } catch {}
  }, []);

  function handleModeChange(m: "light" | "full") {
    setMode(m);
    try { localStorage.setItem("nzamy_dashboard_mode", m); } catch {}
  }

  // Infer user type from URL path first — session userType is fallback.
  const pathUserType = inferUserTypeFromPath(pathname);
  const userType = pathUserType ?? sessionUserType;

  const groups = getSidebarByUserType(
    userType, mode, subRole, active_roles ?? [],
    governmentRole, businessRole, affiliation?.role, isDemoBypass, country
  );
  
  const showModeToggle = userType === "lawyer" || userType === "firm";
  const showCredits = false; // user requested to remove any mention of credits

  // Close on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  if (!groups.length) return null;

  const sidebarContent = (
    <div className="flex flex-col h-full overflow-hidden">

      {/* User header */}
      <div className={`px-4 pt-5 pb-4 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
        {/* Date chip — above name with breathing room */}
        <div className="mb-3">
          <HijriDateWidget />
        </div>
        <div className="flex items-center gap-3">
          <Link href="/settings" className="flex items-center gap-3 flex-1 group hover:opacity-80 transition-opacity">
            <div className="w-9 h-9 rounded-xl bg-royal flex items-center justify-center text-white text-sm font-bold flex-shrink-0 group-hover:scale-105 transition-transform">
              {name?.charAt(0) ?? "م"}
            </div>
            <div className="min-w-0">
              <p className={`text-sm font-bold truncate ${isDark ? "text-white" : "text-slate-800"}`}>{name}</p>
              <p className={`text-[11px] truncate ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                {/* Show multi-role badge if active_roles exist */}
                {active_roles && active_roles.length > 0
                  ? (<span className="text-[#C8A762]">
                      {active_roles.map(r =>
                        r === "notary"     ? "موثّق" :
                        r === "bailiff"    ? "معقّب" :
                        r === "arbitrator" ? "محكّم" : r
                      ).join(" + ")}
                      {" • "}
                      {userType ? (isAr ? `إعدادات ${getRoleLabel(userType, true)}` : `${getRoleLabel(userType, false)} Settings`) : ""}
                    </span>)
                  : userType ? (isAr ? `إعدادات ${getRoleLabel(userType, true)}` : `${getRoleLabel(userType, false)} Settings`) : ""
                }
              </p>
            </div>
          </Link>
          <button
            className="lg:hidden ms-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Mode toggle (lawyer/firm only) */}
      {showModeToggle && (
        <div className="pt-3">
          <DashboardModeToggle isAr={isAr} mode={mode} onModeChange={handleModeChange} />
        </div>
      )}

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto py-3 px-2 scrollbar-thin">
        {groups.map((group, i) => (
          <SidebarSection
            key={i}
            group={group}
            pathname={pathname}
            isAr={isAr}
            groupIndex={i}
            hasClientGroup={hasClientGroup}
            onLockedClick={(feature) => {
              setFeatureBlocked(feature);
              setUpgradeOpen(true);
            }}
          />
        ))}
      </div>

      {/* Credits bar */}
      {showCredits && (
        <CreditsBar credits={credits} creditsMax={creditsMax} isAr={isAr} />
      )}

      {/* Global Search — always visible above Feature Request */}
      <GlobalSearch />

      {/* Feature Request widget — above settings divider */}
      <SidebarFeatureRequest />

    </div>
  );

  // Derive the correct dashboard root path for logo link
  const dashboardRoot = userType === "lawyer" ? "/dashboard/lawyer"
    : userType === "firm" ? "/dashboard/firm"
    : userType === "corporate" ? "/dashboard/business"
    : userType === "micro" ? "/dashboard/micro"
    : userType === "provider" ? "/dashboard/provider"
    : userType === "admin" ? "/dashboard/admin"
    : userType === "government" ? "/dashboard/government"
    : userType === "ngo" ? "/dashboard/ngo"
    : "/dashboard/client";

  return (
    <>
      {/* Mobile Top Header */}
      <header
        className={`
          lg:hidden fixed top-0 right-0 left-0 z-[45] h-[60px]
          flex items-center justify-between px-4
          ${isDark
            ? "bg-zinc-950 border-b border-white/[0.06] shadow-sm"
            : "bg-white border-b border-slate-100 shadow-sm"
          }
        `}
        dir="rtl"
      >
        {/* Logo */}
        <Link href={dashboardRoot} className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-xl bg-[#0B3D2E] flex items-center justify-center group-hover:scale-105 transition-transform">
            <span
              className="text-[#C8A762] font-bold text-sm leading-none"
              style={{ fontFamily: "var(--font-brand, serif)" }}
            >
              ن
            </span>
          </div>
          <span className={`font-bold text-sm tracking-tight ${isDark ? "text-white" : "text-slate-800"}`}>
            نظامي
          </span>
        </Link>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Notifications */}
          <Link
            href="/notifications"
            aria-label={isAr ? "الإشعارات" : "Notifications"}
            className={`p-2 rounded-xl transition-colors ${
              isDark
                ? "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Bell size={20} weight="duotone" />
          </Link>

          {/* Hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            aria-label={isAr ? "القائمة الرئيسية" : "Main menu"}
            className={`p-2 rounded-xl transition-colors ${
              isDark
                ? "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            }`}
          >
            <List size={22} weight="bold" />
          </button>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside
        className={`
          hidden lg:flex flex-col w-64 fixed top-0 bottom-0 ${isAr ? "right-0" : "left-0"} z-40
          border-${isAr ? "l" : "r"} pt-[76px]
          ${isDark
            ? "bg-zinc-950 border-white/[0.06]"
            : "bg-white border-slate-100 shadow-[2px_0_20px_-8px_rgba(0,0,0,0.06)]"
          }
        `}
        dir="rtl"
      >
        {sidebarContent}
      </aside>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-[46] bg-black/50 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: isAr ? "100%" : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: isAr ? "100%" : "-100%" }}
              transition={{ type: "spring", stiffness: 280, damping: 30 }}
              className={`
                lg:hidden fixed top-0 bottom-0 ${isAr ? "right-0" : "left-0"} z-[47] w-72
                ${isDark ? "bg-zinc-950" : "bg-white"}
                shadow-2xl
              `}
              dir="rtl"
            >
              <div className="h-full pt-2">
                {sidebarContent}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        featureBlocked={featureBlocked}
      />
    </>
  );
}
