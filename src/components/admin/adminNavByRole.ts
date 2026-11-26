/**
 * The admin console's sidebar (rendered by ./AdminSidebar.tsx) and its role
 * filter (owner answer ٢١٠, Task 3.4): each staff role is shown only its own
 * tools. Which page needs which action is src/lib/auth/adminNavAccess.ts.
 *
 * Plain .ts (no JSX, relative imports only) so `node --test` can load it
 * (./adminNavByRole.test.ts).
 */
import {
  ChartBar, Users, CreditCard, Robot, Ticket,
  Gear, Buildings,
  Scales, ShieldCheck, ClipboardText,
  Money, Megaphone, Star, Globe, BookOpen, Article,
  Storefront, ToggleRight, Flag, Tag, UsersFour, Crown, Tray, Files,
  Lightbulb, Graph, Gift, UserCirclePlus, Key, Coins,
} from "@phosphor-icons/react";
import type { StaffRole } from "../../lib/auth/staffRoles.ts";
import { filterNavGroupsByRole } from "../../lib/auth/adminNavAccess.ts";
import { ADMIN_NAV_SECTIONS } from "../../constants/adminNavItems.ts";

/** The icon names ADMIN_NAV_SECTIONS uses → this console's components. */
const ICONS = {
  ChartBar, Users, CreditCard, Robot, Ticket, Gear, Buildings, Scales, ShieldCheck,
  ClipboardText, Money, Megaphone, Star, Globe, BookOpen, Article, Storefront,
  ToggleRight, Flag, Tag, UsersFour, Crown, Tray, Files, Lightbulb, Gift,
  UserCirclePlus, Key, Coins, TreeStructure: Graph,
} as const;

type IconComponent = (typeof ICONS)[keyof typeof ICONS];

/**
 * l16 (C23): the icon names this console can draw. An item whose icon is not
 * here silently falls back to ChartBar (the old «شركات المحاماة» row asked for
 * «Gavel», which was never imported); adminNavByRole.test.ts checks every item.
 */
export const ADMIN_NAV_ICON_NAMES: readonly string[] = Object.freeze(Object.keys(ICONS));

/**
 * The console's sidebar, built from the ONE admin list (src/constants/
 * adminNavItems.ts, file 15 row 54): ADMIN_SIDEBAR is built from the same
 * list, so the two can no longer disagree.
 */
export const NAV: ReadonlyArray<{
  section: string;
  items: ReadonlyArray<{ href: string; icon: IconComponent; label: string; exact?: boolean }>;
}> = ADMIN_NAV_SECTIONS.map((s) => ({
  section: s.section,
  items: s.items.map((i) => ({
    href: i.href,
    icon: (ICONS as Record<string, IconComponent>)[i.icon] ?? ChartBar,
    label: i.label,
    ...(i.exact ? { exact: true } : {}),
  })),
}));

/**
 * The console sidebar for one staff role. super_admin, and a null role (not
 * readable in the browser — the server still enforces), get every item;
 * operations and auditor get only the pages their matrix row allows, and a
 * section left empty is dropped.
 */
export function adminNavForRole(role: StaffRole | null): typeof NAV {
  return filterNavGroupsByRole(NAV, role);
}
