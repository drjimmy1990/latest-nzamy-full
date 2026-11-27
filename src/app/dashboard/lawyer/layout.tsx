"use client";

import { useEffect } from "react";
import SharedSidebar from "@/components/dashboard/SharedSidebar";
import { UserTypeGuard } from "@/components/dashboard/UserTypeGuard";
import { QuickAddProvider } from "@/components/dashboard/quickAdd/QuickAdd";
import PracticeKindGate from "@/components/dashboard/PracticeKindGate";
import LicenceExpiryBanner from "@/components/dashboard/LicenceExpiryBanner";
import OfficePlanGuard from "@/components/dashboard/OfficePlanGuard";

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
      {/* R9: a lawyer never asked advocate / consultant answers first. */}
      <PracticeKindGate />
      {/* «+ إضافة سريعة» (N3.3): the floating button, the sidebar item and
          Alt+N. Signed-in lawyer and firm sessions only — the provider's
          /notifications reuse of this layout gets none of it. */}
      <QuickAddProvider scope="lawyer">
      <div className="min-h-[100dvh] bg-surface dark:bg-dark-bg" dir="rtl" suppressHydrationWarning>
        {/* Sidebar */}
        <SharedSidebar />

        {/* Main content — offset for sidebar on desktop, bottom padding on mobile for hamburger */}
        <div className="print-main lg:mr-64 pt-[calc(env(safe-area-inset-top)+60px)] lg:pt-0 min-h-[100dvh] pb-20 lg:pb-0">
          <div className="p-4 md:p-6">
            {/* l19 (owner ٢٤١): nothing unless the verified licence is within 30 days or past */}
            <LicenceExpiryBanner />
            {/* ق٢٦-٤ / ق٢٦-٥: a paid office page shows the lock teaser to the free side (src/lib/auth/officePages.ts) */}
            <OfficePlanGuard scope="lawyer">{children}</OfficePlanGuard>
          </div>
        </div>

          </div>
      </QuickAddProvider>
    </UserTypeGuard>
  );
}

