"use client";

// «مستشار الموارد البشرية» — honesty gate (owner answer ١١٥).
//
// WHAT THIS PAGE WAS: a question box whose answer, after a timer, was always
// the same text about ending an open-ended contract — typed out letter by
// letter to look generated — plus three "labour alerts" about employees the
// platform knows nothing about. Neither read the question nor any data.
//
// The firm sidebar row and the navbar row carry «قريباً».

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function CorpHRPage() {
  return (
    <DashboardComingSoon
      title="مستشار الموارد البشرية"
      description="مستشار الموارد البشرية غير متاح حالياً وسيُفعَّل قريباً. كانت الإجابة والتنبيهات المعروضة هنا نصاً ثابتاً لا يستند إلى سؤالك ولا إلى بيانات موظفيك."
      backHref="/ai"
    />
  );
}
