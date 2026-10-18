/**
 * staffManagement.test.ts — owner answer ٢١٠ (Task 3.4): super admins set staff
 * roles.
 *
 * Two halves:
 *   1. The pure rules (./staffManagement.ts), executed: the three Arabic role
 *      labels, the invite's role, the last-super-admin rule.
 *   2. Source pins on the routes and pages that use them. Routes import
 *      `next/server` and the Supabase clients and pages are "use client" .tsx,
 *      so `node --test` cannot load them; comment lines are stripped first (the
 *      technique of ./adminRouteGates.test.ts).
 *
 * RUN: npx -y node@22 --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/auth/staffManagement.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_INVITE_ROLE,
  INVALID_STAFF_ROLE_AR,
  LAST_SUPER_ADMIN_AR,
  NOT_STAFF_AR,
  OWN_ROLE_AR,
  STAFF_ROLES_IN_ORDER,
  STAFF_ROLE_LABELS_AR,
  STAFF_ROLES_NOT_READY_AR,
  canRemoveSuperAdmin,
  effectiveRemovedRole,
  inviteStaffRole,
  isSameAccount,
} from "./staffManagement.ts";

const SRC = join(import.meta.dirname, "..", "..");

// ─── 1. The pure rules ────────────────────────────────────────────────────────

test("the role labels and refusals are the controller's, verbatim", () => {
  assert.deepEqual(STAFF_ROLE_LABELS_AR, {
    super_admin: "مشرف رئيسي",
    operations: "عمليات",
    auditor: "مراجع",
  });
  assert.deepEqual(STAFF_ROLES_IN_ORDER, ["super_admin", "operations", "auditor"]);
  assert.equal(LAST_SUPER_ADMIN_AR, "لا يمكن إزالة آخر مشرف رئيسي");
  assert.equal(OWN_ROLE_AR, "لا يمكنك تغيير دورك");
  for (const s of [INVALID_STAFF_ROLE_AR, NOT_STAFF_AR, STAFF_ROLES_NOT_READY_AR]) {
    assert.match(s, /[؀-ۿ]/, "every refusal is Arabic");
  }
});

test("the labels cannot be changed at runtime", () => {
  assert.ok(Object.isFrozen(STAFF_ROLE_LABELS_AR));
  assert.ok(Object.isFrozen(STAFF_ROLES_IN_ORDER));
});

test("canRemoveSuperAdmin: a super_admin may leave only while another one remains", () => {
  assert.equal(canRemoveSuperAdmin({ targetRole: "super_admin", superAdminCount: 1 }), false);
  assert.equal(canRemoveSuperAdmin({ targetRole: "super_admin", superAdminCount: 0 }), false);
  assert.equal(canRemoveSuperAdmin({ targetRole: "super_admin", superAdminCount: 2 }), true);
  assert.equal(canRemoveSuperAdmin({ targetRole: "super_admin", superAdminCount: 5 }), true);
});

test("canRemoveSuperAdmin: anyone who is not a super_admin may always leave", () => {
  for (const targetRole of ["operations", "auditor", null] as const) {
    for (const superAdminCount of [0, 1, 2]) {
      assert.equal(canRemoveSuperAdmin({ targetRole, superAdminCount }), true, `${targetRole}/${superAdminCount}`);
    }
  }
});

test("canRemoveSuperAdmin fails closed on a count that is not a whole number", () => {
  for (const superAdminCount of [Number.NaN, 1.5, Number.POSITIVE_INFINITY, -3]) {
    assert.equal(canRemoveSuperAdmin({ targetRole: "super_admin", superAdminCount }), false, String(superAdminCount));
  }
});

test("effectiveRemovedRole: a change removes a super_admin only when the target is an admin and the next role is not super_admin", () => {
  // demotion of an admin super_admin
  assert.equal(effectiveRemovedRole({ previousRole: "super_admin", targetIsAdmin: true, nextRole: "operations" }), "super_admin");
  // leaving staff altogether (account type change, deletion)
  assert.equal(effectiveRemovedRole({ previousRole: "super_admin", targetIsAdmin: true, nextRole: null }), "super_admin");
  // staying super_admin
  assert.equal(effectiveRemovedRole({ previousRole: "super_admin", targetIsAdmin: true, nextRole: "super_admin" }), null);
  // a leftover row of an account that is no longer an admin grants nothing
  assert.equal(effectiveRemovedRole({ previousRole: "super_admin", targetIsAdmin: false, nextRole: "operations" }), null);
  // nobody to count for anyone else
  assert.equal(effectiveRemovedRole({ previousRole: "operations", targetIsAdmin: true, nextRole: "auditor" }), "operations");
  assert.equal(effectiveRemovedRole({ previousRole: null, targetIsAdmin: true, nextRole: null }), null);
});

test("the invite's role: absent means operations; anything outside the three is refused", () => {
  assert.equal(DEFAULT_INVITE_ROLE, "operations");
  assert.equal(inviteStaffRole(undefined), "operations");
  assert.equal(inviteStaffRole(null), "operations");
  assert.equal(inviteStaffRole(""), "operations");
  assert.equal(inviteStaffRole("super_admin"), "super_admin");
  assert.equal(inviteStaffRole("auditor"), "auditor");
  for (const bad of ["admin", "Super_Admin", " operations", 1, {}, "constructor"]) {
    assert.equal(inviteStaffRole(bad), null, String(bad));
  }
});

test("isSameAccount compares UUIDs case-insensitively", () => {
  assert.equal(isSameAccount("AbC-1", "abc-1"), true);
  assert.equal(isSameAccount("abc-1", "abc-2"), false);
});

// ─── 2. Source pins ───────────────────────────────────────────────────────────

function codeOnly(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("//");
    })
    .join("\n");
}

const read = (rel: string) => codeOnly(readFileSync(join(SRC, ...rel.split("/")), "utf8"));

function handler(rel: string, method: string): string {
  const code = read(rel);
  const start = code.indexOf(`export async function ${method}(`);
  assert.ok(start > -1, `${rel} has no ${method} handler`);
  const next = code.indexOf("\nexport ", start + 1);
  return code.slice(start, next === -1 ? code.length : next);
}

const TEAMS = "app/api/v1/admin/teams/route.ts";
const USERS = "app/api/v1/admin/users/[id]/route.ts";

/** The 400 answer for one refusal constant, e.g. `{ error: OWN_ROLE_AR }, { status: 400 }`. */
const refusal400 = (name: string) => `NextResponse.json({ error: ${name} }, { status: 400 })`;

