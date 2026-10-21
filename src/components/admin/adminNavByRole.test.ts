/**
 * adminNavByRole.test.ts — owner answer ٢١٠ (Task 3.4): the admin console shows
 * each staff role only its own tools.
 *
 * One table (src/lib/auth/adminNavAccess.ts) says what each admin page exists
 * to do, as a StaffAction; an item is shown when the role may do that action
 * (src/lib/auth/staffRoles.ts). Both admin navs use it: the console's own
 * sidebar (./adminNavByRole.ts, rendered by AdminSidebar.tsx) and ADMIN_SIDEBAR
 * (src/constants/navigation.sidebars.primary.ts, which SharedSidebar and
 * GlobalSearch reach through getSidebarByUserType).
 *
 * A null role (the client could not read one: before 20261019_30 runs, or any
 * read error) shows everything, today's behaviour; the server enforces the
 * real rule (requireStaff).
 *
 * RUN: npx -y node@22 --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/components/admin/adminNavByRole.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { NAV, adminNavForRole } from "./adminNavByRole.ts";
import {
  ADMIN_PAGE_ACTION,
  adminHrefVisible,
  filterNavGroupsByRole,
  staffMaySee,
} from "../../lib/auth/adminNavAccess.ts";
import { STAFF_MATRIX, type StaffRole } from "../../lib/auth/staffRoles.ts";
import { ADMIN_SIDEBAR, adminSidebarForRole } from "../../constants/navigation.sidebars.primary.ts";
import { getSidebarByUserType } from "../../constants/navigation.sidebars.ts";

type Group = { items: ReadonlyArray<{ href: string }> };

const hrefsOf = (groups: readonly Group[]): string[] => groups.flatMap((g) => g.items.map((i) => i.href));
const ROLES: StaffRole[] = ["super_admin", "operations", "auditor"];

/** The pages operations and auditor must never be offered (the brief's list). */
const SUPER_ONLY = [
  "/dashboard/admin/settings",
  "/dashboard/admin/team",
  "/dashboard/admin/pricing",
  "/dashboard/admin/users/roles",
];

// ─── The console's own sidebar (AdminSidebar.tsx) ─────────────────────────────

test("super_admin sees all 32 items of the console sidebar", () => {
  const all = hrefsOf(NAV);
  assert.equal(all.length, 32, "the console sidebar has 32 items");
  assert.equal(new Set(all).size, all.length, "no href is listed twice");
  assert.deepEqual(adminNavForRole("super_admin"), NAV);
});

test("a null role (not readable yet) sees every item: today's behaviour", () => {
  assert.deepEqual(adminNavForRole(null), NAV);
});

test("operations sees no settings, team or pricing items", () => {
  const seen = hrefsOf(adminNavForRole("operations"));
  for (const href of SUPER_ONLY) assert.equal(seen.includes(href), false, href);
  for (const href of [
    "/dashboard/admin/system",
    "/dashboard/admin/features",
    "/dashboard/admin/subscriptions/coupons",
    "/dashboard/admin/entitlements",
    "/dashboard/admin/broadcasts",
    "/dashboard/admin/library-invitations",
  ]) {
    assert.equal(seen.includes(href), false, `${href} is a super_admin tool`);
  }
});

test("operations keeps its own day-to-day tools and the read pages", () => {
  const seen = hrefsOf(adminNavForRole("operations"));
  for (const href of [
    "/dashboard/admin",
    "/dashboard/admin/users",
    "/dashboard/admin/provider-verification",
    "/dashboard/admin/provider-verification/firms",
    "/dashboard/admin/entitlements/requests",
    "/dashboard/admin/service-orders",
    "/dashboard/admin/tickets",
    "/dashboard/admin/feature-requests",
    "/dashboard/admin/library-issue-reports",
    "/dashboard/admin/community/moderation",
    "/dashboard/admin/community/reports",
    "/dashboard/admin/marketplace/orders",
    "/dashboard/admin/audit-log",
  ]) {
    assert.ok(seen.includes(href), href);
  }
});

test("auditor sees no write pages: only the read items", () => {
  const seen = hrefsOf(adminNavForRole("auditor"));
  const reads = hrefsOf(NAV).filter((h) => ["read", "payments.read"].includes(ADMIN_PAGE_ACTION[h]));
  assert.deepEqual(seen, reads);
  assert.ok(seen.length > 0, "the auditor still has pages to read");
  for (const href of seen) assert.ok(["read", "payments.read"].includes(ADMIN_PAGE_ACTION[href]), href);
  for (const href of [...SUPER_ONLY, "/dashboard/admin/tickets", "/dashboard/admin/provider-verification"]) {
    assert.equal(seen.includes(href), false, href);
  }
});

test("each role sees exactly the items whose action its matrix row holds", () => {
  for (const role of ROLES) {
    const expected = hrefsOf(NAV).filter((h) => STAFF_MATRIX[role].has(ADMIN_PAGE_ACTION[h]));
    assert.deepEqual(hrefsOf(adminNavForRole(role)), expected, role);
  }
});

