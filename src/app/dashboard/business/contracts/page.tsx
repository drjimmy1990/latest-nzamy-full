"use client";

/**
 * «العقود» — /dashboard/business/contracts (owner decision ٥: one of the five
 * company sections to build first).
 *
 * The real contract manager (Phase 3, `public.contracts`) as the client side
 * sees it: the same screen as «عقودي» (/dashboard/client/contracts), mounted
 * inside the company dashboard because ROUTE_ACCESS keeps /dashboard/client/*
 * for individuals except the three shared intake subtrees.
 *
 * SCOPE, said on screen: a contract reaches a client account when the lawyer
 * links its client card to that account (`contracts.client_user_id`, read by
 * GET /api/v1/client/contracts under RLS). Contracts carry no company id, so
 * there is no company-wide contract list to show — each member sees the
 * contracts linked to their own account, the owner those linked to the owner
 * account. Nothing here invents one.
 */

import { Info } from "@phosphor-icons/react";
import ClientContractsPage from "@/app/dashboard/client/contracts/page";

export default function BusinessContractsPage() {
  return (
    <div className="space-y-2" dir="rtl">
      <div className="max-w-[1300px] mx-auto px-6 md:px-8 pt-2">
        <p className="flex items-start gap-2 rounded-xl border border-gray-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-300">
          <Info size={15} className="flex-shrink-0 mt-0.5" />
          تظهر هنا العقود التي ربطها المحامي بحسابك أنت على المنصّة. العقود المرتبطة بحساب زميل في المنشأة تظهر في حسابه.
        </p>
      </div>
      <ClientContractsPage />
    </div>
  );
}
