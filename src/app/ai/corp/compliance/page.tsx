"use client";

// «مراقب الامتثال» — honesty gate (owner answer ١١٥).
//
// WHAT THIS PAGE WAS: six compliance areas with fixed statuses (two "needs
// review", one "violated"), revealed after a timed "analysis" that checked
// nothing about the company. /ai/corp/compliance-monitor is a separate page
// and is unaffected; /ai/corp/privacy redirects here (proxy.ts).
//
// The hub card in src/app/ai/page.tsx carries «قريباً».

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function CorpCompliancePage() {
  return (
    <DashboardComingSoon
      title="مراقب الامتثال"
      description="مراقب الامتثال غير متاح حالياً وسيُفعَّل قريباً. حالات الامتثال التي كانت تظهر هنا كانت أمثلة ثابتة لا فحصاً لشركتك."
      backHref="/ai"
    />
  );
}
