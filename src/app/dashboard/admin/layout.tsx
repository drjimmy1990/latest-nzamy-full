"use client";

import { useEffect } from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { UserTypeGuard } from "@/components/dashboard/UserTypeGuard";
import { ForceDarkTheme } from "@/components/ThemeProvider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // [U6] Stamp last_dashboard so AI layout can infer correct sidebar
  useEffect(() => {
    try { localStorage.setItem("nzamy_last_dashboard", "admin"); } catch {}
  }, []);

  // The console is dark-only, whatever the site theme is: ForceDarkTheme makes
  // every useTheme().isDark inside answer true, and the `dark` class on the
  // root turns on every dark: utility (Tailwind's dark variant is
  // `&:where(.dark, .dark *)`). Before this, a light site theme drew white
  // cards and dark text on the black console. `admin-console` is the print
  // hook in globals.css: a printout is still black on white.
  return (
    <ForceDarkTheme>
      <UserTypeGuard allowedTypes={["admin"]}>
        <div className="admin-console dark flex h-[100dvh] overflow-hidden bg-[#0a0a0f] [color-scheme:dark]" dir="rtl" suppressHydrationWarning>
          <AdminSidebar />
          {/* AdminSidebar now renders a fixed lg:hidden top bar (56px + notch).
              lg:pt-0 leaves the desktop console exactly as it was. */}
          <div className="print-main flex-1 overflow-y-auto pt-[calc(env(safe-area-inset-top)+56px)] lg:pt-0">
            {children}
          </div>
        </div>
      </UserTypeGuard>
    </ForceDarkTheme>
  );
}
