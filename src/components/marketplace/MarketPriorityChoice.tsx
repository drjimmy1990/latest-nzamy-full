"use client";

import { useEffect, useState } from "react";
import { OPEN_NOW_LABEL_AR, parsePriorityMinutes, parseWorkingHours, priorityDisclosureAr } from "@/lib/marketplace/marketPriority";

/**
 * Owner س٢٣ (batch l16): the disclosure on a client's request form — his
 * request goes to the Nezamy team first for N working minutes, then to every
 * verified lawyer by itself — with the choice «افتحه للجميع فوراً». The
 * choice travels as metadata.marketOpenNow; the database stamps the release
 * moment from it (20261206_40). Renders nothing while the window is 0 or the
 * SQL has not run (nothing to disclose), so it never promises what is not applied.
 */
export default function MarketPriorityChoice({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetch("/api/v1/marketplace/priority", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { minutes?: unknown; workingHours?: unknown; installed?: unknown } | null) => {
        if (!live || !body || body.installed !== true) return;
        setText(priorityDisclosureAr(parsePriorityMinutes(body.minutes), parseWorkingHours(body.workingHours)));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!text) return null;
  return (
    <div dir="rtl" className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-[12px] leading-relaxed text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300">
      <p>{text}</p>
      <label className="mt-2 flex items-center gap-2 font-bold">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        {OPEN_NOW_LABEL_AR}
      </label>
    </div>
  );
}
