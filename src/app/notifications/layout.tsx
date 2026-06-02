"use client";

import BusinessDashboardLayout from "@/app/dashboard/business/layout";
import ClientDashboardLayout from "@/app/dashboard/client/layout";
import LawyerDashboardLayout from "@/app/dashboard/lawyer/layout";
import { useUser } from "@/hooks/useUser";

/**
 * Notifications Layout — [U5] fix
 * Wraps /notifications with the correct dashboard sidebar
 * by reading nzamy_last_dashboard from localStorage.
 */
export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  const user = useUser();

  const lastDashboard =
    typeof window !== "undefined"
      ? (localStorage.getItem("nzamy_last_dashboard") ?? null)
      : null;

  // Session-based (most reliable)
  if (user.userType === "corporate") return <BusinessDashboardLayout>{children}</BusinessDashboardLayout>;
  if (user.userType === "individual") return <ClientDashboardLayout>{children}</ClientDashboardLayout>;
  if (user.userType === "lawyer" || user.userType === "firm" || user.userType === "provider") {
    return <LawyerDashboardLayout>{children}</LawyerDashboardLayout>;
  }

  // Last-dashboard stamp fallback
  if (lastDashboard === "business") return <BusinessDashboardLayout>{children}</BusinessDashboardLayout>;
  if (lastDashboard === "client")   return <ClientDashboardLayout>{children}</ClientDashboardLayout>;
  if (lastDashboard === "lawyer")   return <LawyerDashboardLayout>{children}</LawyerDashboardLayout>;

  // Default
  return <BusinessDashboardLayout>{children}</BusinessDashboardLayout>;
}
