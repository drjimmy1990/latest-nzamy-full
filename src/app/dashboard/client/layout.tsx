"use client";

import { useEffect } from "react";
import SharedSidebar from "@/components/dashboard/SharedSidebar";
import FloatingButtons from "@/components/FloatingButtons";

export default function ClientDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // [U6] Stamp last_dashboard so AI layout can infer correct sidebar
  useEffect(() => {
    try { localStorage.setItem("nzamy_last_dashboard", "client"); } catch {}
  }, []);

  return (
    <div className="min-h-[100dvh] bg-surface dark:bg-dark-bg" dir="rtl" suppressHydrationWarning>
      {/* SharedSidebar renders its own mobile top-header (60px) + desktop sidebar + mobile drawer */}
      <SharedSidebar />
      {/* pt-[60px] on mobile matches SharedSidebar mobile header; lg:pt-0 on desktop (sidebar is side-mounted) */}
      <main className="lg:mr-64 pt-[60px] lg:pt-0 min-h-[100dvh]">
        <div className="p-4 md:p-6">{children}</div>
      </main>
      <FloatingButtons />
    </div>
  );
}

