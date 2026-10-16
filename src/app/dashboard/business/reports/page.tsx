"use client";

// Owner decision ٥ (2026-10-17): five company sections are live — «القضايا»,
// «العقود», «المواعيد», «التفويض» and «إدارة الفريق». Every other section
// shows «قيد التطوير» through DashboardComingSoon.
//
// WHAT WAS REMOVED: DEPT_REPORTS and MONTHLY_TREND: invented per-department figures and a monthly trend. Nothing computes company reports.
// The previous UI is preserved in git history.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function BusinessReportsPage() {
  return (
    <DashboardComingSoon
      title="التقارير — قيد التطوير"
      description="قسم التقارير قيد التطوير. الأرقام والمنحنيات التي كانت تظهر هنا بيانات ثابتة لا تخص منشأتك."
      backHref="/dashboard/business"
    />
  );
}
