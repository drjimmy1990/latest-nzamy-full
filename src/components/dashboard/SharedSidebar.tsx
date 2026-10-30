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
import Image from "next/image";
import { X, List, Bell, SignOut } from "@phosphor-icons/react";

import { useTheme } from "@/components/ThemeProvider";
import { useUser, logout } from "@/hooks/useUser";
import { useAdminSettings } from "@/hooks/useAdminSettings";
import { useClientGroupMembership } from "@/hooks/useClientGroupMembership";
import { getSidebarByUserType, getRoleLabel } from "@/constants/navigation";
import { SidebarFeatureRequest } from "@/components/FeatureRequestBanner";
import HijriDateWidget from "@/components/HijriDateWidget";
import UpgradeModal from "@/components/UpgradeModal";
import { GlobalSearch } from "@/components/dashboard/GlobalSearch";
import { isSharedClientIntakePath } from "@/lib/auth/routeAccess";
import { QuickAddSidebarItem } from "@/components/dashboard/quickAdd/QuickAdd";
import { AdminViewSwitch } from "@/components/dashboard/AdminViewSwitch";
import { useAdminView } from "@/hooks/useAdminView";
import { resolveNavUserType, adminViewSuffix } from "@/lib/nav/shellContext";

import {
  SidebarSection,
  CreditsBar,
} from "./SidebarComponents";

