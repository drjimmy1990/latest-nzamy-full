"use client";

import { useState } from "react";
import { pastedTextPreview } from "@/lib/services/orderIntake.contracts";

/**
 * «نص العقد الملصق»: the contract a client pasted instead of uploading (S2-B7),
 * on the client's order page and in the admin queue. Long text stays collapsed
 * until asked for. Renders nothing for an order without one.
 */
export default function PastedContractBlock({ text, isDark }: { text: unknown; isDark: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (typeof text !== "string" || !text.trim()) return null;
  const { shown, truncated } = pastedTextPreview(text);

  return (
    <div className={`space-y-1.5 rounded-xl border p-3 ${isDark ? "border-white/[0.07] bg-white/[0.02]" : "border-zinc-200 bg-zinc-50/70"}`}>
      <p className={`text-[11px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>نص العقد الملصق</p>
      <p dir="auto" className={`whitespace-pre-wrap break-words text-[12px] leading-[1.9] ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
        {expanded ? text : shown}
      </p>
      {truncated && (
        <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}
          className={`text-[11px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
          {expanded ? "طيّ النص" : "عرض الكل"}
        </button>
      )}
    </div>
  );
}
