"use client";

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

/**
 * PrecedentReaderPage — /precedents/judgment/[slug]
 *
 * Previously rendered DEMO_PRECEDENTS.find(...) mock-only content with no
 * backing API route (/api/library/judgment does not exist). To avoid
 * fabricating judgment data, the page is gated behind an honest
 * "قريباً / coming soon" state until a real judgment detail backend is wired.
 */
export default function PrecedentReaderPage() {
  return (
    <DashboardComingSoon
      title="تفاصيل صك الحكم"
      description="صفحة تفاصيل صكوك الأحكام قيد التطوير وستكون متاحة قريباً. لا توجد بيانات أحكام حقيقية لعرضها بعد."
      backHref="/laws"
    />
  );
}