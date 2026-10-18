"use client";

// «مدير العقود» (corporate CLM) — honesty gate (owner answer ١١٥).
//
// WHAT THIS PAGE WAS: five invented contracts (named counterparties, values,
// expiry dates, risk levels), counters computed from them, an "expiring soon"
// alert about them, and «عقد جديد» / «تحليل» buttons with no handler. No
// company contract store sits behind it.
//
// The firm sidebar row (navigation.sidebars.legal.ts) carries «قريباً».

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function CorpCLMPage() {
  return (
    <DashboardComingSoon
      title="مدير العقود"
      description="مدير عقود الشركة غير متاح حالياً وسيُفعَّل قريباً. العقود والإحصاءات والتنبيهات التي كانت تظهر هنا كانت أمثلة ثابتة، لا عقود شركتك."
      backHref="/ai"
    />
  );
}
