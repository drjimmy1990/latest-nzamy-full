"use client";

// «المترجم القانوني» — honesty gate (owner answer ١١٥).
//
// WHAT THIS PAGE WAS: a form (languages, specialization, level, a text box)
// whose «ابدأ الترجمة» button waited out a timer and then showed the same
// English "translation", the same "original", the same glossary and the same
// disputed clauses whatever was typed in — every one a constant in the
// translation fixture module. Nothing was translated.
//
// The fixture module and its result components stay on disk (owner decision
// ٤: no source deletion without its own decision) but nothing imports them,
// so they leave the bundle (cannedOutputGate.test.ts holds that). The catalog
// row in lawyerAiCatalog.ts carries `comingSoon`, so the hub badge reads
// «قريباً», and the nav rows carry the same badge (navComingSoon.test.ts).

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function LegalTranslatePage() {
  return (
    <DashboardComingSoon
      title="المترجم القانوني"
      description="المترجم القانوني غير متاح حالياً وسيُفعَّل قريباً. كانت الترجمة وقاموس المصطلحات المعروضان هنا نصاً ثابتاً لا ترجمةً لما تُدخله، لذلك أُوقفت الأداة إلى أن تُربط بترجمة حقيقية."
      backHref="/ai"
    />
  );
}
