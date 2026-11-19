"use client";

import Link from "next/link";
import { Coins, Lock } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { LIBRARY_TOPUP_LABEL_AR, libraryPointsLockedMessageAr } from "@/lib/library/pointsGate";
import type { LibraryPointsLockState } from "@/hooks/useLibraryStatus";

/**
 * Register 14 item 48 (batch l9, file 16 §9.1): a library subscriber whose
 * points balance is below library_min_points_to_browse (50). The server
 * already serves him what a visitor reads (previews only); this banner says
 * why — the owner's sentence «رصيدك أقل من ٥٠ نقطة؛ اشحن لتستمر في المكتبة» —
 * with the top-up button. The library opens again the moment the balance is
 * back at the minimum (the status is re-read every minute and on each page).
 */
export default function LibraryPointsLockBanner({ lock }: { lock: LibraryPointsLockState }) {
  const { isDark } = useTheme();
  return (
    <div
      dir="rtl"
      role="status"
      data-library-points-lock
      className={`mx-auto mt-3 flex max-w-5xl flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
        isDark ? "border-[#C8A762]/30 bg-[#C8A762]/10 text-amber-100" : "border-amber-300 bg-amber-50 text-amber-900"
      }`}
    >
      <Lock size={18} weight="bold" className="shrink-0" />
      <p className="min-w-0 flex-1 leading-relaxed font-semibold">
        {lock.message || libraryPointsLockedMessageAr(lock.minPoints)}
      </p>
      <Link
        href={lock.topupHref}
        className="inline-flex items-center gap-2 rounded-xl bg-[#C8A762] px-4 py-2 text-sm font-bold text-white transition-all hover:bg-[#b8964f]"
      >
        <Coins size={16} weight="bold" />
        {LIBRARY_TOPUP_LABEL_AR}
      </Link>
    </div>
  );
}
