"use client";

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function LawyerSecondmentPage() {
  return (
    <DashboardComingSoon
      title="الانتدابات القانونية"
      description="إدارة الانتدابات القانونية غير متاحة حالياً. ستظهر عقود الانتداب وساعاتها هنا فور ربط ميزة الانتداب بقاعدة البيانات."
      backHref="/dashboard/lawyer"
    />
  );
}