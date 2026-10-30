"use client";

import { usePathname } from "next/navigation";
import BusinessDashboardLayout from "@/app/dashboard/business/layout";
import ClientDashboardLayout from "@/app/dashboard/client/layout";
import LawyerDashboardLayout from "@/app/dashboard/lawyer/layout";
import AdminLayout from "@/app/dashboard/admin/layout";
import { useUser } from "@/hooks/useUser";
import { useAdminView } from "@/hooks/useAdminView";
import { resolveNotificationsShell } from "@/lib/nav/shellContext";

/**
 * Notifications Layout — [U5] fix
 * Wraps /notifications with the correct dashboard sidebar
 * by reading nzamy_last_dashboard from localStorage.
 *
 * The decision is resolveNotificationsShell() (src/lib/nav/shellContext.ts) —
 * unchanged for every non-admin session. An admin used to fall through to the
 * stamp, and the console stamps "admin", which matched nothing: the console's
 * own «عرض جميع الإشعارات» opened the BUSINESS shell. Now the admin's view
 * context decides (owner LIVE-F01): the lawyer shell in lawyer mode, the admin
 * console's own shell otherwise. Both layouts already admit "admin".
 */
export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const pathname = usePathname() ?? "/notifications";
  const { storedView } = useAdminView(pathname, !user.loading && user.userType === "admin");

  let lastDashboard: string | null = null;
  if (typeof window !== "undefined") {
    try { lastDashboard = localStorage.getItem("nzamy_last_dashboard"); } catch { lastDashboard = null; }
  }

  const shell = resolveNotificationsShell({ userType: user.userType, storedView, lastDashboard, pathname });

  if (shell === "admin")  return <AdminLayout>{children}</AdminLayout>;
  if (shell === "client") return <ClientDashboardLayout>{children}</ClientDashboardLayout>;
  if (shell === "lawyer") return <LawyerDashboardLayout>{children}</LawyerDashboardLayout>;
  return <BusinessDashboardLayout>{children}</BusinessDashboardLayout>;
}