export default function SharedSidebar() {
  const { isDark, lang } = useTheme();
  const {
    userType: sessionUserType, subRole, name, credits, creditsMax,
    active_roles, governmentRole, businessRole,
    affiliation, businessMembership, isDemoBypass, country, loading, isLoggedIn,
    practiceKind, staffRole,
  } = useUser();

  // Whether the two inputs `useSubscription().can()` reads have settled.
  //
  // Until they have, `can()` answers from a guest session (tier `free`) and an
  // empty feature store — so a sidebar item would be painted locked, dimmed and
  // wearing an upgrade badge for a user who in fact owns it, then quietly
  // unlock a moment later. `loading` covers the session tier; `mounted` covers
  // the per-entity feature flags, which `can()` skips entirely while false.
  // Both are existing state; neither reached the sidebar items before, which is
  // why the flash was there. Threaded down as a prop rather than read again per
  // item: every SidebarLink already builds its own copy of both hooks.
  const { mounted: adminSettingsReady } = useAdminSettings();
  const gateReady = !loading && adminSettingsReady;

  const pathname = usePathname() ?? "/";
  const isAr = lang === "ar";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [featureBlocked, setFeatureBlocked] = useState<string | undefined>();
  const { hasGroup: hasClientGroup } = useClientGroupMembership();
  
  // Owner ٢٦٤ (2026-10-25): the lite / full toggle is gone for good —
  // the sidebar is always the full list. The old pre-Phase-6 localStorage key
  // is cleared if a browser still holds it; nothing reads it. A stale
  // "light" in preferences / display_mode is ignored by getSidebarByUserType.
  useEffect(() => {
    try { localStorage.removeItem("nzamy_dashboard_mode"); } catch {}
  }, []);

  // Which menu to draw — decided by resolveNavUserType (src/lib/nav/
  // shellContext.ts), the one resolver every shell asks. Path first, then the
  // session. For an admin, off /dashboard/<role>/ it is the admin's VIEW
  // context (owner LIVE-F01): the old "path, else the real role" rule drew
  // the ADMIN sidebar on every /ai/* tool an admin opened in lawyer mode.
  // A menu only — guards and the server keep reading the real role.
  const isRealAdmin = !loading && sessionUserType === "admin";
  const { storedView } = useAdminView(pathname, isRealAdmin);
  const isBusinessIntake =
    isSharedClientIntakePath(pathname) &&
    (sessionUserType === "corporate" || !!businessMembership);
  const userType = resolveNavUserType({ pathname, sessionUserType, storedView, isBusinessIntake });
  const viewSuffix = adminViewSuffix(sessionUserType, userType, isAr);
  const roleLabel = viewSuffix
    ? `${getRoleLabel("admin", isAr)} · ${viewSuffix}`
    : userType ? getRoleLabel(userType, isAr) : "";

  // practiceKind (Art. 18): a consultant's sidebar has no pleading or hearings tools.
  // staffRole (owner ٢١٠): an admin sees only the tools of their staff role.
  const groups = getSidebarByUserType(
    userType, "full", subRole, active_roles ?? [],
    governmentRole, businessRole, affiliation?.role, isDemoBypass, country, practiceKind, staffRole
  );
  
  const showCredits = false; // user requested to remove any mention of credits

  // Close on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  if (!groups.length) return null;

  const sidebarContent = (
    <div className="flex min-h-0 flex-col h-full overflow-hidden">

      {/* User header */}
      <div className={`px-4 py-3 border-b ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
        {/* Date chip — above name with breathing room */}
        <div className="mb-1.5 text-[11px] leading-none">
          <HijriDateWidget />
        </div>
        <div className="flex items-center gap-3">
          <Link href="/settings" className="flex items-center gap-3 flex-1 group hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-xl bg-royal flex items-center justify-center text-white text-xs font-bold flex-shrink-0 group-hover:scale-105 transition-transform">
              {(name || "م").charAt(0)}
            </div>
            <div className="min-w-0">
              <p className={`text-sm font-bold truncate ${isDark ? "text-white" : "text-slate-800"}`}>{name || "مستخدم"}</p>
              <p className={`text-[11px] truncate ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                {/* Show multi-role badge if active_roles exist */}
                {/* Role label only — the explicit "الإعدادات" nav item below is the
                    single Settings entry point; repeating the word here read as
                    a duplicate "Settings" link to users. */}
                {active_roles && active_roles.length > 0
                  ? (<span className="text-[#C8A762]">
                      {active_roles.map(r =>
                        r === "notary"     ? "موثّق" :
                        r === "bailiff"    ? "معقّب" :
                        r === "arbitrator" ? "محكّم" : r
                      ).join(" + ")}
                      {" • "}
                      {roleLabel}
                    </span>)
                  : roleLabel
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

      {/* «عرض كـ» (owner NOTE-22-C02) — the admin's fixed view switch,
          outside the scrolling nav so it never scrolls away. Renders nothing
          unless the REAL role is admin; switching changes the menu only. */}
      {isRealAdmin && (
        <AdminViewSwitch current={userType === "admin" ? "admin" : "lawyer"} tone="auto" isAr={isAr} />
      )}

      {/* «+ إضافة سريعة» (N3.3) — renders only inside the lawyer/firm
          layouts' QuickAddProvider; every other dashboard is unchanged. */}
      <QuickAddSidebarItem onBeforeOpen={() => setMobileOpen(false)} />

      {/* Nav groups */}
      {/* `pb-8` is not decoration. This scroll region's bottom edge is flush
          against the pinned <GlobalSearch /> below it, which sits OUTSIDE the
          scroller — so the last nav row always came to rest sliced in half at
          that seam, and the owner read it as a search box overlapping the menu
          (shots 16, 18, 19, 21, 26). The padding lets the final item scroll
          clear of the boundary; the seam itself is drawn as a border on the
          search block so it reads as a divider rather than a cut. */}
      <div className="flex-1 min-h-0 overflow-y-auto py-2 pb-8 px-2 scrollbar-thin">
        {groups.map((group, i) => (
          <SidebarSection
            key={i}
            group={group}
            pathname={pathname}
            isAr={isAr}
            groupIndex={i}
            hasClientGroup={hasClientGroup}
            gateReady={gateReady}
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

      {/* Sign out. Until this row the only ways out of a dashboard were the
          public Navbar's avatar menu (not rendered on dashboard routes) and
          the Settings page. It calls the same logout() as both of them —
          Supabase signOut (or the demo reset) and the redirect to /login. */}
      {isLoggedIn && (
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => logout()}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal dark:focus-visible:ring-gold ${
              isDark
                ? "text-rose-400 hover:bg-rose-500/[0.08]"
                : "text-rose-600 hover:bg-rose-50"
            }`}
          >
            <SignOut size={16} />
            {isAr ? "تسجيل الخروج" : "Sign out"}
          </button>
        </div>
      )}

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
          lg:hidden fixed top-0 right-0 left-0 z-[45] min-h-[60px] safe-top
          flex items-center justify-between px-4
          ${isDark
            ? "bg-zinc-950 border-b border-white/[0.06] shadow-sm"
            : "bg-white border-b border-slate-100 shadow-sm"
          }
        `}
        dir="rtl"
      >
        {/* Logo — the real mark from /logo.png, drawn the same way the public
            navbar draws it (Navbar.tsx:344). This used to be a «ن» glyph in a
            coloured box: a stand-in for a logo the platform has always had. */}
        <Link href={dashboardRoot} className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center group-hover:scale-105 transition-transform">
            <Image
              src="/logo.png"
              alt="نظامي"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
            />
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
            className={`p-2 rounded-xl cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal dark:focus-visible:ring-gold ${
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
          ${isAr ? "border-l" : "border-r"}
          ${isDark
            ? "bg-zinc-950 border-white/[0.06]"
            : "bg-white border-slate-100 shadow-[2px_0_20px_-8px_rgba(0,0,0,0.06)]"
          }
        `}
        dir="rtl"
      >
        {/* Logo header — the `pt-[76px]` this used to sit under reserved the
            space but never drew anything into it, so the desktop rail (unlike
            the mobile top bar, which already carries /logo.png) had no brand
            mark in frame at all (note ٢٠٩). Fills that reserved 76px instead
            of leaving it blank. */}
        <Link
          href={dashboardRoot}
          className={`flex items-center gap-2.5 px-4 h-14 flex-shrink-0 border-b group ${
            isDark ? "border-white/[0.06]" : "border-slate-100"
          }`}
        >
          <div className="w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center group-hover:scale-105 transition-transform">
            <Image src="/logo.png" alt="نظامي" width={32} height={32} className="h-8 w-8 object-contain" />
          </div>
          <span className={`font-bold text-sm tracking-tight ${isDark ? "text-white" : "text-slate-800"}`}>
            نظامي
          </span>
        </Link>
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
