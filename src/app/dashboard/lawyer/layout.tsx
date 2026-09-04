"use client";

import { useEffect } from "react";
import SharedSidebar from "@/components/dashboard/SharedSidebar";
import { UserTypeGuard } from "@/components/dashboard/UserTypeGuard";

/**
 * Lawyer Dashboard Layout
 * Uses SharedSidebar (LAWYER_SIDEBAR config from navigation.ts)
 * Main content is offset 256px (w-64) on desktop for the sidebar.
 *
 * allowedTypes carries "firm" and "provider" too, not just "lawyer": this
 * same component is reused directly (not through /dashboard/lawyer) by
 * src/app/notifications/layout.tsx, which deliberately sends firm and
 * provider sessions here for their notifications chrome. A guard admitting
 * only "lawyer" would wall those two account types off their own
 * notifications page — see UserTypeGuard's own precedent on
 * src/app/dashboard/provider/layout.tsx (allowedTypes includes "lawyer" for
 * the matching reason, an arbitrator addon).
 */
export default function LawyerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    try { localStorage.setItem("nzamy_last_dashboard", "lawyer"); } catch {}
  }, []);

  return (
    <UserTypeGuard allowedTypes={["lawyer", "firm", "provider", "admin"]}>
      <div className="min-h-[100dvh] bg-surface dark:bg-dark-bg" dir="rtl" suppressHydrationWarning>
        {/* Sidebar */}
        <SharedSidebar />

        {/* Main content — offset for sidebar on desktop, bottom padding on mobile for hamburger */}
        <main className="lg:mr-64 pt-[60px] lg:pt-0 min-h-[100dvh] pb-20 lg:pb-0">
          <div className="p-4 md:p-6">
            {children}
          </div>
        </main>

          </div>
    </UserTypeGuard>
  );
}