test("teams PATCH { userId, staffRole }: gate, then the refusals, then the upsert, then the audit row", () => {
  const body = handler(TEAMS, "PATCH");
  const gateAt = body.indexOf('await requireStaff("staff.manage")');
  const roleBranchAt = body.indexOf('"staffRole" in');
  const invalidAt = body.indexOf(refusal400("INVALID_STAFF_ROLE_AR"));
  const ownAt = body.indexOf(refusal400("OWN_ROLE_AR"));
  const notStaffAt = body.indexOf(refusal400("NOT_STAFF_AR"));
  const lastAt = body.indexOf("checkStaffRoleChange(");
  const upsertAt = body.indexOf('.from("platform_staff")');
  const logAt = body.indexOf('action: "staff_role_updated"');

  assert.ok(gateAt > -1, "the staff.manage gate stays");
  assert.ok(roleBranchAt > gateAt, "a body with staffRole takes the role branch, after the gate");
  assert.ok(invalidAt > roleBranchAt, "a role outside the three is a 400");
  assert.ok(ownAt > invalidAt, "changing your own role is a 400 «لا يمكنك تغيير دورك»");
  const ownGuard = body.slice(body.lastIndexOf("if (", ownAt), ownAt);
  assert.ok(ownGuard.includes("isSameAccount(targetId, gate.userId)"), "the own-role refusal compares with the caller");
  assert.ok(notStaffAt > ownAt, "a target who is not an admin gets no role (no dormant row)");
  assert.ok(lastAt > notStaffAt, "the last-super-admin rule runs before the write");
  assert.ok(upsertAt > lastAt, "the role is written only after every refusal");
  const write = body.slice(upsertAt, body.indexOf(";", upsertAt));
  assert.ok(write.includes(".upsert("), "the role is upserted");
  assert.ok(write.includes("staff_role: nextRole"), "the explicit role is written");
  assert.ok(write.includes("granted_by: gate.userId"), "the granting super admin is recorded");
  assert.ok(write.includes('onConflict: "user_id"'), "one row per member, replaced");
  assert.ok(logAt > upsertAt, "the audit row comes after the write");
  const log = body.slice(logAt, body.indexOf("});", logAt));
  assert.ok(log.includes("before: { staff_role: previousRole }"), "the audit row records the role before");
  assert.ok(log.includes("after: { staff_role: nextRole }"), "and after");
});

