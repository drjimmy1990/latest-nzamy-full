"use client";

import { usePathname } from "next/navigation";
import { useUser } from "@/hooks/useUser";
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
 * PRIORITY ORDER:
 *   1. Session-based (user.userType — highest priority, prevents sidebar bleeding)
 *   2. Path-based inference for unresolved sessions
 *      (/ai/corp/* → Business, /ai/gov/* → Government, etc.)
 *   3. Last-dashboard stamp (nzamy_last_dashboard from localStorage) ← [U6] fix
 *   4. Fallback → BusinessDashboardLayout
 *
 * FIX [U6]   (2026-04-25): Added localStorage stamp.
 * UPDATE     (2026-04-26): Added government and ngo layout support.
 * UPDATE S33 (2026-04-29): Added FirmDashboardLayout + MicroDashboardLayout.
 * FIX PRE-7  (2026-05-15): /ai/gov/* was hardcoded to GovernmentDashboardLayout,
 *   breaking arbitrators (provider/arbitrator) who click "باحث المبادئ" from their
 *   dedicated sidebar — they would see the Government sidebar instead of their own.
 *   Session now takes priority over path inference to prevent all such bleeding.
 */
export default function AILayout({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const pathname = usePathname();

  // Read last-visited dashboard (written by each dashboard layout on mount)
  const lastDashboard =
    typeof window !== "undefined"
      ? (localStorage.getItem("nzamy_last_dashboard") ?? null)
      : null;

  // Do not wrap the marketing landing page (/ai) with a dashboard sidebar IF not logged in
  if (pathname === "/ai" && !user.isLoggedIn) {
    return <>{children}</>;
  }

  // ── 1. SESSION-BASED (highest priority — prevents sidebar bleeding) ──────────
  // Must come BEFORE path-based inference.
  // A provider/arbitrator clicking /ai/gov/judicial-search keeps ProviderDashboardLayout.
  // A lawyer with arbitrator addon keeps LawyerDashboardLayout.
  if (user.userType === "corporate") {
    return <BusinessDashboardLayout>{children}</BusinessDashboardLayout>;
  }
  if (user.userType === "individual") {
    return <ClientDashboardLayout>{children}</ClientDashboardLayout>;
  }
  if (user.userType === "lawyer") {
    return <LawyerDashboardLayout>{children}</LawyerDashboardLayout>;
  }
  if (user.userType === "provider") {
    return <ProviderDashboardLayout>{children}</ProviderDashboardLayout>;
  }
  if (user.userType === "firm") {
    return <FirmDashboardLayout>{children}</FirmDashboardLayout>;
  }
  if (user.userType === "micro") {
    return <MicroDashboardLayout>{children}</MicroDashboardLayout>;
  }
  if (user.userType === "government") {
    return <GovernmentDashboardLayout>{children}</GovernmentDashboardLayout>;
  }
  if (user.userType === "ngo") {
    return <NGODashboardLayout>{children}</NGODashboardLayout>;
  }

  // ── 2. PATH-BASED INFERENCE (for unresolved/guest sessions only) ─────────────
  // Corporate-specific AI tools → business sidebar
  if (pathname.startsWith("/ai/corp/") || pathname === "/ai/corp") {
    return <BusinessDashboardLayout>{children}</BusinessDashboardLayout>;
  }
  // Government-specific AI tools → government sidebar
  // (Only reached if no session resolved above — gov users already handled at step 1)
  if (pathname.startsWith("/ai/gov/") || pathname === "/ai/gov") {
    return <GovernmentDashboardLayout>{children}</GovernmentDashboardLayout>;
  }
  // NGO-specific AI tools → NGO sidebar
  if (pathname.startsWith("/ai/ngo/") || pathname === "/ai/ngo") {
    return <NGODashboardLayout>{children}</NGODashboardLayout>;
  }
  // Micro-specific AI tools → micro sidebar
  if (pathname.startsWith("/ai/micro/") || pathname === "/ai/micro") {
    return <MicroDashboardLayout>{children}</MicroDashboardLayout>;
  }

  // ── 3. LAST-DASHBOARD STAMP [U6] ─────────────────────────────────────
  // Handles demo session mismatch (e.g. corporate user with session="individual")
  if (lastDashboard === "business") {
    return <BusinessDashboardLayout>{children}</BusinessDashboardLayout>;
  }
  if (lastDashboard === "client") {
    return <ClientDashboardLayout>{children}</ClientDashboardLayout>;
  }
  if (lastDashboard === "lawyer") {
    return <LawyerDashboardLayout>{children}</LawyerDashboardLayout>;
  }
  if (lastDashboard === "provider") {
    return <ProviderDashboardLayout>{children}</ProviderDashboardLayout>;
  }
  if (lastDashboard === "firm") {
    return <FirmDashboardLayout>{children}</FirmDashboardLayout>;
  }
  if (lastDashboard === "micro") {
    return <MicroDashboardLayout>{children}</MicroDashboardLayout>;
  }
  if (lastDashboard === "government") {
    return <GovernmentDashboardLayout>{children}</GovernmentDashboardLayout>;
  }
  if (lastDashboard === "ngo") {
    return <NGODashboardLayout>{children}</NGODashboardLayout>;
  }

  // ── 4. FALLBACK ──────────────────────────────────────────────────────────
  return <BusinessDashboardLayout>{children}</BusinessDashboardLayout>;
}
