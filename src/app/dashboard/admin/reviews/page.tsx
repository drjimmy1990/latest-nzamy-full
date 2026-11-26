"use client";

// «تقييمات المستخدمين» — owner package 25 Nov, §٣.١-1 (l16 C01).
//
// WHAT THIS PAGE WAS: four invented reviews written into the page, with
// «نشر» and «رفض» buttons that had no action at all. Nothing on it came from
// the platform.
//
// WHY «قيد التفعيل»: the moderation of real reviews (a list from the reviews
// table and an audited publish/reject route) is not built yet. Until it is, an
// honest «not available» replaces the invented list, and the page is out of
// the admin sidebar (src/constants/adminNavItems.ts).

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function AdminReviewsPage() {
  return (
    <DashboardComingSoon
      title="تقييمات المستخدمين"
      description="مراجعة التقييمات ونشرها من لوحة الإدارة قيد التفعيل، وستُبنى على التقييمات الحقيقية التي يكتبها المستخدمون."
      backHref="/dashboard/admin"
    />
  );
}
