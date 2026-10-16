"use client";

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

/**
 * /dashboard/admin/ai-usage/reports — «تقارير الجودة».
 *
 * The page showed satisfaction, accuracy, star ratings and thumbs-up/down
 * counts for five AI tools. None of it was measured: no AI tool stores a
 * rating (the thumbs buttons on /ai/consult have no handler), and no table
 * holds one (fix plan 2026-10-16, item 1).
 */
export default function AdminAIReportsPage() {
  return (
    <DashboardComingSoon
      title="تقارير جودة الذكاء الاصطناعي"
      description="لا تجمع أدوات الذكاء الاصطناعي تقييمات المستخدمين بعد، فلا توجد تقارير جودة حقيقية لعرضها هنا."
      backHref="/dashboard/admin"
    />
  );
}
