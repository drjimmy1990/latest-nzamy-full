"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gift } from "@phosphor-icons/react";
import { toArabicDigits } from "@/lib/services/arabicCount";
import { useOffers } from "./useOffers";

/**
 * «العروض» in every dashboard sidebar (owner item 5), with a count badge of
 * the offers meant for this user now. Renders nothing while loading, on a
 * failed read, or when there is no offer — never an empty section.
 */
export function OffersNavItem({ isDark, enabled }: { isDark: boolean; enabled: boolean }) {
  const pathname = usePathname() ?? "";
  const reply = useOffers(enabled);
  const count = reply?.offers.length ?? 0;
  if (!reply || count === 0) return null;
  const active = pathname === "/dashboard/offers";
  return (
    <div className="px-2 pt-2">
      <Link
        href="/dashboard/offers"
        aria-label={`العروض (${toArabicDigits(count)})`}
        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal dark:focus-visible:ring-gold ${
          active
            ? isDark ? "bg-[#C8A762]/15 text-[#C8A762]" : "bg-[#0B3D2E]/[0.08] text-[#0B3D2E]"
            : isDark ? "text-zinc-300 hover:bg-white/[0.05]" : "text-slate-700 hover:bg-slate-50"
        }`}
      >
        <Gift size={16} weight="duotone" className="text-[#C8A762]" aria-hidden />
        <span>العروض</span>
        <span className="ms-auto min-w-[20px] rounded-full bg-[#C8A762] px-1.5 py-0.5 text-center text-[10px] font-bold text-[#0B3D2E]">
          {toArabicDigits(count)}
        </span>
      </Link>
    </div>
  );
}
