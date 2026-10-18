/**
 * The pure half of requireStaff() (src/lib/access-control.ts), owner answer
 * ٢١٠: may this admin perform this staff action?
 *
 * Pure, with only a relative import, so `node --test` can load it
 * (src/lib/auth/adminRouteGates.test.ts executes it).
 */
import { staffCan, toStaffRole, type StaffAction, type StaffRole } from "./staffRoles.ts";

/** The 403 a refused staff role gets (Task 3.3 brief, verbatim). */
export const STAFF_ONLY_AR = "هذا الإجراء لقيادة المنصة فقط";

export interface StaffDecisionInput {
  /** requireAdmin() said yes: signed in and profiles.user_type = 'admin'. */
  isAdmin: boolean;
  /**
   * platform_staff.staff_role as read for this admin, or null when there is no
   * row (or it could not be read). Anything outside the three roles reads as
   * auditor.
   */
  role: unknown;
  /** platform_staff does not exist yet: 20261019_30 has not run here. */
  tableMissing: boolean;
}

export type StaffDecision =
  | { allowed: true; role: StaffRole }
  | { allowed: false; role: StaffRole | null };

/**
 * - A non-admin is refused everything, whatever the table or a leftover row
 *   says (a staff role holds only while the account is an admin).
 * - Table missing (the migration has not run): today's rule, so every admin
 *   may do everything, as super_admin. That is no wider than production
 *   today, and a wrong run order cannot 403 every admin action.
 * - Otherwise the row's role decides through the matrix; no row, or a value
 *   outside the union, is an auditor (fail-closed).
 */
export function staffDecision(input: StaffDecisionInput, action: StaffAction): StaffDecision {
  if (input.isAdmin !== true) return { allowed: false, role: null };
  if (input.tableMissing === true) return { allowed: true, role: "super_admin" };
  const role = toStaffRole(input.role) ?? "auditor";
  return staffCan(role, action) ? { allowed: true, role } : { allowed: false, role };
}

/**
 * PostgREST/Postgres codes meaning "public.platform_staff is not there yet":
 * the relation is missing (42P01) or not in PostgREST's schema cache
 * (PGRST205).
 */
export function isMissingStaffTable(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205";
}

/**
 * The staff actions one PATCH /api/v1/admin/users/[id] body needs, in a fixed
 * order without repeats. Each field the route writes needs its own action:
 *   user_type        → users.change_type
 *   metadata         → users.change_type (editing the account record)
 *   status suspended → users.suspend
 *   verified         → verifications.decide
 * A body with none of them needs nothing — and the route writes nothing.
 */
export function usersPatchActions(body: unknown): StaffAction[] {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return [];
  const b = body as Record<string, unknown>;
  const actions: StaffAction[] = [];
  if (b.user_type !== undefined || b.metadata !== undefined) actions.push("users.change_type");
  if (b.status === "suspended") actions.push("users.suspend");
  if (b.verified !== undefined) actions.push("verifications.decide");
  return actions;
}
