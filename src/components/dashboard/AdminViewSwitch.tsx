"use client";

/**
 * AdminViewSwitch — the admin's fixed «عرض كـ» bar (owner NOTE-22-C02;
 * S6-T16, slice A §6.1.2).
 *
 * Pinned at the top of both admin-reachable shells: SharedSidebar (every role
 * dashboard) and AdminSidebar (the console). Rendered ONLY when the REAL role
 * is admin — never from the view being shown — so no other account ever sees
 * it and the switch can never be the thing that grants a view.
 *
 * A grouped list of every role and sub-role (ADMIN_SWITCH_OPTIONS) and a
 * two-state toggle: «تجاوز الأدمن» (the admin passes the dashboards' UI
 * gates, the default) or «محاكاة القيود» (the admin sees the gates the chosen
 * account would). Both write this tab's sessionStorage only (preflight R27):
 * every role layout already admits "admin" in its UserTypeGuard, and
 * src/proxy.ts and every API route keep reading the real role — the server
 * treats the admin as admin and points are not debited, as the caption says.
 */
import { usePathname, useRouter } from "next/navigation";
import { ArrowsLeftRight } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { setAdminView } from "@/hooks/useAdminView";
import { setAdminSimulation, useAdminSimulation } from "@/hooks/useAdminSimulation";
import {
  ADMIN_SWITCH_OPTIONS,
  isUnderHref,
  switchOptionFor,
  type AdminSimMode,
  type AdminSimulation,
  type AdminSwitchGroup,
} from "@/lib/nav/adminSimulation";
import type { AdminView } from "@/lib/nav/shellContext";

const GROUPS: readonly AdminSwitchGroup[] = ["المهنيون", "العملاء", "الجهات", "الإدارة"];

const MODES: ReadonlyArray<{ mode: AdminSimMode; label: string; labelEn: string }> = [
  { mode: "override", label: "تجاوز الأدمن", labelEn: "Admin override" },
  { mode: "simulate", label: "محاكاة القيود", labelEn: "Simulate limits" },
];

export function AdminViewSwitch({
  current,
  tone,
  isAr = true,
}: {
  /** The view this shell is drawing right now; null when no menu type is drawn. */
  current: AdminView | null;
  /** "console" = the always-dark admin console; "auto" = follows the site theme. */
  tone: "console" | "auto";
  isAr?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { userType, loading } = useUser();
  const sim = useAdminSimulation(!loading && userType === "admin");
  if (loading || userType !== "admin") return null;

  const mode: AdminSimMode = sim?.mode ?? "override";
  const selected = switchOptionFor(current, sim);

  const dark = tone === "console";
  const wrap = dark
    ? "border-white/[0.06] bg-white/[0.03]"
    : "border-slate-200 bg-slate-50 dark:border-white/[0.06] dark:bg-white/[0.03]";
  const caption = dark ? "text-zinc-500" : "text-slate-500 dark:text-zinc-500";
  const field = dark
    ? "border-white/[0.08] bg-zinc-900 text-zinc-300"
    : "border-slate-200 bg-white text-slate-700 dark:border-white/[0.08] dark:bg-zinc-900 dark:text-zinc-300";

  const choose = (id: string) => {
    const opt = ADMIN_SWITCH_OPTIONS.find((o) => o.id === id);
    if (!opt) return;
    setAdminView(opt.sim.view);
    setAdminSimulation({ ...opt.sim, mode });
    if (!isUnderHref(pathname, opt.href)) router.push(opt.href);
  };

  const setMode = (next: AdminSimMode) => {
    // The entry shown selected keeps its sub-role; only the mode changes.
    const base: Omit<AdminSimulation, "mode"> = selected?.sim ?? sim ?? { view: current ?? "admin" };
    const { view, practiceKind, affiliationRole, governmentRole } = base;
    setAdminSimulation({ view, practiceKind, affiliationRole, governmentRole, mode: next });
  };

  return (
    <div
      role="group"
      aria-label={isAr ? "عرض المنصة كـ" : "View the platform as"}
      className={`mx-3 my-2 rounded-xl border p-1.5 ${wrap}`}
      dir="rtl"
      data-testid="admin-view-switch"
    >
      <label
        htmlFor="admin-view-switch-select"
        className={`flex items-center gap-1 px-1 pb-1 text-[10px] font-semibold ${caption}`}
      >
        <ArrowsLeftRight size={11} />
        <span>{isAr ? "عرض كـ" : "View as"}</span>
      </label>
      <select
        id="admin-view-switch-select"
        value={selected?.id ?? ""}
        onChange={(e) => choose(e.target.value)}
        className={`w-full rounded-lg border px-2 py-1.5 text-[11px] font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal dark:focus-visible:ring-gold ${field}`}
      >
        {!selected && <option value="" disabled>{isAr ? "اختر عرضًا" : "Choose a view"}</option>}
        {GROUPS.map((group) => (
          <optgroup key={group} label={group}>
            {ADMIN_SWITCH_OPTIONS.filter((o) => o.group === group).map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className="mt-1 grid grid-cols-2 gap-1" role="group" aria-label={isAr ? "وضع العرض" : "View mode"}>
        {MODES.map((m) => {
          const active = m.mode === mode;
          const cls = active
            ? "bg-royal text-white"
            : dark
              ? "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
              : "text-slate-600 hover:bg-white hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white";
          return (
            <button
              key={m.mode}
              type="button"
              aria-pressed={active}
              onClick={() => { if (!active) setMode(m.mode); }}
              className={`rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal dark:focus-visible:ring-gold ${cls}`}
            >
              {isAr ? m.label : m.labelEn}
            </button>
          );
        })}
      </div>
      <p className={`px-1 pt-1 text-[9px] ${caption}`}>
        {isAr
          ? "يغيّر القوائم والعرض فقط — الخادم يعاملك كأدمن ولا تُخصم نقاطك"
          : "Changes menus and display only — the server treats you as admin and no points are debited"}
      </p>
    </div>
  );
}
