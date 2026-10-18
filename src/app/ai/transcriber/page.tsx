"use client";

// «المفرّغ الذكي» — honesty gate (owner answer ١١٥).
//
// WHAT THIS PAGE WAS: a purpose picker, a mode switch and an upload box. The
// file was never read: after a timed progress bar the page showed one of two
// fixed texts — a "verbatim transcript" of a labour hearing with time stamps
// and three speakers, or a "legal extraction" of the same hearing citing
// articles of نظام العمل. Legal mode sat behind BetaReviewGate (legal-data
// scope); verbatim mode was force-shown to everyone, which is why the audit
// named it. Both were constants, so the whole tool is gated, not one mode.
//
// The catalog row in lawyerAiCatalog.ts carries `comingSoon` (hub badge
// «قريباً»), and the nav rows carry the same badge. The previous UI is one
// `git show` away when a real transcription service exists.

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

export default function TranscriberPage() {
  return (
    <DashboardComingSoon
      title="المفرّغ الذكي"
      description="المفرّغ الذكي غير متاح حالياً وسيُفعَّل قريباً. كان التفريغ والاستخلاص المعروضان هنا نصاً ثابتاً لا يمثّل الملف المرفوع، لذلك أُوقفت الأداة إلى أن تُربط بخدمة تفريغ حقيقية."
      backHref="/ai"
    />
  );
}
