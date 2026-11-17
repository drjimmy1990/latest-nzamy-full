"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Books } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { dashboardPathFor } from "@/lib/auth/userTypes";

/**
 * N02-8 (owner package 13 Nov): a lawyer or a firm member who opens the
 * library from his dashboard had no way back except the browser's button.
 * A slim bar above the library pages links back to his own dashboard.
 *
 * N02-9 / P1-11: the same bar carries «مكتبتي» (/laws/my — folders, notes,
 * reading history, subscription, devices) for EVERY signed-in account; the
 * dashboard link stays lawyer/firm only. Guests see nothing.
 */
export default function LibraryDashboardBar() {
  const user = useUser();
  const pathname = usePathname();
  if (user.loading || !user.isLoggedIn) return null;
  const dashboardHref =
    user.userType === "lawyer" || user.userType === "firm" ? dashboardPathFor(user.userType) : null;
  const onMyLibrary = pathname === "/laws/my";
  return (
    <div dir="rtl" className="border-b border-[#C8A762]/20 bg-[#0B3D2E] text-white">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-1.5">
        {dashboardHref ? (
          <Link
            href={dashboardHref}
            className="inline-flex items-center gap-1.5 text-[12px] font-bold text-white/90 hover:text-white"
          >
            <ArrowRight size={13} weight="bold" aria-hidden />
            العودة إلى لوحة التحكم
          </Link>
        ) : <span />}
        <Link
          href="/laws/my"
          aria-current={onMyLibrary ? "page" : undefined}
          className={`inline-flex items-center gap-1.5 text-[12px] font-bold hover:text-white ${onMyLibrary ? "text-[#C8A762]" : "text-white/90"}`}
        >
          <Books size={13} weight="fill" aria-hidden />
          مكتبتي
        </Link>
      </div>
    </div>
  );
}
