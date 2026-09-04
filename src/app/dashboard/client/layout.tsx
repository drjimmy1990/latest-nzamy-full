"use client";

import { useEffect } from "react";
import SharedSidebar from "@/components/dashboard/SharedSidebar";
import { UserTypeGuard } from "@/components/dashboard/UserTypeGuard";

/**
 * allowedTypes carries "corporate" too, not just "individual": three
 * subtrees of this exact prefix — /dashboard/client/services, /requests,
 * /consultation — are deliberately open to corporate accounts at the edge
 * (src/lib/auth/routeAccess.ts CLIENT_INTAKE_PREFIXES, owner ruling س٢,
 * 26 August: a company files through the same three-step intake form
 * instead of a second one built beside it). This layout wraps the whole
 * /dashboard/client/* prefix, so a guard admitting only "individual" would
 * pass the edge gate and then wall a corporate account off the very order
 * path routeAccess.ts exists to open. The edge rule already keeps a
 * corporate account out of the individual-only screens elsewhere under this
 * prefix (cases, wallet, referrals, personal documents): those paths match
 * the general "/dashboard/client" → ["individual"] rule in routeAccess.ts
 * (proxy.ts Gate 2), which redirects the request to /dashboard/business
 * before this component — or any client JS — ever runs. This guard only
 * needs to admit what the edge already admits.
 */
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
    <UserTypeGuard allowedTypes={["individual", "corporate", "admin"]}>
      <div className="min-h-[100dvh] bg-surface dark:bg-dark-bg" dir="rtl" suppressHydrationWarning>
        {/* SharedSidebar renders its own mobile top-header (60px) + desktop sidebar + mobile drawer */}
        <SharedSidebar />
        {/* pt-[60px] on mobile matches SharedSidebar mobile header; lg:pt-0 on desktop (sidebar is side-mounted) */}
        <main className="lg:mr-64 pt-[60px] lg:pt-0 min-h-[100dvh]">
          <div className="p-4 md:p-6">{children}</div>
        </main>
          </div>
    </UserTypeGuard>
  );
}

