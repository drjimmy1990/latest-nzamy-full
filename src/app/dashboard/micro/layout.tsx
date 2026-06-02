"use client";

import { useEffect } from "react";
import SharedSidebar from "@/components/dashboard/SharedSidebar";
import FloatingButtons from "@/components/FloatingButtons";
import { UserTypeGuard } from "@/components/dashboard/UserTypeGuard";

/**
 * Micro Business Dashboard Layout — /dashboard/micro
 * Uses MICRO_SIDEBAR config (simple: requirements + AI assistant)
 *
 * Intentionally minimal — صاحب البقالة لا يريد تعقيد
 */
export default function MicroDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // [U6] Stamp last_dashboard so AI layout can infer correct sidebar
  useEffect(() => {
    try { localStorage.setItem("nzamy_last_dashboard", "micro"); } catch {}
  }, []);

  return (
    <UserTypeGuard allowedTypes={["micro", "admin"]}>
      <div className="min-h-[100dvh] bg-surface dark:bg-dark-bg" dir="rtl" suppressHydrationWarning>
        <SharedSidebar />
        <main className="lg:mr-64 pt-[60px] lg:pt-0 min-h-[100dvh]">
          <div className="p-4 md:p-6">{children}</div>
        </main>
        <FloatingButtons />
      </div>
    </UserTypeGuard>
  );
}

