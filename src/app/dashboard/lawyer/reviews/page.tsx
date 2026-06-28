"use client";

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function LawyerReviewsPage() {
  return (
    <DashboardComingSoon
      title="تقييمات العملاء"
      description="تقييمات ومراجعات العملاء قيد التطوير. ستظهر هنا فور توفّر نقطة API مخصصة للتقييمات (لا توجد /api/v1/reviews بعد)."
      backHref="/dashboard/lawyer"
    />
  );
}