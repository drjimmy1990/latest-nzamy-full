"use client";

import { useEffect } from "react";
import SharedSidebar from "@/components/dashboard/SharedSidebar";
import FloatingButtons from "@/components/FloatingButtons";
import { UserTypeGuard } from "@/components/dashboard/UserTypeGuard";

export default function GovernmentLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    try { localStorage.setItem("nzamy_last_dashboard", "government"); } catch {}
  }, []);

  return (
    <UserTypeGuard allowedTypes={["government", "admin"]}>
      <div className="min-h-[100dvh] bg-surface dark:bg-dark-bg" dir="rtl" suppressHydrationWarning>
        <SharedSidebar />
        <main className="lg:mr-64 pt-[60px] lg:pt-0 min-h-[100dvh]">
          <div className="p-4 md:p-6">
            {children}
          </div>
        </main>
        <FloatingButtons />
      </div>
    </UserTypeGuard>
  );
}


