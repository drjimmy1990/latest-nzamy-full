"use client";

// Owner decision ٥ (2026-10-17): five company sections are live — «القضايا»,
// «العقود», «المواعيد», «التفويض» and «إدارة الفريق». Every other section
// shows «قيد التطوير» through DashboardComingSoon.
//
// WHAT WAS REMOVED: COUNSEL and TASKS: an invented seconded counsel with a name, contract terms and a task list.
// The previous UI is preserved in git history.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function SecondedCounselPage() {
  return (
    <DashboardComingSoon
      title="المستشار المنتدب — قيد التطوير"
      description="قسم المستشار المنتدب قيد التطوير. المستشار والمهام التي كانت تظهر هنا بيانات ثابتة لا تخص منشأتك."
      backHref="/dashboard/business"
    />
  );
}
