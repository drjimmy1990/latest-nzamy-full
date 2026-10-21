/**
 * Which admin pages each staff role is offered (owner answer ٢١٠, Task 3.4):
 * the admin console shows each role only its own tools.
 *
 * ADMIN_PAGE_ACTION says what each admin page exists to do, as a StaffAction.
 * An item is shown when the role may do that action (STAFF_MATRIX):
 *   - `read` — a page for looking (overview, revenue, the users list, the
 *     audit log…). Every role sees it; a write button on it is refused by the
 *     server, and the users list hides its delete affordance (staffMaySee).
 *   - any other action — a page that exists to do that write (settings, team,
 *     pricing, coupons, grants…). Only a role holding the action sees it.
 * So super_admin sees everything, operations its day-to-day queues plus the
 * read pages, and auditor only the read pages.
 *
 * An admin page missing from the table is shown to super admins only, so a new
 * item cannot default open (adminNavByRole.test.ts also fails until it is
 * classified). A page outside /dashboard/admin (the admin's own /settings) is
 * not an admin tool and is always shown.
 *
 * A null role means the browser could not read one — before 20261019_30 runs
 * public.staff_role() does not exist, and any read error looks the same. The
 * nav then stays as it is today (everything); the server enforces the real
 * rule (requireStaff), including "an admin with no row is an auditor".
 *
 * Both admin navs use this: src/components/admin/adminNavByRole.ts (the
 * console sidebar) and ADMIN_SIDEBAR (src/constants/navigation.sidebars.primary.ts).
 * Pure, with only a relative import, so `node --test` can load it.
 */
import { staffCan, type StaffAction, type StaffRole } from "./staffRoles.ts";

export const ADMIN_PAGE_ACTION: Readonly<Record<string, StaffAction>> = Object.freeze({
  // ── Read pages ─────────────────────────────────────────────────────────────
  "/dashboard/admin": "read",
  "/dashboard/admin/revenue": "read",
  "/dashboard/admin/users": "read",
  "/dashboard/admin/business": "read",
  "/dashboard/admin/subscriptions": "read",
  "/dashboard/admin/subscriptions/orders": "payments.read",
  "/dashboard/admin/subscriptions/payments": "read",
  "/dashboard/admin/ai-usage": "read",
  "/dashboard/admin/ai-usage/credits": "read",
  "/dashboard/admin/ai-usage/reports": "read",
  "/dashboard/admin/reviews": "read",
  "/dashboard/admin/platform": "read",
  "/dashboard/admin/audit-log": "read",
  "/dashboard/admin/reports": "read",

  // ── Operations' day-to-day queues ──────────────────────────────────────────
  "/dashboard/admin/provider-verification": "verifications.decide",
  "/dashboard/admin/provider-verification/firms": "verifications.decide",
  "/dashboard/admin/entitlements/requests": "entitlements.decide",
  "/dashboard/admin/service-orders": "orders.manage",
  "/dashboard/admin/marketplace/orders": "orders.manage",
  "/dashboard/admin/disputes": "orders.manage",
  "/dashboard/admin/tickets": "tickets.manage",
  "/dashboard/admin/feature-requests": "tickets.manage",
  "/dashboard/admin/library-issue-reports": "tickets.manage",
  "/dashboard/admin/community/moderation": "community.moderate",
  "/dashboard/admin/community/reports": "community.moderate",

  // ── Super admin tools ──────────────────────────────────────────────────────
  "/dashboard/admin/team": "staff.manage",
  "/dashboard/admin/users/roles": "staff.manage",
  "/dashboard/admin/users/new": "users.change_type",
  "/dashboard/admin/settings": "settings.write",
  "/dashboard/admin/pricing": "settings.write",
  "/dashboard/admin/features": "settings.write",
  "/dashboard/admin/security": "settings.write",
  "/dashboard/admin/system": "settings.write",
  "/dashboard/admin/system/backup": "settings.write",
  "/dashboard/admin/sector-profiles": "settings.write",
  "/dashboard/admin/subscriptions/coupons": "settings.write",
  "/dashboard/admin/content/laws": "settings.write",
  "/dashboard/admin/content/articles": "content.delete",
  "/dashboard/admin/entitlements": "entitlements.grant",
  "/dashboard/admin/library-invitations": "entitlements.grant",
  "/dashboard/admin/broadcasts": "broadcasts.send",
  "/dashboard/admin/escrow": "subscriptions.write",
  "/dashboard/admin/payouts": "subscriptions.write",
});

/** The action an unclassified admin page falls back to: super admins only. */
const UNCLASSIFIED: StaffAction = "staff.manage";

/**
 * May this role be shown a tool for this action? A null/undefined role (not
 * readable in the browser) is shown everything — the server decides.
 */
export function staffMaySee(role: StaffRole | null | undefined, action: StaffAction): boolean {
  if (role === null || role === undefined) return true;
  return staffCan(role, action);
}

/** Is this nav href shown to this role? */
export function adminHrefVisible(href: string, role: StaffRole | null | undefined): boolean {
  if (href !== "/dashboard/admin" && !href.startsWith("/dashboard/admin/")) return true;
  const action = Object.hasOwn(ADMIN_PAGE_ACTION, href) ? ADMIN_PAGE_ACTION[href] : UNCLASSIFIED;
  return staffMaySee(role, action);
}

/**
 * The groups with only the items this role is shown; a group left empty is
 * dropped. Every other field of a group and an item is kept as it is, and the
 * input is never changed.
 */
export function filterNavGroupsByRole<G extends { items: ReadonlyArray<{ href: string }> }>(
  groups: readonly G[],
  role: StaffRole | null | undefined,
): G[] {
  if (role === null || role === undefined) return [...groups];
  return groups.flatMap((group) => {
    const items = group.items.filter((item) => adminHrefVisible(item.href, role));
    if (items.length === 0) return [];
    return items.length === group.items.length ? [group] : [{ ...group, items }];
  });
}
