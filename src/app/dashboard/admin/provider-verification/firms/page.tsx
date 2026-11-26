"use client";

// «شركات المحاماة» — owner package 25 Nov, §٣.١-2 (l16 C02).
//
// WHAT THIS PAGE WAS: three invented firms (F-001..F-003) whose plans and
// switches were kept in the admin's own browser only (useAdminSettings), so
// nothing saved here reached a firm or the server.
//
// WHY «قيد التفعيل»: managing a real firm's plan and features from the console
// is not built yet. Firm verification itself is real and lives in «تحقق
// المزودين». The browser-settings hook is NOT deleted: eight non-admin modules
// still read it (featureAccess, useSubscription, SharedSidebar, …).

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function AdminFirmsPage() {
  return (
    <DashboardComingSoon
      title="شركات المحاماة"
      description="إدارة باقات مكاتب المحاماة وخصائصها من لوحة الإدارة قيد التفعيل. توثيق المكاتب متاح الآن من صفحة «تحقق المزودين»."
      backHref="/dashboard/admin/provider-verification"
    />
  );
}
