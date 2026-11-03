"use client";

/**
 * AdminViewSwitch — the admin's fixed «عرض كـ» bar (owner NOTE-22-C02).
 *
 * Pinned at the top of both admin-reachable shells: SharedSidebar (lawyer
 * mode) and AdminSidebar (the console). Rendered ONLY when the REAL role is
 * admin — never from the view being shown — so a lawyer never sees it and the
 * switch can never be the thing that grants a view.
 *
 * It changes which menu is drawn, nothing else: the lawyer layout already
 * admits "admin" in its UserTypeGuard, the admin console admits only "admin",
 * and src/proxy.ts / every API route read the real role. Hence the line under
 * the buttons: «لا يغيّر الصلاحيات».
 */
import { useRouter } from "next/navigation";
import { ArrowsLeftRight } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { setAdminView } from "@/hooks/useAdminView";
import type { AdminView } from "@/lib/nav/shellContext";

const OPTIONS: Array<{ view: AdminView; label: string; labelEn: string; href: string }> = [
  { view: "lawyer", label: "وضع المحامي", labelEn: "Lawyer mode", href: "/dashboard/lawyer" },
  { view: "admin", label: "لوحة الإدارة", labelEn: "Admin console", href: "/dashboard/admin" },
];

export function AdminViewSwitch({
  current,
  tone,
  isAr = true,
}: {
  /** The view this shell is drawing right now; null on any other dashboard (no button pressed). */
  current: AdminView | null;
  /** "console" = the always-dark admin console; "auto" = follows the site theme. */
  tone: "console" | "auto";
  isAr?: boolean;
}) {
  const router = useRouter();
  const { userType, loading } = useUser();
  if (loading || userType !== "admin") return null;

  const dark = tone === "console";
  const wrap = dark
    ? "border-white/[0.06] bg-white/[0.03]"
    : "border-slate-200 bg-slate-50 dark:border-white/[0.06] dark:bg-white/[0.03]";
  const caption = dark ? "text-zinc-500" : "text-slate-500 dark:text-zinc-500";

  return (
    <div
      role="group"
      aria-label={isAr ? "عرض المنصة كـ" : "View the platform as"}
      className={`mx-3 my-2 rounded-xl border p-1.5 ${wrap}`}
      dir="rtl"
      data-testid="admin-view-switch"
    >
      <div className={`flex items-center gap-1 px-1 pb-1 text-[10px] font-semibold ${caption}`}>
        <ArrowsLeftRight size={11} />
        <span>{isAr ? "عرض كـ" : "View as"}</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {OPTIONS.map((opt) => {
          const active = opt.view === current;
          const cls = active
            ? "bg-royal text-white"
            : dark
              ? "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
              : "text-slate-600 hover:bg-white hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white";
          return (
            <button
              key={opt.view}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setAdminView(opt.view);
                if (!active) router.push(opt.href);
              }}
              className={`rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal dark:focus-visible:ring-gold ${cls}`}
            >
              {isAr ? opt.label : opt.labelEn}
            </button>
          );
        })}
      </div>
      <p className={`px-1 pt-1 text-[9px] ${caption}`}>
        {isAr ? "يغيّر القائمة فقط — لا يغيّر الصلاحيات" : "Changes the menu only — not your permissions"}
      </p>
    </div>
  );
}
