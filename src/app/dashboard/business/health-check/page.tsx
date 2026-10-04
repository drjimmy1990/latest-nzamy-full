"use client";

// Beta honesty gate (owner decision ٤, WP-6 B-6). «الفحص القانوني الشامل»
// showed a document-upload wizard, an analysis progress bar driven by a
// setTimeout, compliance scores, twelve legal findings and five "predictive"
// risk alerts — over documents the reader had never uploaded.
//
// WHAT WAS REMOVED, and why (the arrays live in
// src/constants/healthCheckData.ts, whose own header documents each one):
//   - MOCK_FILES — twelve filenames, which also drove the «تم تحليل N ملفاً»
//     counter, so the count described the fixture, not the reader.
//   - MOCK_FINDINGS — twelve legal findings about documents that do not exist.
//   - SCORE_BARS — five compliance percentages (68٪, 62٪, 35٪ …) drawn as this
//     company's own compliance posture.
//   - PREDICTIVE_INSIGHTS — five named risks with probabilities and monetary
//     exposure. A company acting on «٣٥٪ خطر …» would have been acting on a
//     literal in a constants file.
//   - the fake AI analysis timer, which made all of the above look computed.
//
// No analysis pipeline exists behind any of it. The constants file is left in
// place and untouched — it is somebody else's file and other work packages
// reference its header — but nothing in the compiled business bundle imports
// it any more, which is what owner decision ٤ asks for.
//
// The previous UI is preserved in git history.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function BusinessHealthCheckPage() {
  return (
    <DashboardComingSoon
      title="الفحص القانوني الشامل"
      description="الفحص القانوني الشامل غير متاح حالياً. الملفات والنتائج ونِسَب الالتزام وتنبيهات المخاطر التي كانت تظهر هنا بيانات ثابتة لا تخص أي شركة حقيقية، ولم يكن خلفها أي تحليل فعلي لمستنداتك. ستُفعَّل الصفحة عند وجود محرّك تحليل حقيقي يقرأ وثائق منشأتك."
      backHref="/dashboard/business"
    />
  );
}
