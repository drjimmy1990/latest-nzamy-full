"use client";

// Owner decision ٥ (2026-10-17): five company sections are live — «القضايا»,
// «العقود», «المواعيد», «التفويض» and «إدارة الفريق». Every other section
// shows «قيد التطوير» through DashboardComingSoon.
//
// WHAT WAS REMOVED: WALLET_DATA, USAGE_HISTORY and BILLING_HISTORY: an invented plan, usage log and two «PAID» invoices.
// The previous UI is preserved in git history.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function BusinessWalletPage() {
  return (
    <DashboardComingSoon
      title="باقتنا والاشتراك — قيد التطوير"
      description="قسم الباقة والفواتير قيد التطوير. الباقة والاستهلاك والفواتير المدفوعة التي كانت تظهر هنا بيانات ثابتة لا تخص منشأتك."
      backHref="/dashboard/business"
    />
  );
}
