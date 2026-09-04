"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import ConsultationDetail from "../../_components/consultations/ConsultationDetail";

/**
 * Consultation detail (lawyer view).
 *
 * Previously a hard-coded «قريباً» stub (DashboardComingSoon) — Phase 3 gave
 * this screen a real backend (lawyerConsultationsService, the
 * /api/v1/lawyer/consultations/* routes), so it now reads and acts on the
 * real row through ConsultationDetail.
 */
export default function ConsultationDetailPage() {
  const { isDark } = useTheme();
  const params = useParams();
  const consultationId = params.id as string;

  return (
    <div className="max-w-[900px] mx-auto pt-1" dir="rtl">
      <Link
        href="/dashboard/lawyer/consultations"
        className={`inline-flex items-center gap-1 mb-3 text-[12px] font-semibold ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-royal"}`}
      >
        <CaretLeft size={12} /> الاستشارات
      </Link>
      <ConsultationDetail consultationId={consultationId} isDark={isDark} basePath="/dashboard/lawyer" />
    </div>
  );
}
