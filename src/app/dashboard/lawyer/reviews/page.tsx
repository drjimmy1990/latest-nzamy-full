"use client";

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function LawyerReviewsPage() {
  return (
    <DashboardComingSoon
      title="تقييمات العملاء"
      description="تقييمات ومراجعات العملاء غير متاحة حالياً. ستظهر هنا فور توفّر نقطة API مخصصة للتقييمات (لا توجد /api/v1/reviews بعد)."
      backHref="/dashboard/lawyer"
    />
  );
}