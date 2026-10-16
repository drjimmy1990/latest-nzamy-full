"use client";

/**
 * «بيانات المنشأة» — /dashboard/business/company.
 *
 * Owner decision ٣٦: the company data is edited by the owner account or a
 * delegate registered in «سجل التفويضات». The settings tab
 * (/settings?tab=entity) reaches only corporate-type accounts, and a corporate
 * account always resolves as the owner of its OWN company; a delegate is a
 * company member — usually an individual or lawyer account — so the power needs
 * a home inside the company dashboard, which an active member can open.
 *
 * Same form as the settings tab (EntitySettingsTab), pointed at
 * /api/v1/business/profile and fixed to the company's fields. The server says
 * who may save: owner and delegate edit; a plain member reads.
 */

import Link from "next/link";
import { Handshake, ArrowLeft } from "@phosphor-icons/react";
import { EntitySettingsTab } from "@/app/settings/components/tabs/EntitySettingsTab";

export default function BusinessCompanyDataPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          يعدّل هذه البيانات مالك الحساب أو من فوّضه في سجل التفويضات.
        </p>
        <Link
          href="/dashboard/business/delegations"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B3D2E] dark:text-emerald-400 hover:underline"
        >
          <Handshake size={14} /> سجل التفويضات <ArrowLeft size={12} />
        </Link>
      </div>
      <EntitySettingsTab endpoint="/api/v1/business/profile" entityType="corporate" />
    </div>
  );
}
