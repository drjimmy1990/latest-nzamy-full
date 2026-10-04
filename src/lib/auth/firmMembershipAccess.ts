import type { SupabaseClient } from "@supabase/supabase-js";

export const FIRM_TEAM_VIEW_ROLES = new Set([
  "managing_partner",
  "office_admin",
  "hr_manager",
]);

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
