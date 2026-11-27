/**
 * navigation.officeLock.ts — owner ق٢٦-١ (package 2026-11-26): a paid office
 * tool shows 🔒 in the sidebar of an account on the free side, and its click
 * opens the upgrade path (UpgradeModal → /pricing, the account's own plans)
 * instead of the tool.
 *
 * "Paid" is owner س٢١٢ (25 Nov, src/lib/auth/officePlan.ts): «إدارة المكتب» —
 * cases and clients, contracts, hearings and deadlines, shared documents and
 * the vault, finance and reports, the team. "On the free side" is the
 * database's answer, public.my_office_features_locked() (20261206_70): a
 * lawyer or firm account, or an active firm member, with no paid plan of his
 * own, no founder seat and no paid firm. Only a `true` answer locks; loading,
 * an error or any other value locks nothing (the server gates stay the
 * enforcement: officePlanRefusal() and the database caps).
 *
 * The lock is on the MENU ROW, not the page: the pages stay readable (reads
 * were never gated — a lawyer's market-claimed cases and his letterhead,
 * which lives in the vault's branding tab, must stay reachable), so the
 * dialog also offers «فتح الصفحة». The 17-page guard of ق٢٦-٤ is a later
 * wave.
 *
 * Not locked on purpose (free under ق٢٦-٤ / ق٢٦-٥): the home page, the
 * profile, consultations and messages from the market, the marketplace, the
 * reviews, «مهامي» (ق٢٦-٤ makes the personal task list free — the server
 * still refuses a new task on the free side until that wave), the AI history,
 * the AI tools (points), the library, the firm's wallet, profile and
 * settings.
 *
 * Pure: type-only imports, so node --test loads it.
 */
import type { SidebarGroup, SidebarItem } from "./navigation.types";

/** The lawyer's «إدارة المكتب» rows (ق٢٦-٤ locked list, as the menu links them). */
export const LAWYER_OFFICE_HREFS: readonly string[] = Object.freeze([
  "/dashboard/lawyer/hearings",
  "/dashboard/lawyer/cases",
  "/dashboard/lawyer/graph",
  "/dashboard/lawyer/activity",
  "/dashboard/lawyer/clients",
  "/dashboard/lawyer/contracts",
  "/dashboard/lawyer/documents",
  "/dashboard/lawyer/vault",
  "/dashboard/lawyer/finance",
]);

/** The firm's paid rows (ق٢٦-٥: everything but the market, wallet, profile and settings). */
export const FIRM_OFFICE_HREFS: readonly string[] = Object.freeze([
  "/dashboard/firm/cases",
  "/dashboard/firm/graph",
  "/dashboard/firm/hearings",
  "/dashboard/firm/activity",
  "/dashboard/firm/contracts",
  "/dashboard/firm/vault?tab=branding",
  "/dashboard/firm/clients",
  "/dashboard/firm/team",
  "/dashboard/firm/team/roles",
  "/dashboard/firm/departments/permissions",
  "/dashboard/firm/governance?tab=matrix",
  "/dashboard/firm/finance",
  "/dashboard/firm/fees",
  "/dashboard/firm/secondment/new",
]);

export type OfficeLockAudience = "lawyer" | "firm";

const OFFICE_HREFS: Readonly<Record<OfficeLockAudience, ReadonlySet<string>>> = Object.freeze({
  lawyer: new Set(LAWYER_OFFICE_HREFS),
  firm: new Set(FIRM_OFFICE_HREFS),
});

/** The badge beside a locked row: the plan that opens it. */
export const OFFICE_LOCK_BADGE_AR: Readonly<Record<OfficeLockAudience, string>> = Object.freeze({
  lawyer: "إدارة المكتب",
  firm: "باقة المكتب",
});

/** The menu type → whose office plan its rows belong to (null: no office lock in this menu). */
export function officeLockAudience(menuUserType: string | null | undefined): OfficeLockAudience | null {
  return menuUserType === "lawyer" || menuUserType === "firm" ? menuUserType : null;
}

/**
 * Marks the paid office rows `officeLocked` when (and only when) the database
 * said this account is on the free side (`locked === true`). Returns the same
 * array when nothing is marked.
 */
export function withOfficeLocks(
  groups: SidebarGroup[],
  locked: boolean | null | undefined,
  audience: OfficeLockAudience | null,
): SidebarGroup[] {
  if (locked !== true || !audience) return groups;
  const hrefs = OFFICE_HREFS[audience];
  let changed = false;
  const out = groups.map((group) => {
    if (!group.items.some((i) => hrefs.has(i.href))) return group;
    changed = true;
    return {
      ...group,
      items: group.items.map((item): SidebarItem => (hrefs.has(item.href) ? { ...item, officeLocked: audience } : item)),
    };
  });
  return changed ? out : groups;
}
