"use client";

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

/**
 * /dashboard/admin/system — «سجل النظام» (owner answer ١١٥).
 *
 * The page listed eight fixed log lines (logins, AI calls, a declined card, a
 * CPU spike, a nightly backup) dated one April evening, under «يتحدث كل ٣٠
 * ثانية». Nothing read a log: no log source is wired to the admin console.
 * The primary sidebar row carries «قريباً».
 */
export default function AdminSystemPage() {
  return (
    <DashboardComingSoon
      title="سجل النظام"
      description="لا يوجد مصدر حقيقي لسجلات النظام في لوحة الإدارة بعد. السجلات التي كانت تظهر هنا كانت أمثلة ثابتة."
      backHref="/dashboard/admin"
    />
  );
}
