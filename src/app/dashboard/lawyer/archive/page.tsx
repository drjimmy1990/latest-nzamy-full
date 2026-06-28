"use client";

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function LawyerArchivePage() {
  return (
    <DashboardComingSoon
      title="الأرشيف"
      description="الأرشيف الموحّد للقضايا والموكلين والعقود والمستندات المغلقة قيد التطوير. ستظهر السجلات المؤرشفة هنا فور توفّر مخزن أرشفة مشترك (archiveStore / API)."
      backHref="/dashboard/lawyer"
    />
  );
}