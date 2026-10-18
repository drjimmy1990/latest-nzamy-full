/**
 * Server reads of public.platform_staff for staff role management (owner
 * answer ٢١٠, Task 3.4): a member's role, every member's role, how many super
 * admins remain, and the last-super-admin rule. The routes that change a role
 * (teams POST/PATCH) or remove an admin (users/[id] PATCH/DELETE) use it with
 * the service client; writes stay in the routes.
 *
 * Deploy order: before 20261019_30 runs the table is missing (42P01 /
 * PGRST205). Each read then answers "table_missing" — logged once per process
 * — and the caller keeps today's behaviour; nothing here ever throws.
 */
import type { createServiceClient } from "@/lib/supabase/server";
import { toStaffRole, type StaffRole } from "@/lib/auth/staffRoles";
import { STAFF_CHECK_UNAVAILABLE_AR, isMissingStaffTable } from "@/lib/auth/staffDecision";
import { LAST_SUPER_ADMIN_AR, canRemoveSuperAdmin, effectiveRemovedRole } from "@/lib/auth/staffManagement";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

const LOG = "[platformStaff]";
let tableMissingLogged = false;

function logTableMissing(): void {
  if (tableMissingLogged) return;
  tableMissingLogged = true;
  console.warn(`${LOG} public.platform_staff does not exist yet (20261019_30 not applied); staff roles cannot be read or set`);
}

export type StaffRoleRead =
  | { status: "ok"; role: StaffRole | null }
  | { status: "table_missing" }
  | { status: "failed" };

/** One member's platform_staff.staff_role (null: no row, or a value outside the three). */
export async function readStaffRoleOf(admin: ServiceClient, userId: string): Promise<StaffRoleRead> {
  try {
    const { data, error } = await admin
      .from("platform_staff")
      .select("staff_role")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      if (isMissingStaffTable(error.code)) {
        logTableMissing();
        return { status: "table_missing" };
      }
      console.error(`${LOG} reading a member's role failed:`, error.code, error.message);
      return { status: "failed" };
    }
    return { status: "ok", role: toStaffRole((data as { staff_role?: unknown } | null)?.staff_role) };
  } catch (err) {
    console.error(`${LOG} reading a member's role threw:`, err instanceof Error ? err.message : err);
    return { status: "failed" };
  }
}

export type StaffRolesRead =
  | { status: "ok"; roles: Map<string, StaffRole> }
  | { status: "table_missing" }
  | { status: "failed" };

/** The roles of these members; a member with no row is absent from the map. */
export async function readStaffRolesOf(admin: ServiceClient, userIds: string[]): Promise<StaffRolesRead> {
  if (userIds.length === 0) return { status: "ok", roles: new Map() };
  try {
    const { data, error } = await admin
      .from("platform_staff")
      .select("user_id, staff_role")
      .in("user_id", userIds);
    if (error) {
      if (isMissingStaffTable(error.code)) {
        logTableMissing();
        return { status: "table_missing" };
      }
      console.error(`${LOG} reading the team's roles failed:`, error.code, error.message);
      return { status: "failed" };
    }
    const roles = new Map<string, StaffRole>();
    for (const row of (data ?? []) as Array<{ user_id?: unknown; staff_role?: unknown }>) {
      const role = toStaffRole(row.staff_role);
      if (typeof row.user_id === "string" && role) roles.set(row.user_id, role);
    }
    return { status: "ok", roles };
  } catch (err) {
    console.error(`${LOG} reading the team's roles threw:`, err instanceof Error ? err.message : err);
    return { status: "failed" };
  }
}

/**
 * How many super admins are still admins: platform_staff rows with
 * staff_role 'super_admin' whose profiles.user_type is 'admin'. A demoted
 * admin's leftover row is not counted (public.staff_role() ignores it too).
 * Two queries, because platform_staff references auth.users, not profiles.
 * Null when either read fails — the caller refuses rather than guess.
 */
export async function countSuperAdmins(admin: ServiceClient): Promise<number | null> {
  try {
    const { data: rows, error } = await admin
      .from("platform_staff")
      .select("user_id")
      .eq("staff_role", "super_admin");
    if (error) {
      console.error(`${LOG} counting super admins failed:`, error.code, error.message);
      return null;
    }
    const ids = ((rows ?? []) as Array<{ user_id?: unknown }>)
      .map((r) => r.user_id)
      .filter((id): id is string => typeof id === "string");
    if (ids.length === 0) return 0;
    const { data: admins, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .in("id", ids)
      .eq("user_type", "admin");
    if (profileError) {
      console.error(`${LOG} counting super admins (profiles) failed:`, profileError.code, profileError.message);
      return null;
    }
    return (admins ?? []).length;
  } catch (err) {
    console.error(`${LOG} counting super admins threw:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export type StaffRoleChangeCheck =
  | { ok: true; previousRole: StaffRole | null; tableMissing: boolean }
  | { ok: false; status: 400 | 503; error: string };

/**
 * May the target's role change to `nextRole` (null: they leave staff — an
 * account-type change or a deletion)? Reads their current role and, when the
 * change would take a super admin away, refuses it while they are the last
 * one: 400 «لا يمكن إزالة آخر مشرف رئيسي». A read that fails is a 503, never a
 * guess. With the table missing the change is allowed (no role exists yet —
 * today's behaviour) and `tableMissing` says so.
 */
export async function checkStaffRoleChange(
  admin: ServiceClient,
  { targetId, targetIsAdmin, nextRole }: { targetId: string; targetIsAdmin: boolean; nextRole: StaffRole | null },
): Promise<StaffRoleChangeCheck> {
  const current = await readStaffRoleOf(admin, targetId);
  if (current.status === "table_missing") return { ok: true, previousRole: null, tableMissing: true };
  if (current.status === "failed") return { ok: false, status: 503, error: STAFF_CHECK_UNAVAILABLE_AR };

  const removed = effectiveRemovedRole({ previousRole: current.role, targetIsAdmin, nextRole });
  if (removed === "super_admin") {
    const superAdminCount = await countSuperAdmins(admin);
    if (superAdminCount === null) return { ok: false, status: 503, error: STAFF_CHECK_UNAVAILABLE_AR };
    if (!canRemoveSuperAdmin({ targetRole: removed, superAdminCount })) {
      return { ok: false, status: 400, error: LAST_SUPER_ADMIN_AR };
    }
  }
  return { ok: true, previousRole: current.role, tableMissing: false };
}