test("teams PATCH: the last super_admin's refusal comes from checkStaffRoleChange as a 400/503", () => {
  const body = handler(TEAMS, "PATCH");
  const at = body.indexOf("checkStaffRoleChange(");
  const call = body.slice(at, body.indexOf(";", at));
  assert.ok(call.includes("targetIsAdmin: true"), "the target is an admin here (checked above)");
  assert.ok(call.includes("nextRole"), "the next role decides whether a super_admin leaves");
  assert.ok(
    body.includes("NextResponse.json({ error: change.error }, { status: change.status })"),
    "the helper's refusal is answered as given",
  );
  const helper = read("lib/auth/platformStaffServer.ts");
  assert.ok(helper.includes("LAST_SUPER_ADMIN_AR"), "the helper refuses with «لا يمكن إزالة آخر مشرف رئيسي»");
  assert.ok(helper.includes("status: 400"), "as a 400");
  assert.ok(helper.includes("canRemoveSuperAdmin("), "through the pure rule");
  assert.ok(helper.includes('.eq("user_type", "admin")'), "counting only super admins who are still admins");
});

test("teams PATCH keeps TeamTab's { id, status } label update", () => {
  const body = handler(TEAMS, "PATCH");
  assert.ok(body.includes('action: "staff_member_status_updated"'));
  assert.ok(body.includes("const { id, status } = parsed"), "the status branch still reads id and status");
});

test("teams POST: the invite writes an explicit role row, never leaves an old one", () => {
  const body = handler(TEAMS, "POST");
  const roleAt = body.indexOf("inviteStaffRole(");
  const createAt = body.indexOf("auth.admin.createUser(");
  const ownAt = body.indexOf(refusal400("OWN_ROLE_AR"));
  const checkAt = body.indexOf("checkStaffRoleChange(");
  const staffWriteAt = body.indexOf('.from("platform_staff")');
  const profileWriteAt = body.indexOf('.from("profiles")\n      .upsert(');
  const logAt = body.indexOf("logAdminAction(");

  assert.ok(roleAt > -1 && roleAt < createAt, "the role is validated before any write");
  assert.ok(body.includes(refusal400("INVALID_STAFF_ROLE_AR")), "an invalid role is a 400");
  assert.ok(ownAt > createAt && ownAt < staffWriteAt, "inviting yourself cannot change your own role");
  assert.ok(checkAt > ownAt && checkAt < staffWriteAt, "re-inviting the last super_admin cannot demote them");
  assert.ok(staffWriteAt > -1, "a platform_staff row is written");
  const write = body.slice(staffWriteAt, body.indexOf(";", staffWriteAt));
  assert.ok(write.includes(".upsert("), "upserted, so an old row is replaced");
  assert.ok(write.includes("staff_role: staffRole"), "with the invite's role");
  assert.ok(profileWriteAt > staffWriteAt, "the role row is written before the account becomes an admin");
  assert.ok(logAt > profileWriteAt, "then the audit row");
  const log = body.slice(logAt, body.indexOf("});", logAt));
  assert.ok(log.includes("before: { user_type: previousUserType, staff_role: previousRole }"), "before: the old type and role");
  assert.ok(/after: \{[^}]*staff_role:/.test(log), "after: the role given");
});

