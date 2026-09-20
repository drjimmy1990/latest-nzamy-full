"use client";

import { useEffect } from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { UserTypeGuard } from "@/components/dashboard/UserTypeGuard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // [U6] Stamp last_dashboard so AI layout can infer correct sidebar
  useEffect(() => {
    try { localStorage.setItem("nzamy_last_dashboard", "admin"); } catch {}
  }, []);

  return (
    <UserTypeGuard allowedTypes={["admin"]}>
      <div className="flex h-[100dvh] overflow-hidden bg-[#0a0a0f]" dir="rtl" suppressHydrationWarning>
        <AdminSidebar />
        {/* AdminSidebar now renders a fixed lg:hidden top bar (56px + notch).
            lg:pt-0 leaves the desktop console exactly as it was. */}
        <div className="print-main flex-1 overflow-y-auto pt-[calc(env(safe-area-inset-top)+56px)] lg:pt-0">
          {children}
        </div>
      </div>
    </UserTypeGuard>
  );
}
