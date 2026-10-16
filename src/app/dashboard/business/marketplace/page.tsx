"use client";

// Owner decision ٥ (2026-10-17): five company sections are live — «القضايا»,
// «العقود», «المواعيد», «التفويض» and «إدارة الفريق». Every other section
// shows «قيد التطوير» through DashboardComingSoon.
//
// WHAT WAS REMOVED: MyMarketplaceDashboard over MY_REQUESTS (components/marketplace/MyMarketplaceDashboardData): invented marketplace requests. The marketplace is parked by BETA_MONOPOLY_MODE.
// The previous UI is preserved in git history.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function BusinessMarketplacePage() {
  return (
    <DashboardComingSoon
      title="طلباتي في السوق — قيد التطوير"
      description="قسم السوق قيد التطوير ومتوقف خلال المرحلة التجريبية. لطلب خدمة قانونية استخدم «اطلب خدمة جديدة»."
      backHref="/dashboard/client/services"
    />
  );
}
