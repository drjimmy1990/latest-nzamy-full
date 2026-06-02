"use client";

import { useEffect } from "react";
import SharedSidebar from "@/components/dashboard/SharedSidebar";
import FloatingButtons from "@/components/FloatingButtons";

/**
 * Lawyer Dashboard Layout
 * Uses SharedSidebar (LAWYER_SIDEBAR config from navigation.ts)
 * Main content is offset 256px (w-64) on desktop for the sidebar.
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
    <div className="min-h-[100dvh] bg-surface dark:bg-dark-bg" dir="rtl" suppressHydrationWarning>
      {/* Sidebar */}
      <SharedSidebar />

      {/* Main content — offset for sidebar on desktop, bottom padding on mobile for hamburger */}
      <main className="lg:mr-64 pt-[60px] lg:pt-0 min-h-[100dvh] pb-20 lg:pb-0">
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>

      <FloatingButtons />
    </div>
  );
}