test("a section left with no item is dropped, not rendered empty", () => {
  for (const role of ROLES) {
    for (const group of adminNavForRole(role)) assert.ok(group.items.length > 0, `${role}: ${group.section}`);
  }
  const filtered = filterNavGroupsByRole([{ title: "write only", items: [{ href: "/dashboard/admin/settings" }] }], "auditor");
  assert.deepEqual(filtered, [], "an emptied section disappears");
});

test("the filter never changes the source nav", () => {
  const before = JSON.stringify(hrefsOf(NAV));
  adminNavForRole("auditor");
  adminNavForRole("operations");
  assert.equal(JSON.stringify(hrefsOf(NAV)), before);
});

// ─── The classification table ─────────────────────────────────────────────────

test("every admin href in both navs is classified (a new item cannot default open)", () => {
  const admin = [...hrefsOf(NAV), ...hrefsOf(ADMIN_SIDEBAR)].filter((h) => h.startsWith("/dashboard/admin"));
  const missing = [...new Set(admin)].filter((h) => !Object.hasOwn(ADMIN_PAGE_ACTION, h));
  assert.deepEqual(missing, [], "add each new admin page to ADMIN_PAGE_ACTION");
});

test("every classified action is one the matrix knows", () => {
  for (const [href, action] of Object.entries(ADMIN_PAGE_ACTION)) {
    assert.ok(STAFF_MATRIX.super_admin.has(action), `${href}: ${action}`);
  }
});

test("an unclassified admin page is for super admins only; a page outside the console is for everyone", () => {
  assert.equal(adminHrefVisible("/dashboard/admin/brand-new-tool", "super_admin"), true);
  assert.equal(adminHrefVisible("/dashboard/admin/brand-new-tool", "operations"), false);
  assert.equal(adminHrefVisible("/dashboard/admin/brand-new-tool", "auditor"), false);
  assert.equal(adminHrefVisible("/dashboard/admin/brand-new-tool", null), true);
  for (const role of [...ROLES, null]) assert.equal(adminHrefVisible("/settings", role), true, String(role));
  // a prototype key is not a classification
  assert.equal(adminHrefVisible("/dashboard/admin/constructor", "operations"), false);
});

test("staffMaySee: a null role may see everything; a known role follows the matrix", () => {
  assert.equal(staffMaySee(null, "users.delete"), true);
  assert.equal(staffMaySee(undefined, "users.delete"), true);
  assert.equal(staffMaySee("super_admin", "users.delete"), true);
  assert.equal(staffMaySee("operations", "users.delete"), false);
  assert.equal(staffMaySee("auditor", "users.delete"), false);
  assert.equal(staffMaySee("operations", "tickets.manage"), true);
  assert.equal(staffMaySee("auditor", "read"), true);
});

test("filterNavGroupsByRole keeps the group's own fields", () => {
  const groups = [
    { title: "A", items: [{ href: "/dashboard/admin/settings", label: "s" }, { href: "/dashboard/admin", label: "o" }] },
    { title: "B", items: [{ href: "/dashboard/admin/team", label: "t" }] },
  ];
  assert.deepEqual(filterNavGroupsByRole(groups, "operations"), [
    { title: "A", items: [{ href: "/dashboard/admin", label: "o" }] },
  ]);
});

// ─── ADMIN_SIDEBAR (SharedSidebar / GlobalSearch) ─────────────────────────────

test("ADMIN_SIDEBAR: super_admin and a null role see all 35 items", () => {
  assert.equal(hrefsOf(ADMIN_SIDEBAR).length, 35, "ADMIN_SIDEBAR has 35 items");
  assert.deepEqual(adminSidebarForRole("super_admin"), ADMIN_SIDEBAR);
  assert.deepEqual(adminSidebarForRole(null), ADMIN_SIDEBAR);
});

test("ADMIN_SIDEBAR: operations sees no settings, team, roles or pricing item; the personal /settings stays", () => {
  const seen = hrefsOf(adminSidebarForRole("operations"));
  for (const href of SUPER_ONLY) assert.equal(seen.includes(href), false, href);
  assert.ok(seen.includes("/settings"), "the admin's own account settings are not an admin tool");
  assert.ok(seen.includes("/dashboard/admin/tickets"));
});

test("ADMIN_SIDEBAR: auditor sees only read pages (plus the personal /settings)", () => {
  for (const href of hrefsOf(adminSidebarForRole("auditor"))) {
    if (href === "/settings") continue;
    assert.ok(["read","payments.read"].includes(ADMIN_PAGE_ACTION[href]), href);
  }
  for (const group of adminSidebarForRole("auditor")) assert.ok(group.items.length > 0);
});

test("getSidebarByUserType hands an admin's staff role to the filter", () => {
  const sidebar = (role: StaffRole | null | undefined) =>
    hrefsOf(getSidebarByUserType("admin", "full", null, [], null, null, null, false, "SA", null, role));
  assert.equal(sidebar("operations").includes("/dashboard/admin/pricing"), false);
  assert.equal(sidebar("auditor").includes("/dashboard/admin/tickets"), false);
  assert.ok(sidebar("super_admin").includes("/dashboard/admin/pricing"));
  assert.ok(sidebar(null).includes("/dashboard/admin/pricing"), "null: today's full nav");
  assert.ok(sidebar(undefined).includes("/dashboard/admin/pricing"), "an older caller without the argument: today's full nav");
});
