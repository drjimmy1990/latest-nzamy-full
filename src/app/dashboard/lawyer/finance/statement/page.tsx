"use client";

/**
 * /dashboard/lawyer/finance/statement — «بيان أتعاب» (owner TODO F3/F4,
 * l6-ledger). ?caseId=… or ?clientId=… opens the statement at once (the link
 * from a case page).
 */

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import FeeStatementView from "@/components/dashboard/financeLedger/FeeStatementView";

function StatementPage() {
  const { isDark } = useTheme();
  const params = useSearchParams();
  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-12" dir="rtl">
      <Link href="/dashboard/lawyer/finance" className={`text-[12px] font-semibold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>← المالية</Link>
      <FeeStatementView
        isDark={isDark}
        initialCaseId={params.get("caseId") ?? undefined}
        initialClientId={params.get("clientId") ?? undefined}
        invoicesHref="/dashboard/lawyer/finance"
      />
    </div>
  );
}

export default function LawyerFeeStatementPage() {
  return (
    <Suspense fallback={null}>
      <StatementPage />
    </Suspense>
  );
}
