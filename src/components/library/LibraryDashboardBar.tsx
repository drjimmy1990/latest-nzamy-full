"use client";

import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { dashboardPathFor } from "@/lib/auth/userTypes";

/**
 * N02-8 (owner package 13 Nov): a lawyer or a firm member who opens the
 * library from his dashboard had no way back except the browser's button.
 * A slim bar above the library pages links back to his own dashboard. Guests
 * and other account types see nothing.
 */
export default function LibraryDashboardBar() {
  const user = useUser();
  if (user.loading || !user.isLoggedIn) return null;
  if (user.userType !== "lawyer" && user.userType !== "firm") return null;
  return (
    <div dir="rtl" className="border-b border-[#C8A762]/20 bg-[#0B3D2E] text-white">
      <div className="mx-auto max-w-[1200px] px-4 py-1.5">
        <Link
          href={dashboardPathFor(user.userType)}
          className="inline-flex items-center gap-1.5 text-[12px] font-bold text-white/90 hover:text-white"
        >
          <ArrowRight size={13} weight="bold" aria-hidden />
          العودة إلى لوحة التحكم
        </Link>
      </div>
    </div>
  );
}
