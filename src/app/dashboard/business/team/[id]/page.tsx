"use client";

// Owner decision ٥ (2026-10-17): five company sections are live — «القضايا»,
// «العقود», «المواعيد», «التفويض» and «إدارة الفريق». Every other section
// shows «قيد التطوير» through DashboardComingSoon.
//
// WHAT WAS REMOVED: MEMBERS_BY_ID, CASES_BY_MEMBER and ACTIVITY: invented colleagues with cases and an activity log, the same for every company. Reachable by URL under the real «إدارة الفريق» route. Nothing links a case or an activity to a company member.
// The previous UI is preserved in git history.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function BusinessTeamMemberPage() {
  return (
    <DashboardComingSoon
      title="ملف العضو — قيد التطوير"
      description="ملف العضو التفصيلي قيد التطوير. فريق منشأتك الحقيقي وأدوار أعضائه في «إدارة الفريق»."
      backHref="/dashboard/business/team"
    />
  );
}
