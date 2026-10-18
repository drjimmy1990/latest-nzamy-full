/**
 * Staff role management (owner answer ٢١٠, Task 3.4): the pure rules shared by
 * the teams route, the users routes and the team page.
 *
 * A super admin gives each staff member one of three roles (platform_staff,
 * 20261019_30). Two rules keep the console reachable:
 *   - nobody changes their own role (a super admin cannot lock themselves out
 *     by mistake, and nobody can promote themselves);
 *   - the last super admin cannot be removed — not demoted, not turned into
 *     another account type, not deleted. That also keeps platform_staff
 *     non-empty, so a re-run of 20261019_30 (its backfill runs only while the
 *     table is empty) never promotes anyone again.
 *
 * Pure, with only a relative import, so `node --test` can load it
 * (./staffManagement.test.ts executes it).
 */
import { toStaffRole, type StaffRole } from "./staffRoles.ts";

/** The three roles in the order the team page lists them. */
export const STAFF_ROLES_IN_ORDER: readonly StaffRole[] = Object.freeze([
  "super_admin",
  "operations",
  "auditor",
] as const);

/** The Arabic label of each role (controller ruling 6, verbatim). */
export const STAFF_ROLE_LABELS_AR: Readonly<Record<StaffRole, string>> = Object.freeze({
  super_admin: "مشرف رئيسي",
  operations: "عمليات",
  auditor: "مراجع",
});

/**
 * What each role may do in the admin console, in a sentence, as
 * src/lib/auth/staffRoles.ts STAFF_MATRIX grants it.
 */
export const STAFF_ROLE_SUMMARY_AR: Readonly<Record<StaffRole, string>> = Object.freeze({
  super_admin: "كل إجراءات لوحة الإدارة، ومنها إدارة الفريق والإعدادات والأسعار وحذف المستخدمين.",
  operations: "العمل اليومي: طلبات الخدمات، التحقق من المزودين، الإشراف على المجتمع، تذاكر الدعم، والبتّ في طلبات الترقية.",
  auditor: "الاطلاع فقط، دون أي تعديل.",
});

/** The role an invite gives when the body names none (controller ruling 1). */
export const DEFAULT_INVITE_ROLE: StaffRole = "operations";

/** 400: the change would leave the platform with no super admin. */
export const LAST_SUPER_ADMIN_AR = "لا يمكن إزالة آخر مشرف رئيسي";
/** 400: an admin tried to change their own role. */
export const OWN_ROLE_AR = "لا يمكنك تغيير دورك";
/** 400: a staffRole outside the three. */
export const INVALID_STAFF_ROLE_AR = "الدور غير صالح";
/** 400: a role was set on an account that is not an admin. */
export const NOT_STAFF_AR = "الأدوار تُمنح لأعضاء فريق نظامي فقط";
/** 503: public.platform_staff does not exist yet (20261019_30 not applied). */
export const STAFF_ROLES_NOT_READY_AR = "أدوار الفريق تعمل بعد تطبيق تحديث قاعدة البيانات";

/**
 * May this account leave the super_admin set? Only while another super admin
 * remains. Anyone who is not a super admin may always leave. A count that is
 * not a whole number of at least zero fails closed.
 */
export function canRemoveSuperAdmin({
  targetRole,
  superAdminCount,
}: {
  targetRole: StaffRole | null;
  superAdminCount: number;
}): boolean {
  if (targetRole !== "super_admin") return true;
  return Number.isInteger(superAdminCount) && superAdminCount > 1;
}

/**
 * The role a change takes away, for the last-super-admin rule: the target's
 * current role, but only while the target is an admin (a demoted admin's
 * leftover row grants nothing — public.staff_role() ignores it) and only when
 * the next role differs. `nextRole` null means the target leaves staff
 * (account-type change or deletion).
 */
export function effectiveRemovedRole({
  previousRole,
  targetIsAdmin,
  nextRole,
}: {
  previousRole: StaffRole | null;
  targetIsAdmin: boolean;
  nextRole: StaffRole | null;
}): StaffRole | null {
  if (!targetIsAdmin || previousRole === null || previousRole === nextRole) return null;
  return previousRole;
}

/**
 * The role an invite gives: absent (undefined, null or "") is operations;
 * anything else must be one of the three exactly, or it is null (a 400).
 */
export function inviteStaffRole(v: unknown): StaffRole | null {
  if (v === undefined || v === null || v === "") return DEFAULT_INVITE_ROLE;
  return toStaffRole(v);
}

/** The same account? UUIDs compare case-insensitively. */
export function isSameAccount(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
