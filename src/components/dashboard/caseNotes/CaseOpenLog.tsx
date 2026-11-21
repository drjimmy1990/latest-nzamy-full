"use client";

import { useEffect, useState } from "react";
import { Eye } from "@phosphor-icons/react";

/**
 * «سجل فتح القضية» — N16 (batch l12, 20261202_80). Inside the restricted-case
 * card: who opened this restricted case by office (the firm owner, the
 * managing partner, the platform team) and when. GET
 * /api/v1/cases/[id]/open-log answers only the case's filer or lead; for
 * anyone else (403), before the migration (available:false) or on an error
 * this renders nothing — the card above already says the case is restricted.
 */

interface Entry { openedAt: string; who: string }

const fmt = new Intl.DateTimeFormat("ar-SA-u-nu-arab", {
  timeZone: "Asia/Riyadh", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
});

export default function CaseOpenLog({ caseId, isDark }: { caseId: string; isDark: boolean }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/cases/${encodeURIComponent(caseId)}/open-log`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { available?: boolean; entries?: Entry[] } | null) => {
        if (!cancelled && body?.available === true && Array.isArray(body.entries)) setEntries(body.entries);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [caseId]);

  if (entries === null) return null;
  const muted = isDark ? "text-zinc-500" : "text-slate-500";
  const strong = isDark ? "text-zinc-300" : "text-slate-700";

  return (
    <div className={`mt-3 border-t pt-3 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
      <p className={`flex items-center gap-1.5 text-[11px] font-bold ${strong}`}>
        <Eye size={12} /> سجل فتح القضية
      </p>
      {entries.length === 0 ? (
        <p className={`mt-1 text-[10px] ${muted}`}>لم يفتحها أحد من خارج فريقها منذ تقييدها.</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {entries.map((e, i) => {
            const d = new Date(e.openedAt);
            return (
              <li key={`${e.openedAt}-${i}`} className={`text-[10px] ${muted}`}>
                <span className={strong}>{e.who}</span> — {Number.isNaN(d.getTime()) ? "—" : fmt.format(d)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
