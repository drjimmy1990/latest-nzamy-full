"use client";

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

/**
 * /dashboard/admin/ai-usage — «استخدام الذكاء الاصطناعي».
 *
 * The page was literals only: six AI tools with invented call, token and cost
 * figures (`TOOLS`), six named "top consumers" with request counts, costs and
 * daily-cap percentages (`TOP_CONSUMERS`), a «Telemetry Live» pulse and a
 * circuit-breaker banner about one of those invented firms. No table records
 * an AI call: `credit_transactions` has a `usage` kind, but nothing in src/
 * writes one (grep, 2026-10-16), and no tokens, model costs or per-tool counts
 * are stored anywhere. There is nothing real to show, so the page says so
 * (fix plan 2026-10-16, item 1). Rebuild it on a usage ledger once the AI
 * tools write one.
 */
export default function AdminAIUsagePage() {
  return (
    <DashboardComingSoon
      title="استخدام الذكاء الاصطناعي"
      description="لا تسجّل أدوات الذكاء الاصطناعي استهلاكها بعد، فلا توجد أرقام حقيقية لعرضها هنا."
      backHref="/dashboard/admin"
    />
  );
}
