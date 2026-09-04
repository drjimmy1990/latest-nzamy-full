"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import ConsultationDetail from "../../../lawyer/_components/consultations/ConsultationDetail";

/**
 * Consultation detail (firm view) — rewritten 2026-09-04 (item firm-consult-ai).
 *
 * Was a full mock: hard-coded CONSULT_DATA, a fake message thread and a
 * "دخول الاجتماع المرئي (Zoom)" button with no Zoom integration anywhere in
 * the codebase. Phase 3 gave the lawyer side of this screen a real backend
 * (lawyerConsultationsService, /api/v1/lawyer/consultations/*), and
 * ConsultationDetail already accepts a firm basePath for exactly this reuse
 * — see its lawyer twin, src/app/dashboard/lawyer/consultations/[id]/page.tsx.
 */
export default function FirmConsultationDetailPage() {
  const { isDark } = useTheme();
  const params = useParams();
  const consultationId = params.id as string;

  return (
    <div className="max-w-[900px] mx-auto pt-1" dir="rtl">
      <Link
        href="/dashboard/firm/consultations"
        className={`inline-flex items-center gap-1 mb-3 text-[12px] font-semibold ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-royal"}`}
      >
        <CaretLeft size={12} /> الاستشارات
      </Link>
      <ConsultationDetail consultationId={consultationId} isDark={isDark} basePath="/dashboard/firm" />
    </div>
  );
}
