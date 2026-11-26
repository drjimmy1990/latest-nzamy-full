"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LockSimple } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { adminPageAllowed } from "@/lib/auth/adminNavAccess";

/**
 * l16 (C33): the console's per-page staff-role guard. The nav already hides a
 * page from a role that may not use it (ADMIN_PAGE_ACTION); this stops the
 * same page from opening by its address. A role the browser could not read
 * (null) is let through, as in the nav: the server's requireStaff on every
 * admin API is the real rule, this guard only spares the screen.
 */
export default function AdminPageGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const { staffRole } = useUser();

  if (adminPageAllowed(pathname, staffRole)) return <>{children}</>;

  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-white/[0.06] bg-zinc-900/60 p-6 text-center" dir="rtl">
      <LockSimple size={28} className="mx-auto mb-3 text-amber-400" />
      <h1 className="mb-2 text-[15px] font-bold text-white">هذه الصفحة ليست ضمن صلاحيات دورك</h1>
      <p className="mb-4 text-[12px] leading-6 text-zinc-400">
        يحدّد المشرف الرئيسي ما يراه كل عضو في فريق الإدارة. إن احتجت إليها فاطلب ذلك منه.
      </p>
      <Link href="/dashboard/admin" className="inline-block rounded-xl bg-[#0B3D2E] px-4 py-2 text-[12px] font-bold text-[#C8A762]">
        العودة إلى لوحة الإدارة
      </Link>
    </div>
  );
}
