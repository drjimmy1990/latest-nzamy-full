"use client";

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

/**
 * /dashboard/admin/reports — «مركز التقارير» (owner answer ١١٥).
 *
 * Every figure on the page was a constant: new users, MRR, AI requests, churn,
 * a visitor-to-subscriber funnel, a retention heatmap, users per city and
 * subscribers per role — none computed from platform data. The «تصدير PDF»
 * button and the period tabs did nothing.
 * The primary sidebar row, badged «جديد», now carries «قريباً».
 */
export default function ReportsPage() {
  return (
    <DashboardComingSoon
      title="مركز التقارير"
      description="لا توجد تقارير محسوبة من بيانات المنصة بعد. الأرقام التي كانت تظهر هنا (المستخدمون والإيرادات والاحتفاظ والمدن والأدوار) كانت أمثلة ثابتة."
      backHref="/dashboard/admin"
    />
  );
}
