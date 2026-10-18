"use client";

// «المقارن الذكي» — honesty gate (owner answer ١١٥).
//
// WHAT THIS PAGE WAS: two text boxes and a «ابدأ المقارنة» button that waited
// out a timer and then showed the same differences, the same issues, the same
// "auto-fixes" and the same verdict whatever the two documents said — every
// one a constant in the sibling fixture module (`_compare-types.tsx`). The two
// documents were never compared.
//
// The sibling files stay on disk (owner decision ٤) but nothing imports them,
// so they leave the bundle (cannedOutputGate.test.ts). Task 5.1 had already
// left this tool unpriced; the catalog row now carries `comingSoon`, so the hub
// badge reads «قريباً», and so do the nav rows.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function SmartComparePage() {
  return (
    <DashboardComingSoon
      title="المقارن الذكي"
      description="المقارن الذكي غير متاح حالياً وسيُفعَّل قريباً. كانت الاختلافات والتنبيهات المعروضة هنا أمثلة ثابتة لا مقارنةً فعلية بين مستنديك، لذلك أُوقفت الأداة إلى أن تُربط بمقارنة حقيقية."
      backHref="/ai"
    />
  );
}
