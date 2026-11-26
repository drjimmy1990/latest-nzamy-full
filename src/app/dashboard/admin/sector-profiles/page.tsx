"use client";

// «بروفيلات القطاعات» — owner package 25 Nov, §٣.١-3 (l16 C03).
//
// WHAT THIS PAGE WAS: invented government, non-profit and small-business
// entities (G-001, N-001, M-001) kept in the admin's own browser only, a
// technical English status label, and a «معاينة العقود» button that did
// nothing real.
//
// WHY «قيد التفعيل»: wiring this page to the real sector tables
// (government_profiles, ngo_profiles, micro_profiles) is a later task. Until
// then an honest «not available» replaces the invented entities. The
// browser-settings hook is NOT deleted: non-admin modules still read it.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function AdminSectorProfilesPage() {
  return (
    <DashboardComingSoon
      title="بروفيلات القطاعات"
      description="إدارة ملفات الجهات الحكومية والجمعيات والمنشآت الصغيرة من لوحة الإدارة قيد التفعيل، وستُربط بسجلاتها الحقيقية."
      backHref="/dashboard/admin/business"
    />
  );
}
