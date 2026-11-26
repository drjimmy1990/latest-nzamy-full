import type { SupabaseClient } from "@supabase/supabase-js";

export const FIRM_TEAM_VIEW_ROLES = new Set([
  "managing_partner",
  "office_admin",
  "hr_manager",
]);

/**
 * D-53 (batch l16, 20261206_70): who manages the firm's team besides the owner
 * account — an ACTIVE managing partner or HR manager. The database holds the
 * same list (public.firm_team_manager) and the same limits
 * (public.firm_members_manager_guard): only the owner grants, changes or
 * removes a managing partner; nobody but the owner touches the owner's row; a
 * manager never changes his own role.
 */
export const FIRM_TEAM_MANAGE_ROLES = new Set(["managing_partner", "hr_manager"]);

/** True for the owner account or an active team manager. */
export function canManageFirmTeam(firm: Pick<CallerFirm, "isOwner" | "role"> | null | undefined): boolean {
  return Boolean(firm && (firm.isOwner || FIRM_TEAM_MANAGE_ROLES.has(firm.role)));
}

export const FIRM_TEAM_MANAGERS_ONLY_AR = "إدارة أعضاء المكتب لصاحب المكتب والشريك المدير ومدير الموارد البشرية.";
export const FIRM_MANAGING_PARTNER_OWNER_ONLY_AR = "تعيين الشريك المدير أو تعديل دوره لصاحب المكتب وحده.";
export const FIRM_OWN_ROLE_AR = "لا يمكنك تعديل دورك أو عضويتك بنفسك؛ يعدّلها صاحب المكتب.";

/**
 * The refusal (Arabic) for a team write by `caller` on a membership, or null.
 * `target` is the existing row (null for a new invitation); `newRole` the role
 * being written (undefined when the role does not change).
 */
export function teamWriteRefusal(input: {
  caller: Pick<CallerFirm, "isOwner" | "role">;
  callerUserId: string;
  target: { userId: string; role: string } | null;
  newRole?: string;
}): string | null {
  const { caller, callerUserId, target, newRole } = input;
  if (caller.isOwner) return null;
  if (!FIRM_TEAM_MANAGE_ROLES.has(caller.role)) return FIRM_TEAM_MANAGERS_ONLY_AR;
  if (target && target.userId === callerUserId) return FIRM_OWN_ROLE_AR;
  if (newRole === "managing_partner" || target?.role === "managing_partner") return FIRM_MANAGING_PARTNER_OWNER_ONLY_AR;
  return null;
}

export interface CallerFirm {
  id: string;
  ownerUserId: string;
  role: string;
  isOwner: boolean;
}

interface MembershipReadError {
  message: string;
  code?: string;
}

/** Resolves the caller's own firm or their first active firm membership. */
export async function resolveCallerFirm(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ data: CallerFirm | null; error: MembershipReadError | null }> {
  const owned = await supabase
    .from("firm_profiles")
    .select("id, owner_user_id")
    .eq("owner_user_id", userId)
    .limit(1)
    .maybeSingle();
  if (owned.error) return { data: null, error: owned.error };
  if (owned.data) {
    return {
      data: {
        id: owned.data.id as string,
        ownerUserId: owned.data.owner_user_id as string,
        role: "managing_partner",
        isOwner: true,
      },
      error: null,
    };
  }

  const membership = await supabase
    .from("firm_members")
    .select("firm_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membership.error) return { data: null, error: membership.error };
  if (!membership.data) return { data: null, error: null };

  const firm = await supabase
    .from("firm_profiles")
    .select("id, owner_user_id")
    .eq("id", membership.data.firm_id)
    .maybeSingle();
  if (firm.error) return { data: null, error: firm.error };
  if (!firm.data) return { data: null, error: null };

  return {
    data: {
      id: firm.data.id as string,
      ownerUserId: firm.data.owner_user_id as string,
      role: membership.data.role as string,
      isOwner: firm.data.owner_user_id === userId,
    },
    error: null,
  };
}
