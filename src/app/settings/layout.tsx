"use client";

import BusinessDashboardLayout from "@/app/dashboard/business/layout";
import ClientDashboardLayout from "@/app/dashboard/client/layout";
import LawyerDashboardLayout from "@/app/dashboard/lawyer/layout";
import AdminLayout from "@/app/dashboard/admin/layout";
import { useUser } from "@/hooks/useUser";

/**
 * Settings Layout — wraps /settings with the correct dashboard sidebar.
 * Covers ALL 8 user types + provider + admin personal settings.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = useUser();

  const lastDashboard =
    typeof window !== "undefined"
      ? (localStorage.getItem("nzamy_last_dashboard") ?? null)
      : null;

  // ── Session-based routing (most reliable) ─────────────────────────
  // Admin account settings are personal only; platform controls live under /dashboard/admin.
  if (user.userType === "admin") return <AdminLayout>{children}</AdminLayout>;

  // Client / Individual
  if (user.userType === "individual") return <ClientDashboardLayout>{children}</ClientDashboardLayout>;

  // Corporate / Micro / Government / NGO → Business layout
  if (user.userType === "corporate" || user.userType === "micro" || user.userType === "government" || user.userType === "ngo") {
    return <BusinessDashboardLayout>{children}</BusinessDashboardLayout>;
  }

  // Lawyer / Firm / Provider → Lawyer layout
  if (user.userType === "lawyer" || user.userType === "firm" || user.userType === "provider") {
    return <LawyerDashboardLayout>{children}</LawyerDashboardLayout>;
  }

  // ── Last-dashboard stamp fallback ─────────────────────────────────
  if (lastDashboard === "business") return <BusinessDashboardLayout>{children}</BusinessDashboardLayout>;
  if (lastDashboard === "client")   return <ClientDashboardLayout>{children}</ClientDashboardLayout>;
  if (lastDashboard === "lawyer")   return <LawyerDashboardLayout>{children}</LawyerDashboardLayout>;
  if (lastDashboard === "admin")    return <AdminLayout>{children}</AdminLayout>;

  // ── Default ───────────────────────────────────────────────────────
  return <BusinessDashboardLayout>{children}</BusinessDashboardLayout>;
}
