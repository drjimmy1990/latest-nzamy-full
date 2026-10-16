"use client";

// Owner decision ٥ (2026-10-17): five company sections are live — «القضايا»,
// «العقود», «المواعيد», «التفويض» and «إدارة الفريق». Every other section
// shows «قيد التطوير» through DashboardComingSoon.
//
// WHAT WAS REMOVED: the department file — DEPTS, MEMBERS_BY_DEPT and CONSULTS_BY_DEPT: invented departments, staff and consultations, the same for every company. There is no departments table.
// The previous UI is preserved in git history.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function BusinessDepartmentDetailPage() {
  return (
    <DashboardComingSoon
      title="تفاصيل القسم — قيد التطوير"
      description="ملف القسم قيد التطوير. ما كان يظهر هنا من أقسام وموظفين واستشارات بيانات ثابتة لا تخص منشأتك."
      backHref="/dashboard/business"
    />
  );
}
