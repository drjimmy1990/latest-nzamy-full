"use client";

/**
 * CaseTimeExpensesSection — «الوقت والمصروفات» on a case page (owner TODO
 * F3/F4, l6-ledger): this case's time entries and expenses, their totals, a
 * quick add, and the case's fee statement. Self-contained: one import and one
 * line in each case page.
 */

import Link from "next/link";
import { FileText, Coins } from "@phosphor-icons/react";
import TimeEntriesPanel from "./TimeEntriesPanel";
import ExpensesPanel from "./ExpensesPanel";
import { themeCls } from "./financeLedgerUi";

export default function CaseTimeExpensesSection({
  caseId, isDark, statementBase,
}: { caseId: string; isDark: boolean; statementBase: string }) {
  const t = themeCls(isDark);
  return (
    <section className="space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={`flex items-center gap-2 text-sm font-bold ${t.title}`}>
          <Coins size={15} className="text-[#C8A762]" /> الوقت والمصروفات
        </h2>
        <Link href={`${statementBase}?caseId=${encodeURIComponent(caseId)}`} className={t.ghost}>
          <FileText size={14} /> بيان أتعاب القضية
        </Link>
      </div>
      <p className={`text-[11px] ${t.muted}`}>
        تظهر هنا قيودك أنت؛ ويرى مالك المكتب والشركاء والمدير المالي قيود المكتب كلها على هذه القضية.
      </p>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <TimeEntriesPanel isDark={isDark} caseId={caseId} compact />
        <ExpensesPanel isDark={isDark} caseId={caseId} compact />
      </div>
    </section>
  );
}
