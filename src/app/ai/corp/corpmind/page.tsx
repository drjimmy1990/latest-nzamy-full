"use client";

// «CorpMind — وكيل الشركة» — honesty gate (owner answer ١١٥).
//
// WHAT THIS PAGE WAS: an onboarding step, then a contract portfolio of four
// invented contracts and an "analysis" that, after a timer, showed the same
// score, the same four risks and the same three suggestions for whatever file
// was dropped on it. Nothing was uploaded or analysed.
//
// /ai/tracker redirects here; the navbar row (navigation.navbar.ts) and the
// hub's tracker card carry «قريباً».

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function CorpMindPage() {
  return (
    <DashboardComingSoon
      title="CorpMind — وكيل الشركة"
      description="وكيل الشركة غير متاح حالياً وسيُفعَّل قريباً. محفظة العقود ونتيجة التحليل والمخاطر التي كانت تظهر هنا كانت أمثلة ثابتة لا تحليلاً لعقودك."
      backHref="/ai"
    />
  );
}
