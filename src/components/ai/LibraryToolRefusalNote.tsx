"use client";

import Link from "next/link";
import type { LibraryToolRefusal } from "@/lib/ai/libraryToolRefusal";

/**
 * The library gate's refusal on a tool page (src/lib/ai/libraryToolRefusal.ts):
 * the sentence and, for `library_tier`, the link to the plans. An alert, in the
 * place the page shows its other run errors.
 */
export default function LibraryToolRefusalNote({ refusal, isDark, className = "" }: {
  refusal: LibraryToolRefusal;
  isDark: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed ${
        isDark ? "border-amber-900/40 bg-amber-900/10 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800"
      } ${className}`}
    >
      <p>{refusal.text}</p>
      {refusal.action && (
        <Link
          href={refusal.action.href}
          className={`mt-2 inline-flex rounded-lg px-3 py-1.5 text-[11px] font-bold ${
            isDark ? "bg-[#C8A762]/15 text-[#C8A762] hover:bg-[#C8A762]/25" : "bg-[#0B3D2E] text-white hover:bg-[#0B3D2E]/90"
          }`}
        >
          {refusal.action.label}
        </Link>
      )}
    </div>
  );
}
