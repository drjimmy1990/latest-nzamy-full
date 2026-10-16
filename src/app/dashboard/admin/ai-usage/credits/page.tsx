"use client";

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

/**
 * /dashboard/admin/ai-usage/credits — «استهلاك الذكاء الاصطناعي».
 *
 * The page listed five invented users («القاضي محمد الغامدي», «شركة المستقبل»
 * …) with made-up used/limit figures and an «تصدير» button wired to nothing.
 * No AI call debits points today — nothing in src/ writes a `usage` row to
 * `credit_transactions` — so per-user consumption does not exist to show
 * (fix plan 2026-10-16, item 1). Point grants and adjustments are real and
 * live on the user's page in the admin console (POST /api/v1/admin/credits).
 */
export default function AdminAICreditsPage() {
  return (
    <DashboardComingSoon
      title="استهلاك الذكاء الاصطناعي"
      description="لا تُخصم النقاط عند استخدام أدوات الذكاء الاصطناعي بعد، فلا يوجد استهلاك حقيقي لعرضه هنا."
      backHref="/dashboard/admin"
    />
  );
}
