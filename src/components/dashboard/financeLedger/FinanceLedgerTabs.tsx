"use client";

/**
 * FinanceLedgerTabs — «الوقت» · «الأمانات» · «المصروفات» (owner TODO F3/F4,
 * l6-ledger) for a finance page, with the «بيان أتعاب» link.
 *
 *   <FinanceLedgerTabs isDark statementHref=… />   its own tab bar (firm finance)
 *   <LedgerTabBody kind="time" … />                 one tab's content, for a page
 *                                                   that already has a tab bar
 *                                                   (the lawyer finance page)
 */

import { useState } from "react";
import Link from "next/link";
import { Clock, Vault, Receipt, FileText } from "@phosphor-icons/react";
import TimeEntriesPanel from "./TimeEntriesPanel";
import TrustPanel from "./TrustPanel";
import ExpensesPanel from "./ExpensesPanel";
import { themeCls } from "./financeLedgerUi";

export type LedgerKind = "time" | "trust" | "expenses";

export const LEDGER_TABS: { key: LedgerKind; label: string; icon: typeof Clock }[] = [
  { key: "time", label: "الوقت", icon: Clock },
  { key: "trust", label: "الأمانات", icon: Vault },
  { key: "expenses", label: "المصروفات", icon: Receipt },
];

export function LedgerTabBody({ kind, isDark, statementHref }: { kind: LedgerKind; isDark: boolean; statementHref: string }) {
  const t = themeCls(isDark);
  return (
    <div className="space-y-3" dir="rtl">
      {kind !== "trust" && (
        <div className="flex justify-end">
          <Link href={statementHref} className={t.ghost}><FileText size={14} /> بيان أتعاب من الوقت والمصروفات</Link>
        </div>
      )}
      {kind === "time" && <TimeEntriesPanel isDark={isDark} />}
      {kind === "trust" && <TrustPanel isDark={isDark} />}
      {kind === "expenses" && <ExpensesPanel isDark={isDark} />}
    </div>
  );
}

export default function FinanceLedgerTabs({ isDark, statementHref }: { isDark: boolean; statementHref: string }) {
  const [tab, setTab] = useState<LedgerKind>("time");
  return (
    <div className="space-y-3" dir="rtl">
      <div role="tablist" className={`flex gap-1 rounded-2xl p-1 ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>
        {LEDGER_TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-bold transition-colors ${
              tab === key
                ? isDark ? "bg-zinc-800 text-[#C8A762]" : "bg-white text-[#0B3D2E] shadow-sm"
                : isDark ? "text-zinc-400 hover:text-zinc-200" : "text-slate-500 hover:text-slate-700"
            }`}>
            <Icon size={15} weight={tab === key ? "fill" : "regular"} /> {label}
          </button>
        ))}
      </div>
      <LedgerTabBody kind={tab} isDark={isDark} statementHref={statementHref} />
    </div>
  );
}
