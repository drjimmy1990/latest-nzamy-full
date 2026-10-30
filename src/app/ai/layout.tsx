"use client";

import { usePathname } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { useAdminView } from "@/hooks/useAdminView";
import { resolveAiShell } from "@/lib/nav/shellContext";
import AILoading from "./loading";
import BusinessDashboardLayout from "@/app/dashboard/business/layout";
import ClientDashboardLayout from "@/app/dashboard/client/layout";
import LawyerDashboardLayout from "@/app/dashboard/lawyer/layout";
import GovernmentDashboardLayout from "@/app/dashboard/government/layout";
import NGODashboardLayout from "@/app/dashboard/ngo/layout";
import FirmDashboardLayout from "@/app/dashboard/firm/layout";
import MicroDashboardLayout from "@/app/dashboard/micro/layout";
import ProviderDashboardLayout from "@/app/dashboard/provider/layout";

/**
 * AI Layout — wraps /ai/* pages with the correct dashboard sidebar.
 *
 * The decision itself now lives in resolveAiShell() (src/lib/nav/
 * shellContext.ts), so it can be tested and so it shares the admin's view
 * rule with the sidebar, the search, /notifications and the Navbar
 * (owner LIVE-F01 / NOTE-22-C01, 2026-10-30). This file only maps the answer
 * to a layout.
 *
 * PRIORITY ORDER (unchanged for every non-admin session):
 *   0. Session gate — hold on AILoading while the session resolves (FIX ٨٣)
 *   1. Session-based (user.userType — prevents sidebar bleeding). NEW: an
 *      admin gets the LAWYER shell on every /ai/* tool. This branch was
 *      missing, so an admin fell through to the last-dashboard stamp or the
 *      Business default, and SharedSidebar then drew the ADMIN menu inside it.
 *      LawyerDashboardLayout's UserTypeGuard already admits "admin" — no
 *      access changes.
 *   2. Path-based inference (/ai/corp → Business, /ai/gov → Government …)
 *   2b. Logged-out escape → render the page unwrapped; src/proxy.ts redirects
 *   3. Last-dashboard stamp (nzamy_last_dashboard from localStorage) [U6]
 *   4. Fallback → BusinessDashboardLayout
 *
 * History: FIX [U6] 2026-04-25 stamp; 2026-04-26 government/ngo; S33
 * 2026-04-29 firm/micro; FIX PRE-7 2026-05-15 session before path (an
 * arbitrator keeps the provider sidebar on /ai/gov/*); FIX ٨٣ 2026-09-04
 * loading gate; UAT-LIVE-AI-001 logged-out escape moved above the lawyer
 * prefixes (a guest is not a permissions problem).
 */
export default function AILayout({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const pathname = usePathname() ?? "/ai";
  const { storedView } = useAdminView(pathname, !user.loading && user.userType === "admin");

  // Read last-visited dashboard (written by each dashboard layout on mount).
  // Only while the session is resolved — the loading branch never needs it.
  let lastDashboard: string | null = null;
  if (!user.loading && typeof window !== "undefined") {
    try { lastDashboard = localStorage.getItem("nzamy_last_dashboard"); } catch { lastDashboard = null; }
  }

  const shell = resolveAiShell({
    loading: user.loading,
    isLoggedIn: user.isLoggedIn,
    userType: user.userType,
    pathname,
    storedView,
    lastDashboard,
  });

  switch (shell) {
    case "loading":    return <AILoading />;
    case "none":       return <>{children}</>;
    case "client":     return <ClientDashboardLayout>{children}</ClientDashboardLayout>;
    case "lawyer":     return <LawyerDashboardLayout>{children}</LawyerDashboardLayout>;
    case "provider":   return <ProviderDashboardLayout>{children}</ProviderDashboardLayout>;
    case "firm":       return <FirmDashboardLayout>{children}</FirmDashboardLayout>;
    case "micro":      return <MicroDashboardLayout>{children}</MicroDashboardLayout>;
    case "government": return <GovernmentDashboardLayout>{children}</GovernmentDashboardLayout>;
    case "ngo":        return <NGODashboardLayout>{children}</NGODashboardLayout>;
    case "business":
    default:           return <BusinessDashboardLayout>{children}</BusinessDashboardLayout>;
  }
}
