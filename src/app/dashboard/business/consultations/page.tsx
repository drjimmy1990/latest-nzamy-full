"use client";

// Beta honesty gate (owner decision ٤, WP-6 B-6). «استشاراتي» listed six
// consultations as if they were this company's history.
//
// WHAT WAS REMOVED, and why:
//   - `MOCK: Consultation[]`: six consultations with invented lawyer names
//     (أ. سارة المنصور / أ. خالد الحربي / أ. نورة الشمري / أ. تركي العمر /
//     أ. محمد القحطاني / أ. عبدالله الغامدي), Hijri dates, durations, fees
//     (750 / 900 / 500 / 800 / 650) and star ratings — the ratings being the
//     worst of it, since they read as this company's own verdict on a named,
//     real-sounding lawyer.
//   - the status counters and the search box, which filtered that same array.
//
// The sidebar's «استشاراتي» points at /dashboard/client/consultation, which is
// the real path a corporate account books and reads consultations through;
// this page was a second, fictional copy of it.
//
// Withheld in the browser by `isHiddenBusinessSection` + the SectionNotReady
// guard in the business layout, but still compiled into the bundle and still
// reachable by direct link for an admin — the state owner decision ٤ forbids.
//
// The previous UI is preserved in git history.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function BusinessConsultationsPage() {
  return (
    <DashboardComingSoon
      title="استشارات المنشأة"
      description="صفحة استشارات المنشأة غير متاحة حالياً. الاستشارات وأسماء المحامين والتواريخ والأتعاب والتقييمات التي كانت تظهر هنا بيانات ثابتة لا تخص أي شركة حقيقية. استشاراتك الفعلية تظهر في «استشاراتي»."
      backHref="/dashboard/business"
    />
  );
}