test("teams GET returns each member's staffRole and whether roles are live", () => {
  const body = handler(TEAMS, "GET");
  assert.ok(body.includes("readStaffRolesOf("), "the roles are read with the members");
  assert.ok(body.includes("staffRole:"), "each member carries staffRole");
  assert.ok(body.includes("staffRolesReady"), "the page can tell 'not migrated yet' from 'no row'");
});

test("users DELETE: the last super_admin cannot be deleted", () => {
  const body = handler(USERS, "DELETE");
  const selfAt = body.indexOf('"لا يمكنك حذف حسابك من لوحة الإدارة"');
  const checkAt = body.indexOf("checkStaffRoleChange(");
  const deleteAt = body.indexOf("auth.admin.deleteUser(");
  assert.ok(checkAt > selfAt && checkAt < deleteAt, "self refusal, then the last-super-admin rule, then the delete");
  const call = body.slice(checkAt, body.indexOf(";", checkAt));
  assert.ok(call.includes("nextRole: null"), "a deleted account leaves staff");
  assert.ok(call.includes("targetIsAdmin: true"), "the target is an admin here");
  const guard = body.slice(body.lastIndexOf("if (", checkAt), checkAt);
  assert.ok(guard.includes('target?.user_type === "admin"'), "only an admin is checked: deleting anyone else reads no role");
  assert.ok(body.includes("NextResponse.json({ error: change.error }, { status: change.status })"));
});

test("users PATCH: demoting an admin checks the rule first and removes the role row after", () => {
  const body = handler(USERS, "PATCH");
  const checkAt = body.indexOf("checkStaffRoleChange(");
  const updateAt = body.indexOf(".update(updateData)");
  const removeAt = body.indexOf('.from("platform_staff")');
  assert.ok(checkAt > -1 && checkAt < updateAt, "the rule runs before the profile write");
  const call = body.slice(checkAt, body.indexOf(";", checkAt));
  assert.ok(call.includes("nextRole: null"), "a demoted admin leaves staff");
  assert.ok(removeAt > updateAt, "the row is removed only after the demotion is written");
  const removal = body.slice(removeAt, body.indexOf(";", removeAt));
  assert.ok(removal.includes(".delete()") && removal.includes('.eq("user_id", userId)'), "their own row only");
  assert.ok(body.includes("before.staff_role = "), "the audit row records the role removed");
});

test("the team page: a selector for super admins only, the API's error text on refusal", () => {
  const page = read("app/dashboard/admin/team/page.tsx");
  assert.ok(page.includes('staffRole === "super_admin"'), "only a super admin gets the selector");
  assert.ok(page.includes("STAFF_ROLE_LABELS_AR"), "the three Arabic labels");
  assert.ok(page.includes('method: "PATCH"'), "the selector PATCHes the teams route");
  assert.ok(page.includes("JSON.stringify({ userId: member.id, staffRole: next })"));
  assert.ok(page.includes("apiErrorText("), "a refusal shows the API's own message");
  assert.equal(page.includes("لا توجد مستويات صلاحية"), false, "the old 'no permission levels' claim is gone");
});

test("the users pages show the API's own refusal text, and hide delete from roles that may not", () => {
  const list = read("app/dashboard/admin/users/page.tsx");
  assert.ok(list.includes("apiErrorText("), "the list's actions surface the API's refusal");
  assert.ok(list.includes('staffMaySee(staffRole, "users.delete")'), "no delete affordance for a role that may not");
  const detail = read("app/dashboard/admin/users/[id]/page.tsx");
  assert.ok(detail.includes("apiErrorText("), "the detail page surfaces it too");
});

test("no admin screen still claims every admin has full, undivided authority", () => {
  for (const rel of [
    "app/dashboard/admin/team/page.tsx",
    "app/dashboard/admin/users/roles/page.tsx",
    "app/dashboard/admin/tabs/TeamTab.tsx",
    "constants/adminBackendReadiness.ts",
  ]) {
    const code = read(rel);
    for (const claim of ["لا توجد مستويات صلاحية", "لا توجد في المنصة مستويات", "صلاحية إدارية كاملة على المنصة", "غير مُجزّأة"]) {
      assert.equal(code.includes(claim), false, `${rel}: «${claim}»`);
    }
  }
});
