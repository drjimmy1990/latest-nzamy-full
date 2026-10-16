"use client";

// Owner decision ٥ (2026-10-17): five company sections are live — «القضايا»,
// «العقود», «المواعيد», «التفويض» and «إدارة الفريق». Every other section
// shows «قيد التطوير» through DashboardComingSoon.
//
// WHAT WAS REMOVED: CONTRACTS: invented employment contracts with names, salaries, dates and risk levels, and controls that saved nothing. Employment contracts have no table.
// The previous UI is preserved in git history.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function EmployeeContractsPage() {
  return (
    <DashboardComingSoon
      title="عقود الموظفين — قيد التطوير"
      description="قسم عقود الموظفين قيد التطوير. العقود والرواتب والتواريخ التي كانت تظهر هنا بيانات ثابتة لا تخص منشأتك. العقود التي يربطها محاميك بحسابك تجدها في «العقود»."
      backHref="/dashboard/business/contracts"
    />
  );
}
