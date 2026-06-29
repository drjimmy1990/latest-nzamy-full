"use client";

import DashboardComingSoon from "@/components/ui/DashboardComingSoon";

/**
 * Consultation detail (lawyer view).
 *
 * This page previously rendered a fully mock screen (hardcoded MOCK map,
 * local-only state, setTimeout saveNotes). There is no dedicated
 * consultation-detail backend yet, so — rather than fabricate data — we gate
 * the page behind an honest "قريباً" coming-soon state.
 */
export default function ConsultationDetailPage({ params: _params }: { params: { id: string } }) {
  return (
    <DashboardComingSoon
      title="تفاصيل الاستشارة"
      description="هذه الميزة قيد التطوير وستكون متاحة قريباً. لا توجد بيانات حقيقية لعرضها بعد."
      backHref="/dashboard/lawyer/consultations"
    />
  );
}